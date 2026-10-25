use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use chrono::NaiveDate;
use rusqlite::limits::Limit;
use rusqlite::{
    Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior,
    params,
};
use serde_json::Value;
use uuid::Uuid;

use crate::config::{
    MAX_PARENT_DEPTH, MAX_RESTORE_BYTES, MAX_REVISION, MAX_WORKSPACE_BYTES,
    MAX_WORKSPACE_ROWS, PRODUCT_NAME, normalize_filter, normalize_preferences,
    normalize_settings,
};
use crate::file_safety;
use crate::model::{
    ChecklistItemRecord, LabelRecord, ProjectRecord, SavedFilterRecord,
    TaskRecord, TeamMemberRecord, WorkflowColumnRecord, WorkspaceSnapshot,
};

const RESTORE_VALIDATION_SECONDS: u64 = 30;
const REVISION_SCHEMA: &str = "CREATE TABLE workspace_revision (singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1), revision INTEGER NOT NULL CHECK (revision >= 0));";

const CURRENT_SCHEMA_VERSION: u32 = 1;
const INITIAL_MIGRATION: &str = include_str!("../migrations/0001_initial.sql");

#[derive(Clone, Debug)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn initialize(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            if fs::symlink_metadata(parent)
                .is_ok_and(|metadata| metadata.file_type().is_symlink())
            {
                return Err(
                    "The application-data folder cannot be a symbolic link."
                        .into(),
                );
            }
            fs::create_dir_all(parent).map_err(|error| {
                format!("Could not create local storage: {error}")
            })?;
            file_safety::make_private(parent, true)?;
        }
        file_safety::reject_link(&self.path)?;
        if !self.path.exists() {
            let mut options = fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            options.open(&self.path).map_err(|error| {
                format!("Could not create the database: {error}")
            })?;
        }
        file_safety::make_private(&self.path, false)?;
        let mut connection = self.connect()?;
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS schema_migrations (\
                 version INTEGER PRIMARY KEY NOT NULL, \
                 applied_at TEXT NOT NULL);",
            )
            .map_err(database_error)?;
        let version = connection
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get::<_, u32>(0),
            )
            .map_err(database_error)?;
        if version > CURRENT_SCHEMA_VERSION {
            return Err(format!(
                concat!(
                    "This database uses schema version {}, but this build ",
                    "supports only version {}."
                ),
                version, CURRENT_SCHEMA_VERSION
            ));
        }
        if version < 1 {
            let transaction =
                connection.transaction().map_err(database_error)?;
            transaction
                .execute_batch(INITIAL_MIGRATION)
                .map_err(|error| {
                    format!(
                        "Database migration 1 failed and was rolled back: \
                         {error}"
                    )
                })?;
            transaction
                .execute(
                    "INSERT INTO schema_migrations(version, applied_at) \
                     VALUES (?1, ?2)",
                    params![1, chrono::Utc::now().to_rfc3339()],
                )
                .map_err(database_error)?;
            transaction.commit().map_err(database_error)?;
        }
        if !has_revision_table(&connection)? {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            transaction
                .execute_batch(REVISION_SCHEMA)
                .map_err(database_error)?;
            transaction
                .execute("INSERT INTO workspace_revision VALUES (1, 0)", [])
                .map_err(database_error)?;
            transaction.commit().map_err(database_error)?;
        }
        read_revision(&connection)?;
        Ok(())
    }

    pub fn load(&self) -> Result<WorkspaceSnapshot, String> {
        let connection = self.connect()?;
        load_snapshot(&connection)
    }

    pub fn has_saved_workspace(&self) -> Result<bool, String> {
        let connection = self.connect()?;
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM workspace_preferences WHERE singleton = 1) \
                 OR EXISTS(SELECT 1 FROM projects) OR EXISTS(SELECT 1 FROM tasks) \
                 OR EXISTS(SELECT 1 FROM workflow_columns) OR EXISTS(SELECT 1 FROM labels) \
                 OR EXISTS(SELECT 1 FROM team_members) OR EXISTS(SELECT 1 FROM saved_filters) \
                 OR EXISTS(SELECT 1 FROM checklist_items) OR EXISTS(SELECT 1 FROM task_labels) \
                 OR EXISTS(SELECT 1 FROM task_dependencies)",
                [],
                |row| row.get(0),
            )
            .map_err(database_error)
    }

    pub fn save(&self, snapshot: &WorkspaceSnapshot) -> Result<u64, String> {
        validate_capacity(snapshot)?;
        let mut snapshot = snapshot.clone();
        normalize_fields(&mut snapshot)?;
        validate_capacity(&snapshot)?;
        validate_snapshot(&snapshot)?;
        let mut connection = self.connect()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        let revision = read_revision(&transaction)?;
        if snapshot.revision != revision {
            return Err("This workspace changed in another session. Export a recovery copy and reload before saving again.".into());
        }
        let next_revision = revision
            .checked_add(1)
            .filter(|value| *value <= MAX_REVISION)
            .ok_or(
                "Workspace revision limit reached. Export a recovery copy.",
            )?;
        transaction
            .execute("DELETE FROM projects", [])
            .map_err(database_error)?;
        transaction
            .execute("DELETE FROM workspace_preferences", [])
            .map_err(database_error)?;
        insert_projects(&transaction, &snapshot.projects)?;
        insert_columns(&transaction, &snapshot.columns)?;
        insert_labels(&transaction, &snapshot.labels)?;
        insert_members(&transaction, &snapshot.members)?;
        insert_tasks(&transaction, &snapshot.tasks)?;
        insert_saved_filters(&transaction, &snapshot.saved_filters)?;
        transaction
            .execute(
                "INSERT INTO workspace_preferences(\
                 singleton, preferences_json) VALUES (1, ?1)",
                [json_text(&snapshot.preferences)?],
            )
            .map_err(database_error)?;
        transaction.execute("UPDATE workspace_revision SET revision = ?1 WHERE singleton = 1", [next_revision as i64])
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
        Ok(next_revision)
    }

    /// Reject exports into application-owned storage.
    pub fn validate_destination(&self, path: &Path) -> Result<(), String> {
        let target = file_safety::destination(path)?;
        let storage = self
            .path
            .parent()
            .ok_or("Local storage has no folder.")?
            .canonicalize()
            .map_err(|error| format!("Could not inspect storage: {error}"))?;
        if target.starts_with(storage) {
            return Err(
                "Choose an export folder outside Trolley's local storage."
                    .into(),
            );
        }
        Ok(())
    }

    /// Capture and validate a restorable backup before replacing its target.
    pub fn backup(&self, destination: &Path) -> Result<(), String> {
        let staged = self.capture(destination)?;
        if staged
            .as_file()
            .metadata()
            .map_err(|error| error.to_string())?
            .len()
            > MAX_RESTORE_BYTES
        {
            return Err("This workspace exceeds the restore capacity. Export a raw recovery copy instead.".into());
        }
        let connection = validate_backup(staged.path())?;
        load_snapshot(&connection)?;
        drop(connection);
        file_safety::persist(staged, destination)
    }

    /// Archive original bytes and sidecars even when SQLite cannot read them.
    pub fn recover(&self, destination: &Path) -> Result<(), String> {
        if same_path(&self.path, destination) {
            return Err(
                "Choose a recovery path different from local storage.".into()
            );
        }
        let mut staged = file_safety::staging(destination)?;
        let mut archive = zip::ZipWriter::new(&mut staged);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o600);
        let started = Instant::now();
        let mut remaining = MAX_RESTORE_BYTES;
        for suffix in ["", "-wal", "-shm", "-journal"] {
            let mut path = self.path.as_os_str().to_os_string();
            path.push(suffix);
            let path = PathBuf::from(path);
            if !path.try_exists().map_err(|error| error.to_string())? {
                if suffix.is_empty() {
                    return Err(
                        "No existing database is available to preserve.".into(),
                    );
                }
                continue;
            }
            let mut input = file_safety::open_input(&path, remaining)?;
            archive
                .start_file(
                    format!("{}{}", crate::config::DATABASE_FILE, suffix),
                    options,
                )
                .map_err(|error| {
                    format!("Could not create the recovery archive: {error}")
                })?;
            let mut buffer = [0; 64 * 1024];
            loop {
                let count = input
                    .read(&mut buffer)
                    .map_err(|error| error.to_string())?;
                if count == 0 {
                    break;
                }
                remaining = remaining.checked_sub(count as u64)
                    .ok_or("Recovery data exceeds the 1 GiB archive limit. Preserve the data folder manually.")?;
                std::io::Write::write_all(&mut archive, &buffer[..count])
                    .map_err(|error| {
                        format!("Could not write the recovery archive: {error}")
                    })?;
                if started.elapsed()
                    > Duration::from_secs(RESTORE_VALIDATION_SECONDS)
                {
                    return Err("Recovery exceeded its operation budget. Retry a faster local destination or preserve the data folder manually.".into());
                }
            }
        }
        archive.finish().map_err(|error| {
            format!("Could not finish the recovery archive: {error}")
        })?;
        file_safety::persist(staged, destination)
    }

    fn capture(
        &self,
        destination: &Path,
    ) -> Result<tempfile::NamedTempFile, String> {
        if same_path(&self.path, destination) {
            return Err(
                "Choose a copy path different from the live database.".into()
            );
        }
        file_safety::reject_link(&self.path)?;
        let staged = file_safety::staging(destination)?;
        let source = Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(database_error)?;
        let pages: i64 = source
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .map_err(database_error)?;
        let page_size: i64 = source
            .query_row("PRAGMA page_size", [], |row| row.get(0))
            .map_err(database_error)?;
        if pages
            .checked_mul(page_size)
            .is_none_or(|bytes| bytes < 0 || bytes as u64 > MAX_RESTORE_BYTES)
        {
            return Err("The database exceeds the 1 GiB backup limit. Preserve the data folder manually.".into());
        }
        let mut target =
            Connection::open(staged.path()).map_err(database_error)?;
        let backup = rusqlite::backup::Backup::new(&source, &mut target)
            .map_err(database_error)?;
        let started = Instant::now();
        loop {
            match backup.step(128).map_err(database_error)? {
                rusqlite::backup::StepResult::Done => break,
                rusqlite::backup::StepResult::More => {}
                rusqlite::backup::StepResult::Busy
                | rusqlite::backup::StepResult::Locked => {
                    return Err(
                        "Local storage is busy; retry the recovery copy."
                            .into(),
                    );
                }
                _ => return Err("Could not complete the database copy.".into()),
            }
            if (backup.progress().pagecount as u64)
                .saturating_mul(page_size as u64)
                > MAX_RESTORE_BYTES
            {
                return Err("The database grew beyond the 1 GiB backup limit. Retry after closing other database tools.".into());
            }
            if started.elapsed()
                > Duration::from_secs(RESTORE_VALIDATION_SECONDS)
            {
                return Err("The database copy exceeded its operation budget. Retry on a faster local destination.".into());
            }
        }
        drop(backup);
        drop(target);
        Ok(staged)
    }

    /// Validate and normalize a backup before replacing live data.
    pub fn restore(&self, source: &Path) -> Result<WorkspaceSnapshot, String> {
        if same_path(&self.path, source) {
            return Err("Choose a backup other than the live database.".into());
        }
        let input = file_safety::open_input(source, MAX_RESTORE_BYTES)?;
        let mut staged = file_safety::staging(&self.path)?;
        let copied =
            std::io::copy(&mut input.take(MAX_RESTORE_BYTES + 1), &mut staged)
                .map_err(|error| {
                    format!("Could not stage the selected backup: {error}")
                })?;
        if copied > MAX_RESTORE_BYTES {
            return Err("The backup exceeds the 1 GiB restore limit.".into());
        }
        let connection = validate_backup(staged.path())
            .map_err(|error| format!("Restore rejected; previous workspace was kept unchanged: {error}"))?;
        let mut snapshot = load_snapshot(&connection)
            .and_then(|snapshot| {
                validate_snapshot(&snapshot)?;
                Ok(snapshot)
            }).map_err(|error| format!("Restore rejected; previous workspace was kept unchanged: {error}"))?;
        drop(connection);
        // Unreadable revision metadata is preserved in the recovery archive.
        let live_revision = self
            .connect()
            .and_then(|connection| read_revision(&connection))
            .unwrap_or(0);
        let clean = file_safety::staging(&self.path)?;
        let clean_database = Database::new(clean.path().to_path_buf());
        clean_database.initialize()?;
        snapshot.revision = 0;
        clean_database.save(&snapshot)?;
        let restored_revision = live_revision
            .checked_add(1)
            .filter(|value| *value <= MAX_REVISION)
            .ok_or(
                "Workspace revision limit reached. Export a recovery copy.",
            )?;
        clean_database.connect()?.execute(
            "UPDATE workspace_revision SET revision = ?1 WHERE singleton = 1",
            [restored_revision as i64],
        ).map_err(database_error)?;
        snapshot.revision = restored_revision;
        // Build the replacement before overwriting an earlier recovery archive.
        let safety = self.path.with_extension("before-restore.zip");
        self.recover(&safety)?;
        if let Ok(live) = self.connect() {
            let busy: i64 = live
                .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
                    row.get(0)
                })
                .map_err(database_error)?;
            if busy != 0 {
                return Err("Local storage is busy. Close other Trolley instances and retry restore.".into());
            }
        }
        remove_sqlite_sidecars(&self.path)?;
        file_safety::persist(clean, &self.path)?;
        Ok(snapshot)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn connect(&self) -> Result<Connection, String> {
        file_safety::reject_link(&self.path)?;
        let connection =
            Connection::open(&self.path).map_err(database_error)?;
        connection
            .set_limit(Limit::SQLITE_LIMIT_LENGTH, MAX_WORKSPACE_BYTES as i32)
            .map_err(database_error)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON; \
                 PRAGMA journal_mode = WAL; \
                 PRAGMA synchronous = FULL; \
                 PRAGMA secure_delete = ON; \
                 PRAGMA temp_store = MEMORY; \
                 PRAGMA busy_timeout = 5000;",
            )
            .map_err(database_error)?;
        Ok(connection)
    }
}

fn load_projects(
    connection: &Connection,
    tokens: &mut usize,
) -> Result<Vec<ProjectRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, color, icon, archived, created_at, updated_at, \
             sort_position, settings_json FROM projects \
             ORDER BY sort_position",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, bool>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, f64>(7)?,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(database_error)?;
    rows.map(|row| {
        let (
            id,
            name,
            color,
            icon,
            archived,
            created_at,
            updated_at,
            sort_position,
            settings_json,
        ) = row.map_err(database_error)?;
        Ok(ProjectRecord {
            id,
            name,
            color,
            icon,
            archived,
            created_at,
            updated_at,
            sort_position,
            settings: parse_json(&settings_json, tokens)?,
        })
    })
    .collect()
}

fn load_columns(
    connection: &Connection,
) -> Result<Vec<WorkflowColumnRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, name, color, icon, completed, task_limit, \
             collapsed, sort_position FROM workflow_columns \
             ORDER BY project_id, sort_position",
        )
        .map_err(database_error)?;
    statement
        .query_map([], |row| {
            Ok(WorkflowColumnRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                completed: row.get(5)?,
                limit: row.get(6)?,
                collapsed: row.get(7)?,
                sort_position: row.get(8)?,
            })
        })
        .map_err(database_error)?
        .map(|row| row.map_err(database_error))
        .collect()
}

fn load_labels(connection: &Connection) -> Result<Vec<LabelRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, name, color, icon, sort_position \
             FROM labels ORDER BY project_id, sort_position",
        )
        .map_err(database_error)?;
    statement
        .query_map([], |row| {
            Ok(LabelRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                icon: row.get(4)?,
                sort_position: row.get(5)?,
            })
        })
        .map_err(database_error)?
        .map(|row| row.map_err(database_error))
        .collect()
}

fn load_members(
    connection: &Connection,
) -> Result<Vec<TeamMemberRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, name, initials, color, sort_position \
             FROM team_members ORDER BY project_id, sort_position",
        )
        .map_err(database_error)?;
    statement
        .query_map([], |row| {
            Ok(TeamMemberRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                initials: row.get(3)?,
                color: row.get(4)?,
                sort_position: row.get(5)?,
            })
        })
        .map_err(database_error)?
        .map(|row| row.map_err(database_error))
        .collect()
}

fn load_tasks(connection: &Connection) -> Result<Vec<TaskRecord>, String> {
    let labels = load_task_label_ids(connection)?;
    let checklist = load_checklist_items(connection)?;
    let dependencies = load_dependency_ids(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, column_id, title, description, priority, \
             is_urgent, is_important, start_date, due_date, progress, \
             assignee_id, parent_id, estimated_hours, actual_hours, \
             milestone, notes, created_at, updated_at, completed, archived, \
             sort_position FROM tasks ORDER BY project_id, sort_position",
        )
        .map_err(database_error)?;
    statement
        .query_map([], |row| {
            let id = row.get::<_, String>(0)?;
            Ok(TaskRecord {
                label_ids: labels.get(&id).cloned().unwrap_or_default(),
                checklist: checklist.get(&id).cloned().unwrap_or_default(),
                dependency_ids: dependencies
                    .get(&id)
                    .cloned()
                    .unwrap_or_default(),
                id,
                project_id: row.get(1)?,
                column_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                priority: row.get(5)?,
                is_urgent: row.get(6)?,
                is_important: row.get(7)?,
                start_date: row.get(8)?,
                due_date: row.get(9)?,
                progress: row.get(10)?,
                assignee_id: row.get(11)?,
                parent_id: row.get(12)?,
                estimated_hours: row.get(13)?,
                actual_hours: row.get(14)?,
                milestone: row.get(15)?,
                notes: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
                completed: row.get(19)?,
                archived: row.get(20)?,
                sort_position: row.get(21)?,
            })
        })
        .map_err(database_error)?
        .map(|row| row.map_err(database_error))
        .collect()
}

fn load_task_label_ids(
    connection: &Connection,
) -> Result<HashMap<String, Vec<String>>, String> {
    let mut values = HashMap::<String, Vec<String>>::new();
    let mut statement = connection
        .prepare("SELECT task_id, label_id FROM task_labels ORDER BY task_id")
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(database_error)?;
    for row in rows {
        let (task_id, label_id) = row.map_err(database_error)?;
        values.entry(task_id).or_default().push(label_id);
    }
    Ok(values)
}

fn load_checklist_items(
    connection: &Connection,
) -> Result<HashMap<String, Vec<ChecklistItemRecord>>, String> {
    let mut values = HashMap::<String, Vec<ChecklistItemRecord>>::new();
    let mut statement = connection
        .prepare(
            "SELECT task_id, id, title, completed, sort_position \
             FROM checklist_items ORDER BY task_id, sort_position",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                ChecklistItemRecord {
                    id: row.get(1)?,
                    title: row.get(2)?,
                    completed: row.get(3)?,
                    sort_position: row.get(4)?,
                },
            ))
        })
        .map_err(database_error)?;
    for row in rows {
        let (task_id, item) = row.map_err(database_error)?;
        values.entry(task_id).or_default().push(item);
    }
    Ok(values)
}

fn load_dependency_ids(
    connection: &Connection,
) -> Result<HashMap<String, Vec<String>>, String> {
    let mut values = HashMap::<String, Vec<String>>::new();
    let mut statement = connection
        .prepare(
            "SELECT task_id, dependency_id FROM task_dependencies \
             ORDER BY task_id",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(database_error)?;
    for row in rows {
        let (task_id, dependency_id) = row.map_err(database_error)?;
        values.entry(task_id).or_default().push(dependency_id);
    }
    Ok(values)
}

fn load_saved_filters(
    connection: &Connection,
    tokens: &mut usize,
) -> Result<Vec<SavedFilterRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, name, filter_json, sort_position \
             FROM saved_filters ORDER BY project_id, sort_position",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, f64>(4)?,
            ))
        })
        .map_err(database_error)?;
    rows.map(|row| {
        let (id, project_id, name, filter_json, sort_position) =
            row.map_err(database_error)?;
        Ok(SavedFilterRecord {
            id,
            project_id,
            name,
            filter: parse_json(&filter_json, tokens)?,
            sort_position,
        })
    })
    .collect()
}

fn insert_projects(
    transaction: &Transaction<'_>,
    projects: &[ProjectRecord],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO projects(id, name, color, icon, archived, created_at, \
             updated_at, sort_position, settings_json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .map_err(database_error)?;
    for project in projects {
        statement
            .execute(params![
                project.id,
                project.name,
                project.color,
                project.icon,
                project.archived,
                project.created_at,
                project.updated_at,
                project.sort_position,
                json_text(&project.settings)?,
            ])
            .map_err(database_error)?;
    }
    Ok(())
}

fn insert_columns(
    transaction: &Transaction<'_>,
    columns: &[WorkflowColumnRecord],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO workflow_columns(\
             id, project_id, name, color, icon, completed, task_limit, \
             collapsed, sort_position) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .map_err(database_error)?;
    for column in columns {
        statement
            .execute(params![
                column.id,
                column.project_id,
                column.name,
                column.color,
                column.icon,
                column.completed,
                column.limit,
                column.collapsed,
                column.sort_position,
            ])
            .map_err(database_error)?;
    }
    Ok(())
}

fn insert_labels(
    transaction: &Transaction<'_>,
    labels: &[LabelRecord],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO labels(\
             id, project_id, name, color, icon, sort_position) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .map_err(database_error)?;
    for label in labels {
        statement
            .execute(params![
                label.id,
                label.project_id,
                label.name,
                label.color,
                label.icon,
                label.sort_position,
            ])
            .map_err(database_error)?;
    }
    Ok(())
}

fn insert_members(
    transaction: &Transaction<'_>,
    members: &[TeamMemberRecord],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO team_members(\
             id, project_id, name, initials, color, sort_position) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .map_err(database_error)?;
    for member in members {
        statement
            .execute(params![
                member.id,
                member.project_id,
                member.name,
                member.initials,
                member.color,
                member.sort_position,
            ])
            .map_err(database_error)?;
    }
    Ok(())
}

fn insert_tasks(
    transaction: &Transaction<'_>,
    tasks: &[TaskRecord],
) -> Result<(), String> {
    let mut task_statement = transaction
        .prepare_cached(
            "INSERT INTO tasks(\
             id, project_id, column_id, title, description, priority, \
             is_urgent, is_important, start_date, due_date, progress, \
             assignee_id, parent_id, estimated_hours, actual_hours, \
             milestone, notes, created_at, updated_at, completed, archived, \
             sort_position) VALUES (\
             ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, \
             ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        )
        .map_err(database_error)?;
    for task in tasks {
        task_statement
            .execute(params![
                task.id,
                task.project_id,
                task.column_id,
                task.title,
                task.description,
                task.priority,
                task.is_urgent,
                task.is_important,
                task.start_date,
                task.due_date,
                task.progress,
                task.assignee_id,
                task.parent_id,
                task.estimated_hours,
                task.actual_hours,
                task.milestone,
                task.notes,
                task.created_at,
                task.updated_at,
                task.completed,
                task.archived,
                task.sort_position,
            ])
            .map_err(database_error)?;
    }
    drop(task_statement);
    for task in tasks {
        for label_id in &task.label_ids {
            transaction
                .execute(
                    concat!(
                        "INSERT INTO task_labels(task_id, label_id) ",
                        "VALUES (?1, ?2)"
                    ),
                    params![task.id, label_id],
                )
                .map_err(database_error)?;
        }
        for item in &task.checklist {
            transaction
                .execute(
                    "INSERT INTO checklist_items(\
                     id, task_id, title, completed, sort_position) \
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        item.id,
                        task.id,
                        item.title,
                        item.completed,
                        item.sort_position,
                    ],
                )
                .map_err(database_error)?;
        }
        for dependency_id in &task.dependency_ids {
            transaction
                .execute(
                    "INSERT INTO task_dependencies(task_id, dependency_id) \
                     VALUES (?1, ?2)",
                    params![task.id, dependency_id],
                )
                .map_err(database_error)?;
        }
    }
    Ok(())
}

fn insert_saved_filters(
    transaction: &Transaction<'_>,
    filters: &[SavedFilterRecord],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO saved_filters(\
             id, project_id, name, filter_json, sort_position) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(database_error)?;
    for filter in filters {
        statement
            .execute(params![
                filter.id,
                filter.project_id,
                filter.name,
                json_text(&filter.filter)?,
                filter.sort_position,
            ])
            .map_err(database_error)?;
    }
    Ok(())
}

fn validate_snapshot(snapshot: &WorkspaceSnapshot) -> Result<(), String> {
    if snapshot.revision > MAX_REVISION {
        return Err("Workspace revision is invalid.".into());
    }
    if snapshot.schema_version != CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "Workspace schema version {} is unsupported.",
            snapshot.schema_version
        ));
    }
    let positions = snapshot
        .projects
        .iter()
        .map(|item| item.sort_position)
        .chain(snapshot.columns.iter().map(|item| item.sort_position))
        .chain(snapshot.labels.iter().map(|item| item.sort_position))
        .chain(snapshot.members.iter().map(|item| item.sort_position))
        .chain(snapshot.saved_filters.iter().map(|item| item.sort_position))
        .chain(snapshot.tasks.iter().map(|item| item.sort_position))
        .chain(snapshot.tasks.iter().flat_map(|task| {
            task.checklist.iter().map(|item| item.sort_position)
        }));
    if positions.into_iter().any(|position| !position.is_finite()) {
        return Err("Ordering positions must be finite numbers.".into());
    }
    let project_ids = validated_ids(
        snapshot.projects.iter().map(|project| project.id.as_str()),
        "project",
    )?;
    validated_ids(
        snapshot.columns.iter().map(|column| column.id.as_str()),
        "column",
    )?;
    validated_ids(
        snapshot.labels.iter().map(|label| label.id.as_str()),
        "label",
    )?;
    validated_ids(
        snapshot.members.iter().map(|member| member.id.as_str()),
        "team member",
    )?;
    validated_ids(snapshot.tasks.iter().map(|task| task.id.as_str()), "task")?;
    validated_ids(
        snapshot.tasks.iter().flat_map(|task| {
            task.checklist.iter().map(|item| item.id.as_str())
        }),
        "checklist item",
    )?;
    validated_ids(
        snapshot
            .saved_filters
            .iter()
            .map(|filter| filter.id.as_str()),
        "saved filter",
    )?;
    for project in &snapshot.projects {
        if project.name.trim().is_empty() {
            return Err("A project name cannot be empty.".to_string());
        }
    }
    for column in &snapshot.columns {
        if !project_ids.contains(&column.project_id) {
            return Err(format!(
                "Column '{}' refers to a missing project.",
                column.name
            ));
        }
        if column.name.trim().is_empty() {
            return Err("A workflow column name cannot be empty.".to_string());
        }
        if column.limit.is_some_and(|limit| limit < 1) {
            return Err(format!(
                "Workflow column '{}' has an invalid task limit.",
                column.name
            ));
        }
    }
    for label in &snapshot.labels {
        if label.name.trim().is_empty() {
            return Err("A label name cannot be empty.".into());
        }
        if !project_ids.contains(&label.project_id) {
            return Err(format!(
                "Label '{}' refers to a missing project.",
                label.name
            ));
        }
    }
    for member in &snapshot.members {
        if member.name.trim().is_empty() {
            return Err("A team member name cannot be empty.".into());
        }
        if !project_ids.contains(&member.project_id) {
            return Err(format!(
                "Team member '{}' refers to a missing project.",
                member.name
            ));
        }
    }
    let column_projects = snapshot
        .columns
        .iter()
        .map(|column| (column.id.as_str(), column.project_id.as_str()))
        .collect::<HashMap<_, _>>();
    let label_projects = snapshot
        .labels
        .iter()
        .map(|label| (label.id.as_str(), label.project_id.as_str()))
        .collect::<HashMap<_, _>>();
    let member_projects = snapshot
        .members
        .iter()
        .map(|member| (member.id.as_str(), member.project_id.as_str()))
        .collect::<HashMap<_, _>>();
    let task_projects = snapshot
        .tasks
        .iter()
        .map(|task| (task.id.as_str(), task.project_id.as_str()))
        .collect::<HashMap<_, _>>();
    for task in &snapshot.tasks {
        validate_task(
            task,
            &project_ids,
            &column_projects,
            &label_projects,
            &member_projects,
            &task_projects,
        )?;
    }
    for filter in &snapshot.saved_filters {
        if filter.name.trim().is_empty() {
            return Err("A saved filter name cannot be empty.".into());
        }
        if !project_ids.contains(&filter.project_id) {
            return Err(format!(
                "Saved filter '{}' refers to a missing project.",
                filter.name
            ));
        }
    }
    validate_cycles(&snapshot.tasks)?;
    validate_parent_cycles(&snapshot.tasks)
}

fn validate_task(
    task: &TaskRecord,
    project_ids: &HashSet<String>,
    column_projects: &HashMap<&str, &str>,
    label_projects: &HashMap<&str, &str>,
    member_projects: &HashMap<&str, &str>,
    task_projects: &HashMap<&str, &str>,
) -> Result<(), String> {
    for hours in [task.estimated_hours, task.actual_hours]
        .into_iter()
        .flatten()
    {
        if !hours.is_finite() || hours < 0.0 {
            return Err("Task hours must be finite and nonnegative.".into());
        }
    }
    if task
        .checklist
        .iter()
        .any(|item| item.title.trim().is_empty())
    {
        return Err("A checklist item title cannot be empty.".into());
    }
    if task.title.trim().is_empty() {
        return Err("A task title cannot be empty.".to_string());
    }
    if !(1..=5).contains(&task.priority) {
        return Err(format!("Task '{}' has an invalid priority.", task.title));
    }
    if task.progress > 100 {
        return Err(format!("Task '{}' has invalid progress.", task.title));
    }
    if !project_ids.contains(&task.project_id)
        || column_projects.get(task.column_id.as_str())
            != Some(&task.project_id.as_str())
    {
        return Err(format!(
            "Task '{}' refers to a missing project or workflow column.",
            task.title
        ));
    }
    if let Some(member_id) = &task.assignee_id
        && member_projects.get(member_id.as_str())
            != Some(&task.project_id.as_str())
    {
        return Err(format!(
            "Task '{}' refers to a missing assignee.",
            task.title
        ));
    }
    if let Some(parent_id) = &task.parent_id
        && (task_projects.get(parent_id.as_str())
            != Some(&task.project_id.as_str())
            || parent_id == &task.id)
    {
        return Err(format!("Task '{}' has an invalid parent.", task.title));
    }
    if task.label_ids.iter().any(|id| {
        label_projects.get(id.as_str()) != Some(&task.project_id.as_str())
    }) {
        return Err(format!(
            "Task '{}' refers to a missing label.",
            task.title
        ));
    }
    if task.dependency_ids.iter().any(|id| {
        task_projects.get(id.as_str()) != Some(&task.project_id.as_str())
            || id == &task.id
    }) {
        return Err(format!(
            "Task '{}' has an invalid dependency.",
            task.title
        ));
    }
    validate_dates(task)
}

fn validate_dates(task: &TaskRecord) -> Result<(), String> {
    let parse = |value: &str| {
        let parsed =
            NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| {
                format!("Task '{}' has an invalid calendar date.", task.title)
            })?;
        if value.len() != 10
            || &value[..4] == "0000"
            || parsed.format("%Y-%m-%d").to_string() != value
        {
            return Err(format!(
                "Task '{}' needs dates in YYYY-MM-DD format.",
                task.title
            ));
        }
        Ok(parsed)
    };
    let start = task.start_date.as_deref().map(parse).transpose()?;
    let due = task.due_date.as_deref().map(parse).transpose()?;
    if let (Some(start), Some(due)) = (start, due)
        && due < start
    {
        return Err(format!("Task '{}' is due before it starts.", task.title));
    }
    Ok(())
}

fn validate_cycles(tasks: &[TaskRecord]) -> Result<(), String> {
    let mut incoming = HashMap::<&str, usize>::new();
    let mut dependents = HashMap::<&str, Vec<&str>>::new();
    for task in tasks {
        incoming.insert(&task.id, task.dependency_ids.len());
        for dependency_id in &task.dependency_ids {
            dependents.entry(dependency_id).or_default().push(&task.id);
        }
    }
    let mut ready = incoming
        .iter()
        .filter_map(|(id, count)| (*count == 0).then_some(*id))
        .collect::<VecDeque<_>>();
    let mut visited = 0;
    while let Some(id) = ready.pop_front() {
        visited += 1;
        for dependent_id in dependents.get(id).into_iter().flatten() {
            if let Some(count) = incoming.get_mut(dependent_id) {
                *count -= 1;
                if *count == 0 {
                    ready.push_back(dependent_id);
                }
            }
        }
    }
    if visited != tasks.len() {
        return Err("Task dependencies contain a cycle.".to_string());
    }
    Ok(())
}

fn validate_parent_cycles(tasks: &[TaskRecord]) -> Result<(), String> {
    let parents = tasks
        .iter()
        .map(|task| (task.id.as_str(), task.parent_id.as_deref()))
        .collect::<HashMap<_, _>>();
    let mut depths = HashMap::<&str, usize>::new();
    for task in tasks {
        if depths.contains_key(task.id.as_str()) {
            continue;
        }
        let mut path = Vec::new();
        let mut visiting = HashSet::new();
        let mut current = Some(task.id.as_str());
        let mut depth = 0;
        while let Some(id) = current {
            if let Some(known) = depths.get(id) {
                depth = *known;
                break;
            }
            if !visiting.insert(id) {
                return Err("Task hierarchy contains a cycle.".into());
            }
            path.push(id);
            if path.len() > MAX_PARENT_DEPTH {
                return Err(format!(
                    "Task hierarchy exceeds the {MAX_PARENT_DEPTH}-level limit."
                ));
            }
            current = parents.get(id).copied().flatten();
        }
        for id in path.into_iter().rev() {
            depth += 1;
            if depth > MAX_PARENT_DEPTH {
                return Err(format!(
                    "Task hierarchy exceeds the {MAX_PARENT_DEPTH}-level limit."
                ));
            }
            depths.insert(id, depth);
        }
    }
    Ok(())
}

fn validated_ids<'a>(
    values: impl Iterator<Item = &'a str>,
    entity: &str,
) -> Result<HashSet<String>, String> {
    let mut ids = HashSet::new();
    for value in values {
        Uuid::parse_str(value)
            .map_err(|_| format!("The {entity} id '{value}' is not a UUID."))?;
        if !ids.insert(value.to_string()) {
            return Err(format!("The {entity} id '{value}' is duplicated."));
        }
    }
    Ok(ids)
}

/// Load a snapshot from an already-open, bounded connection.
fn load_snapshot(connection: &Connection) -> Result<WorkspaceSnapshot, String> {
    validate_rows_and_relationships(connection)?;
    let mut tokens = 0;
    let projects = load_projects(connection, &mut tokens)?;
    let columns = load_columns(connection)?;
    let labels = load_labels(connection)?;
    let members = load_members(connection)?;
    let tasks = load_tasks(connection)?;
    let saved_filters = load_saved_filters(connection, &mut tokens)?;
    let preferences = connection
        .query_row(
            "SELECT preferences_json FROM workspace_preferences \
                 WHERE singleton = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(database_error)?
        .map(|text| parse_json(&text, &mut tokens))
        .transpose()?
        .unwrap_or_else(|| serde_json::json!({}));
    let mut snapshot = WorkspaceSnapshot {
        revision: read_revision(connection)?,
        schema_version: CURRENT_SCHEMA_VERSION,
        projects,
        columns,
        labels,
        members,
        tasks,
        saved_filters,
        preferences,
    };
    validate_capacity(&snapshot)?;
    normalize_fields(&mut snapshot)?;
    validate_capacity(&snapshot)?;
    validate_snapshot(&snapshot)?;
    Ok(snapshot)
}

fn has_revision_table(connection: &Connection) -> Result<bool, String> {
    connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'workspace_revision')", [], |row| row.get(0))
        .map_err(database_error)
}

fn read_revision(connection: &Connection) -> Result<u64, String> {
    if !has_revision_table(connection)? {
        return Ok(0);
    }
    let (count, revision): (i64, i64) = connection.query_row(
        "SELECT COUNT(*), COALESCE(MAX(revision), 0) FROM workspace_revision WHERE singleton = 1", [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(database_error)?;
    if count != 1 || revision < 0 || revision as u64 > MAX_REVISION {
        return Err("Workspace revision metadata is invalid.".into());
    }
    Ok(revision as u64)
}

fn normalize_fields(snapshot: &mut WorkspaceSnapshot) -> Result<(), String> {
    normalize_preferences(&mut snapshot.preferences)?;
    for project in &mut snapshot.projects {
        normalize_settings(&mut project.settings)?;
    }
    for filter in &mut snapshot.saved_filters {
        normalize_filter(&mut filter.filter)?;
    }
    Ok(())
}

fn validate_capacity(snapshot: &WorkspaceSnapshot) -> Result<(), String> {
    let rows = snapshot.projects.len()
        + snapshot.columns.len()
        + snapshot.labels.len()
        + snapshot.members.len()
        + snapshot.tasks.len()
        + snapshot.saved_filters.len()
        + snapshot
            .tasks
            .iter()
            .map(|task| {
                task.checklist.len()
                    + task.label_ids.len()
                    + task.dependency_ids.len()
            })
            .sum::<usize>();
    if rows > MAX_WORKSPACE_ROWS {
        return Err(format!(
            "Workspace exceeds the {MAX_WORKSPACE_ROWS}-record safety limit. Export a raw recovery copy before reducing its size."
        ));
    }
    let mut tokens = 0;
    for value in std::iter::once(&snapshot.preferences)
        .chain(snapshot.projects.iter().map(|project| &project.settings))
        .chain(snapshot.saved_filters.iter().map(|filter| &filter.filter))
    {
        let text = json_text(value)?;
        configuration_budget(&text, &mut tokens)?;
    }
    struct Counter(u64);
    impl std::io::Write for Counter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0 = self.0.saturating_add(bytes.len() as u64);
            if self.0 > MAX_WORKSPACE_BYTES {
                return Err(std::io::Error::other(
                    "Workspace exceeds the 256 MiB data limit. Export a raw recovery copy before reducing its size.",
                ));
            }
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    serde_json::to_writer(Counter(0), snapshot)
        .map_err(|error| error.to_string())
}

/// Compare complete schema definitions, including indexes and constraints.
fn schema_objects(
    connection: &Connection,
) -> Result<HashMap<String, String>, String> {
    let mut statement = connection.prepare(
        "SELECT type, name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
    ).map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                format!(
                    "{}:{}",
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?
                ),
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(database_error)?;
    rows.map(|row| row.map_err(database_error)).collect()
}

/// Reject oversized, unexpected, or resource-intensive backup databases.
fn validate_backup(path: &Path) -> Result<Connection, String> {
    let connection =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| {
                format!("The selected file is not a SQLite database: {error}")
            })?;
    for (limit, maximum) in [
        (Limit::SQLITE_LIMIT_LENGTH, MAX_WORKSPACE_BYTES as i32),
        (Limit::SQLITE_LIMIT_SQL_LENGTH, 256 * 1024),
        (Limit::SQLITE_LIMIT_ATTACHED, 0),
        (Limit::SQLITE_LIMIT_TRIGGER_DEPTH, 0),
    ] {
        connection
            .set_limit(limit, maximum)
            .map_err(database_error)?;
    }
    let started = Instant::now();
    connection
        .progress_handler(
            10_000,
            Some(move || {
                started.elapsed()
                    > Duration::from_secs(RESTORE_VALIDATION_SECONDS)
            }),
        )
        .map_err(database_error)?;
    let reference = Connection::open_in_memory().map_err(database_error)?;
    reference.execute_batch(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);",
    ).map_err(database_error)?;
    reference
        .execute_batch(INITIAL_MIGRATION)
        .map_err(database_error)?;
    let actual = schema_objects(&connection)?;
    let legacy = schema_objects(&reference)?;
    reference
        .execute_batch(REVISION_SCHEMA)
        .map_err(database_error)?;
    if actual != legacy && actual != schema_objects(&reference)? {
        return Err(format!(
            "The selected database is not a {PRODUCT_NAME} backup with the expected schema."
        ));
    }
    read_revision(&connection)?;
    let versions = connection
        .query_row(
            "SELECT CASE WHEN COUNT(*) = 1 AND MIN(version) = 1 \
             THEN 1 ELSE 0 END FROM schema_migrations",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(database_error)?;
    if versions != 1 {
        return Err(
            "The selected backup has an unsupported schema version.".into()
        );
    }
    let check: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(database_error)?;
    if check != "ok" {
        return Err("The selected backup failed its integrity check.".into());
    }
    validate_rows_and_relationships(&connection)?;
    Ok(connection)
}

fn validate_rows_and_relationships(
    connection: &Connection,
) -> Result<(), String> {
    let foreign_key_error = connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(database_error)?
        .exists([])
        .map_err(database_error)?;
    if foreign_key_error {
        return Err(
            "The workspace contains invalid foreign-key relationships.".into(),
        );
    }
    let mut count = 0;
    for table in [
        "projects",
        "workflow_columns",
        "labels",
        "team_members",
        "tasks",
        "task_labels",
        "checklist_items",
        "task_dependencies",
        "saved_filters",
    ] {
        // Names come from this static allowlist, never from backup contents.
        count += connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(database_error)?;
        if count > MAX_WORKSPACE_ROWS as i64 {
            return Err(format!(
                "The workspace exceeds the {MAX_WORKSPACE_ROWS}-record safety limit. Export a raw recovery copy."
            ));
        }
    }
    Ok(())
}

fn remove_sqlite_sidecars(path: &Path) -> Result<(), String> {
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = path.as_os_str().to_os_string();
        sidecar.push(suffix);
        let sidecar = PathBuf::from(sidecar);
        match fs::remove_file(&sidecar) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Could not clear a SQLite restore sidecar: {error}"
                ));
            }
        }
    }
    Ok(())
}

fn same_path(left: &Path, right: &Path) -> bool {
    left.canonicalize().ok() == right.canonicalize().ok()
        && left.canonicalize().is_ok()
}

/// Bound configuration allocation before parsing JSON into a value tree.
fn configuration_budget(text: &str, tokens: &mut usize) -> Result<(), String> {
    if text.len() > crate::config::MAX_CONFIGURATION_BYTES {
        return Err("Configuration exceeds the 20 MiB field limit. Export a raw recovery archive.".into());
    }
    let mut in_string = false;
    let mut escaped = false;
    *tokens += 1;
    for byte in text.bytes() {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_string = false;
            }
        } else if byte == b'"' {
            in_string = true;
        } else if matches!(byte, b'{' | b'[' | b',' | b':') {
            *tokens += 1;
        }
        if *tokens > crate::config::MAX_CONFIGURATION_TOKENS {
            return Err("Configuration exceeds the workspace structure limit. Export a raw recovery archive.".into());
        }
    }
    Ok(())
}

fn parse_json(text: &str, tokens: &mut usize) -> Result<Value, String> {
    configuration_budget(text, tokens)?;
    serde_json::from_str(text)
        .map_err(|error| format!("Stored JSON data is invalid: {error}"))
}

fn json_text(value: &Value) -> Result<String, String> {
    serde_json::to_string(value)
        .map_err(|error| format!("Could not serialize local settings: {error}"))
}

fn database_error(error: rusqlite::Error) -> String {
    format!("Local database operation failed: {error}")
}
