use serde_json::json;
use tempfile::tempdir;
use trolley_lib::database::Database;
use trolley_lib::model::{
    ChecklistItemRecord, ProjectRecord, TaskRecord, WorkflowColumnRecord,
    WorkspaceSnapshot,
};

fn empty_snapshot() -> WorkspaceSnapshot {
    WorkspaceSnapshot {
        revision: 0,
        schema_version: 1,
        projects: vec![],
        columns: vec![],
        labels: vec![],
        members: vec![],
        tasks: vec![],
        saved_filters: vec![],
        preferences: json!({
            "theme": "system",
            "density": "comfortable",
            "onboardingComplete": false,
            "lastProjectId": null,
        }),
    }
}

#[test]
fn applies_migrations_and_round_trips_a_workspace() {
    let directory = tempdir().expect("temporary directory should be created");
    let database = Database::new(directory.path().join("test.sqlite3"));
    database
        .initialize()
        .expect("database migrations should succeed");
    assert!(
        !database
            .has_saved_workspace()
            .expect("workspace state should be readable")
    );
    database
        .save(&empty_snapshot())
        .expect("empty workspace should save");
    assert!(
        database
            .has_saved_workspace()
            .expect("workspace state should be readable")
    );
    let loaded = database.load().expect("workspace should load");
    assert_eq!(loaded.schema_version, 1);
    assert_eq!(loaded.preferences["theme"], "system");
}

#[test]
fn round_trips_ordered_subtasks() {
    let directory = tempdir().expect("temporary directory should be created");
    let database = Database::new(directory.path().join("subtasks.sqlite3"));
    database.initialize().expect("database should initialize");
    let mut snapshot = empty_snapshot();
    snapshot.projects.push(ProjectRecord {
        id: "00000000-0000-4000-8000-000000000001".into(),
        name: "Sub-task project".into(),
        color: "#000000".into(),
        icon: None,
        archived: false,
        created_at: "2026-09-04T00:00:00Z".into(),
        updated_at: "2026-09-04T00:00:00Z".into(),
        sort_position: 0.0,
        settings: json!({}),
    });
    snapshot.columns.push(WorkflowColumnRecord {
        id: "00000000-0000-4000-8000-000000000011".into(),
        project_id: snapshot.projects[0].id.clone(),
        name: "Active".into(),
        color: "#000000".into(),
        icon: "CircleDot".into(),
        completed: false,
        limit: None,
        collapsed: false,
        sort_position: 0.0,
    });
    snapshot.tasks.push(TaskRecord {
        id: "00000000-0000-4000-8000-000000000021".into(),
        project_id: snapshot.projects[0].id.clone(),
        column_id: snapshot.columns[0].id.clone(),
        title: "Persist sub-tasks".into(),
        description: String::new(),
        priority: 1,
        is_urgent: false,
        is_important: false,
        start_date: None,
        due_date: None,
        progress: 50,
        label_ids: vec![],
        assignee_id: None,
        parent_id: None,
        checklist: vec![
            ChecklistItemRecord {
                id: "00000000-0000-4000-8000-000000000031".into(),
                title: "Describe the first step".into(),
                completed: true,
                sort_position: 0.0,
            },
            ChecklistItemRecord {
                id: "00000000-0000-4000-8000-000000000032".into(),
                title: "Describe the second step".into(),
                completed: false,
                sort_position: 1.0,
            },
        ],
        dependency_ids: vec![],
        estimated_hours: None,
        actual_hours: None,
        milestone: false,
        notes: String::new(),
        created_at: "2026-09-04T00:00:00Z".into(),
        updated_at: "2026-09-04T00:00:00Z".into(),
        completed: false,
        archived: false,
        sort_position: 0.0,
    });

    database.save(&snapshot).expect("workspace should save");
    let loaded = database.load().expect("workspace should load");
    let checklist = &loaded.tasks[0].checklist;

    assert_eq!(checklist.len(), 2);
    assert_eq!(checklist[0].title, "Describe the first step");
    assert!(checklist[0].completed);
    assert_eq!(checklist[1].sort_position, 1.0);
}

#[test]
fn rejects_a_newer_schema_without_modifying_it() {
    let directory = tempdir().expect("temporary directory should be created");
    let path = directory.path().join("future.sqlite3");
    let connection = rusqlite::Connection::open(&path)
        .expect("future database should be created");
    connection
        .execute_batch(
            "CREATE TABLE schema_migrations (\
             version INTEGER PRIMARY KEY NOT NULL, \
             applied_at TEXT NOT NULL); \
             INSERT INTO schema_migrations(version, applied_at) \
             VALUES (99, '2026-09-05T00:00:00Z');",
        )
        .expect("future migration record should be inserted");
    drop(connection);

    let database = Database::new(path.clone());
    let error = database
        .initialize()
        .expect_err("a newer schema should be rejected");
    assert!(error.contains("schema version 99"));
    let connection = rusqlite::Connection::open(path)
        .expect("future database should remain readable");
    let version: u32 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .expect("future migration record should remain unchanged");
    assert_eq!(version, 99);
}

#[test]
fn restore_rejects_an_unrelated_sqlite_file() {
    let directory = tempdir().expect("temporary directory should be created");
    let database = Database::new(directory.path().join("live.sqlite3"));
    database.initialize().expect("database should initialize");
    let unrelated_path = directory.path().join("unrelated.sqlite3");
    rusqlite::Connection::open(&unrelated_path)
        .expect("unrelated database should be created");
    let error = database
        .restore(&unrelated_path)
        .expect_err("unrelated database should not restore");
    assert!(error.contains("not a Trolley backup"));
}

#[test]
fn save_rejects_cross_project_task_references() {
    let directory = tempdir().expect("temporary directory should be created");
    let database = Database::new(directory.path().join("live.sqlite3"));
    database.initialize().expect("database should initialize");
    let snapshot = serde_json::from_value(json!({
        "schemaVersion": 1,
        "projects": [
            {
                "id": "00000000-0000-4000-8000-000000000001",
                "name": "First",
                "color": "#000000",
                "icon": null,
                "archived": false,
                "createdAt": "2026-09-04T00:00:00Z",
                "updatedAt": "2026-09-04T00:00:00Z",
                "sortPosition": 0,
                "settings": {}
            },
            {
                "id": "00000000-0000-4000-8000-000000000002",
                "name": "Second",
                "color": "#000000",
                "icon": null,
                "archived": false,
                "createdAt": "2026-09-04T00:00:00Z",
                "updatedAt": "2026-09-04T00:00:00Z",
                "sortPosition": 1,
                "settings": {}
            }
        ],
        "columns": [
            {
                "id": "00000000-0000-4000-8000-000000000011",
                "projectId": "00000000-0000-4000-8000-000000000001",
                "name": "First column",
                "color": "#000000",
                "icon": "CircleDot",
                "completed": false,
                "limit": null,
                "collapsed": false,
                "sortPosition": 0
            },
            {
                "id": "00000000-0000-4000-8000-000000000012",
                "projectId": "00000000-0000-4000-8000-000000000002",
                "name": "Second column",
                "color": "#000000",
                "icon": "CircleDot",
                "completed": false,
                "limit": null,
                "collapsed": false,
                "sortPosition": 0
            }
        ],
        "labels": [],
        "members": [],
        "tasks": [{
            "id": "00000000-0000-4000-8000-000000000021",
            "projectId": "00000000-0000-4000-8000-000000000001",
            "columnId": "00000000-0000-4000-8000-000000000012",
            "title": "Cross-project task",
            "description": "",
            "priority": 1,
            "isUrgent": false,
            "isImportant": false,
            "startDate": null,
            "dueDate": null,
            "progress": 0,
            "labelIds": [],
            "assigneeId": null,
            "parentId": null,
            "checklist": [],
            "dependencyIds": [],
            "estimatedHours": null,
            "actualHours": null,
            "milestone": false,
            "notes": "",
            "createdAt": "2026-09-04T00:00:00Z",
            "updatedAt": "2026-09-04T00:00:00Z",
            "completed": false,
            "archived": false,
            "sortPosition": 0
        }],
        "savedFilters": [],
        "preferences": {}
    }))
    .expect("test workspace should deserialize");
    let error = database
        .save(&snapshot)
        .expect_err("a cross-project column reference must be rejected");
    assert!(error.contains("missing project or workflow column"));
}

#[test]
fn restore_preserves_the_live_workspace_after_a_validation_failure() {
    let directory = tempdir().expect("temporary directory should be created");
    let database = Database::new(directory.path().join("live.sqlite3"));
    database.initialize().expect("database should initialize");
    database
        .save(&empty_snapshot())
        .expect("workspace should save");
    let invalid_backup = directory.path().join("invalid.sqlite3");
    database
        .backup(&invalid_backup)
        .expect("test backup should be created");
    let connection = rusqlite::Connection::open(&invalid_backup)
        .expect("test backup should open");
    connection
        .execute(
            "UPDATE workspace_preferences SET preferences_json = ?1",
            ["not-json"],
        )
        .expect("test backup should be corrupted at the data layer");
    drop(connection);

    let error = database
        .restore(&invalid_backup)
        .expect_err("invalid stored JSON should fail restore");
    assert!(error.contains("previous workspace was kept unchanged"));
    let recovered = database
        .load()
        .expect("the original workspace should remain readable");
    assert_eq!(recovered.preferences["theme"], "system");
}

#[test]
fn restores_valid_backups_and_keeps_previous_state() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let backup = folder.path().join("backup.sqlite3");
    database.backup(&backup).unwrap();
    let mut changed = database.load().unwrap();
    changed.preferences["theme"] = json!("dark");
    database.save(&changed).unwrap();
    let restored = database.restore(&backup).unwrap();
    assert_eq!(restored.preferences["theme"], "system");
    assert_eq!(database.load().unwrap().preferences["theme"], "system");
    let safety = database.path().with_extension("before-restore.zip");
    let recovered_path = folder.path().join("previous.sqlite3");
    std::fs::write(&recovered_path, recovery_bytes(&safety, "trolley.sqlite3"))
        .unwrap();
    assert_eq!(
        Database::new(recovered_path).load().unwrap().preferences["theme"],
        "dark"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for path in [database.path(), backup.as_path(), safety.as_path()] {
            assert_eq!(
                std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        assert_eq!(
            std::fs::metadata(folder.path())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
    }
}

#[test]
fn rejects_extra_schema_objects_and_migration_versions_before_restore() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let safety = database.path().with_extension("before-restore.zip");
    std::fs::write(&safety, b"existing recovery copy").unwrap();
    for sql in [
        "CREATE TRIGGER hostile AFTER INSERT ON projects BEGIN DELETE FROM tasks; END;",
        "CREATE VIEW unexpected AS SELECT * FROM projects;",
        "CREATE TRIGGER sqliteXhidden AFTER INSERT ON projects BEGIN DELETE FROM tasks; END;",
        "INSERT INTO schema_migrations VALUES (99, 'future');",
    ] {
        let backup = folder.path().join("hostile.sqlite3");
        database.backup(&backup).unwrap();
        rusqlite::Connection::open(&backup)
            .unwrap()
            .execute_batch(sql)
            .unwrap();
        assert!(database.restore(&backup).is_err());
        assert_eq!(database.load().unwrap().preferences["theme"], "system");
        assert_eq!(std::fs::read(&safety).unwrap(), b"existing recovery copy");
    }
}

#[test]
fn rejects_oversized_backups_and_exports_into_storage() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let oversized = folder.path().join("oversized.sqlite3");
    std::fs::File::create(&oversized)
        .unwrap()
        .set_len(trolley_lib::config::MAX_RESTORE_BYTES + 1)
        .unwrap();
    assert!(database.restore(&oversized).is_err());
    assert_eq!(database.load().unwrap().preferences["theme"], "system");
    assert!(database.validate_destination(database.path()).is_err());
    assert!(
        database
            .validate_destination(&folder.path().join("new.json"))
            .is_err()
    );
    let external = tempdir().unwrap();
    assert!(
        database
            .validate_destination(&external.path().join("new.json"))
            .is_ok()
    );
}

#[cfg(target_os = "linux")]
#[test]
fn patched_glib_string_iterator_survives_optimized_iteration() {
    use glib::variant::ToVariant;
    let value = vec!["first", "second", "third"].to_variant();
    assert_eq!(
        value.array_iter_str().unwrap().collect::<Vec<_>>(),
        vec!["first", "second", "third"]
    );
    assert_eq!(
        value.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        vec!["third", "second", "first"]
    );
    assert_eq!(value.array_iter_str().unwrap().nth(1), Some("second"));
}

#[test]
fn rejects_invalid_json_even_when_the_value_is_large() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let backup = folder.path().join("large-value.sqlite3");
    database.backup(&backup).unwrap();
    rusqlite::Connection::open(&backup)
        .unwrap()
        .execute(
            "UPDATE workspace_preferences SET preferences_json = ?1",
            ["x".repeat(1024 * 1024 + 1)],
        )
        .unwrap();
    assert!(database.restore(&backup).is_err());
    assert_eq!(database.load().unwrap().preferences["theme"], "system");
}

#[test]
fn backup_includes_committed_changes_still_in_the_wal() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let writer = rusqlite::Connection::open(database.path()).unwrap();
    writer
        .execute(
            "UPDATE workspace_preferences SET preferences_json = ?1",
            [json!({"theme": "dark"}).to_string()],
        )
        .unwrap();
    let backup = folder.path().join("wal-backup.sqlite3");
    database.backup(&backup).unwrap();
    let copied = Database::new(backup);
    assert_eq!(copied.load().unwrap().preferences["theme"], "dark");
    drop(writer);
}

fn populated_snapshot() -> WorkspaceSnapshot {
    let mut snapshot = empty_snapshot();
    snapshot.projects.push(ProjectRecord {
        id: "00000000-0000-4000-8000-000000000001".into(),
        name: "Validation project".into(),
        color: "#000000".into(),
        icon: None,
        archived: false,
        created_at: "2026-10-07T00:00:00Z".into(),
        updated_at: "2026-10-07T00:00:00Z".into(),
        sort_position: 0.0,
        settings: json!({}),
    });
    snapshot.columns.push(WorkflowColumnRecord {
        id: "00000000-0000-4000-8000-000000000002".into(),
        project_id: snapshot.projects[0].id.clone(),
        name: "Active".into(),
        color: "#000000".into(),
        icon: "CircleDot".into(),
        completed: false,
        limit: None,
        collapsed: false,
        sort_position: 0.0,
    });
    snapshot
}

fn task_record(index: usize, parent_id: Option<String>) -> TaskRecord {
    TaskRecord {
        id: format!("00000000-0000-4000-8001-{index:012}"),
        project_id: "00000000-0000-4000-8000-000000000001".into(),
        column_id: "00000000-0000-4000-8000-000000000002".into(),
        title: "Task".into(),
        description: String::new(),
        priority: 1,
        is_urgent: false,
        is_important: false,
        start_date: None,
        due_date: None,
        progress: 0,
        label_ids: vec![],
        assignee_id: None,
        parent_id,
        checklist: vec![],
        dependency_ids: vec![],
        estimated_hours: None,
        actual_hours: None,
        milestone: false,
        notes: String::new(),
        created_at: "2026-10-07T00:00:00Z".into(),
        updated_at: "2026-10-07T00:00:00Z".into(),
        completed: false,
        archived: false,
        sort_position: index as f64,
    }
}

#[test]
fn stale_saves_cannot_overwrite_a_newer_workspace() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    let stale = empty_snapshot();
    assert_eq!(database.save(&stale).unwrap(), 1);
    let mut current = database.load().unwrap();
    current.preferences["theme"] = json!("dark");
    assert_eq!(database.save(&current).unwrap(), 2);
    assert!(
        database
            .save(&stale)
            .unwrap_err()
            .contains("another session")
    );
    assert_eq!(database.load().unwrap().preferences["theme"], "dark");
    assert_eq!(database.load().unwrap().revision, 2);
}

#[test]
fn large_valid_values_survive_verified_backup_and_restore() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    let mut snapshot = populated_snapshot();
    let mut task = task_record(1, None);
    task.description = "x".repeat(1024 * 1024 + 1);
    snapshot.tasks.push(task);
    snapshot.preferences["literal"] = json!("[{},:]".repeat(200_000));
    database.save(&snapshot).unwrap();
    let backup = folder.path().join("large.sqlite3");
    database.backup(&backup).unwrap();
    let restored = database.restore(&backup).unwrap();
    assert_eq!(restored.tasks[0].description.len(), 1024 * 1024 + 1);
    assert_eq!(
        restored.preferences["literal"],
        snapshot.preferences["literal"]
    );
    assert_eq!(restored.revision, 2);
    assert_eq!(database.load().unwrap().revision, 2);
}

#[test]
fn malformed_settings_never_replace_the_current_workspace() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    let mut snapshot = populated_snapshot();
    database.save(&snapshot).unwrap();
    let loaded = database.load().unwrap();
    assert_eq!(
        loaded.projects[0].settings["terminology"]["taskPlural"],
        "Tasks"
    );
    snapshot.revision = loaded.revision;
    snapshot.projects[0].settings = json!({"terminology": []});
    assert!(database.save(&snapshot).is_err());
    assert_eq!(database.load().unwrap().revision, 1);
    assert_eq!(
        database.load().unwrap().projects[0].settings["terminology"]["taskPlural"],
        "Tasks"
    );
}

#[test]
fn raw_recovery_works_when_normal_backup_validation_fails() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let writer = rusqlite::Connection::open(database.path()).unwrap();
    writer
        .execute(
            "UPDATE workspace_preferences SET preferences_json = '[]'",
            [],
        )
        .unwrap();
    drop(writer);
    assert!(database.load().is_err());
    let backup = folder.path().join("backup.sqlite3");
    std::fs::write(&backup, b"keep old backup").unwrap();
    assert!(database.backup(&backup).is_err());
    assert_eq!(std::fs::read(&backup).unwrap(), b"keep old backup");
    let recovery = folder.path().join("recovery.zip");
    database.recover(&recovery).unwrap();
    let recovered = folder.path().join("recovered.sqlite3");
    std::fs::write(&recovered, recovery_bytes(&recovery, "trolley.sqlite3"))
        .unwrap();
    let connection = rusqlite::Connection::open(&recovered).unwrap();
    let text: String = connection
        .query_row(
            "SELECT preferences_json FROM workspace_preferences",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(text, "[]");
}

#[test]
fn restore_rejects_orphan_records_before_changing_any_data() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let backup = folder.path().join("orphan.sqlite3");
    database.backup(&backup).unwrap();
    let connection = rusqlite::Connection::open(&backup).unwrap();
    connection.execute_batch("PRAGMA foreign_keys = OFF; INSERT INTO checklist_items VALUES ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011', 'Orphan', 0, 0);").unwrap();
    drop(connection);
    assert!(
        database
            .restore(&backup)
            .unwrap_err()
            .contains("foreign-key")
    );
    assert_eq!(database.load().unwrap().revision, 1);
    assert!(
        !database
            .path()
            .with_extension("before-restore.zip")
            .exists()
    );
}

#[test]
fn legacy_backups_restore_and_receive_live_monotonic_revisions() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let backup = folder.path().join("legacy.sqlite3");
    database.backup(&backup).unwrap();
    let connection = rusqlite::Connection::open(&backup).unwrap();
    connection
        .execute_batch("DROP TABLE workspace_revision")
        .unwrap();
    drop(connection);
    assert_eq!(database.restore(&backup).unwrap().revision, 2);
    let current = database.load().unwrap();
    assert_eq!(database.save(&current).unwrap(), 3);
}

#[test]
fn restore_can_recover_current_malformed_preferences_and_preserve_raw_safety() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let backup = folder.path().join("valid.sqlite3");
    database.backup(&backup).unwrap();
    rusqlite::Connection::open(database.path())
        .unwrap()
        .execute(
            "UPDATE workspace_preferences SET preferences_json = '[]'",
            [],
        )
        .unwrap();
    assert!(database.load().is_err());
    let restored = database.restore(&backup).unwrap();
    assert_eq!(restored.preferences["theme"], "system");
    let recovered = folder.path().join("previous.sqlite3");
    std::fs::write(
        &recovered,
        recovery_bytes(
            &database.path().with_extension("before-restore.zip"),
            "trolley.sqlite3",
        ),
    )
    .unwrap();
    let safety = rusqlite::Connection::open(recovered).unwrap();
    let text: String = safety
        .query_row(
            "SELECT preferences_json FROM workspace_preferences",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(text, "[]");
}

#[test]
fn rejects_excessive_parent_depth_but_accepts_valid_broad_hierarchies() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    let mut snapshot = populated_snapshot();
    for index in 0..=trolley_lib::config::MAX_PARENT_DEPTH {
        let parent = (index > 0)
            .then(|| format!("00000000-0000-4000-8001-{:012}", index - 1));
        snapshot.tasks.push(task_record(index, parent));
    }
    assert!(database.save(&snapshot).unwrap_err().contains("256-level"));
    snapshot.tasks.clear();
    snapshot.tasks.push(task_record(0, None));
    for index in 1..3000 {
        snapshot
            .tasks
            .push(task_record(index, Some(snapshot.tasks[0].id.clone())));
    }
    database.save(&snapshot).unwrap();
    assert_eq!(database.load().unwrap().tasks.len(), 3000);
}

#[test]
fn missing_preferences_do_not_hide_existing_project_data() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&populated_snapshot()).unwrap();
    rusqlite::Connection::open(database.path())
        .unwrap()
        .execute("DELETE FROM workspace_preferences", [])
        .unwrap();
    assert!(database.has_saved_workspace().unwrap());
    assert_eq!(
        database.load().unwrap().projects[0].name,
        "Validation project"
    );
    assert_eq!(database.load().unwrap().preferences["theme"], "system");
}

fn recovery_bytes(path: &std::path::Path, name: &str) -> Vec<u8> {
    let mut archive =
        zip::ZipArchive::new(std::fs::File::open(path).unwrap()).unwrap();
    let mut output = Vec::new();
    std::io::Read::read_to_end(
        &mut archive.by_name(name).unwrap(),
        &mut output,
    )
    .unwrap();
    output
}

#[test]
fn physically_corrupt_storage_is_preserved_before_valid_restore() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let valid = folder.path().join("valid.sqlite3");
    database.backup(&valid).unwrap();
    let corrupt = b"damaged database header with original private bytes";
    std::fs::write(database.path(), corrupt).unwrap();
    let archive = folder.path().join("recovery.zip");
    database.recover(&archive).unwrap();
    assert_eq!(recovery_bytes(&archive, "trolley.sqlite3"), corrupt);
    assert_eq!(std::fs::read(database.path()).unwrap(), corrupt);
    let invalid = folder.path().join("invalid.sqlite3");
    std::fs::write(&invalid, b"invalid backup").unwrap();
    assert!(database.restore(&invalid).is_err());
    assert_eq!(std::fs::read(database.path()).unwrap(), corrupt);
    let restored = database.restore(&valid).unwrap();
    assert_eq!(restored.preferences["theme"], "system");
    assert_eq!(
        recovery_bytes(
            &database.path().with_extension("before-restore.zip"),
            "trolley.sqlite3"
        ),
        corrupt
    );
    assert_eq!(database.load().unwrap().revision, 1);
}

#[test]
fn recovery_archive_preserves_sidecars_and_failed_archive_keeps_old_target() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    std::fs::write(database.path(), b"unreadable original").unwrap();
    let wal =
        std::path::PathBuf::from(format!("{}-wal", database.path().display()));
    let shm =
        std::path::PathBuf::from(format!("{}-shm", database.path().display()));
    std::fs::write(&wal, b"original wal").unwrap();
    std::fs::write(&shm, b"original shm").unwrap();
    let archive = folder.path().join("recovery.zip");
    database.recover(&archive).unwrap();
    assert_eq!(
        recovery_bytes(&archive, "trolley.sqlite3-wal"),
        b"original wal"
    );
    assert_eq!(
        recovery_bytes(&archive, "trolley.sqlite3-shm"),
        b"original shm"
    );
    let original_archive = std::fs::read(&archive).unwrap();
    std::fs::File::create(database.path())
        .unwrap()
        .set_len(trolley_lib::config::MAX_RESTORE_BYTES + 1)
        .unwrap();
    assert!(database.recover(&archive).is_err());
    assert_eq!(std::fs::read(&archive).unwrap(), original_archive);
}

#[test]
fn excessive_configuration_is_rejected_before_backup_replaces_its_target() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("live.sqlite3"));
    database.initialize().unwrap();
    database.save(&empty_snapshot()).unwrap();
    let mut invalid = database.load().unwrap();
    invalid.preferences["unused"] =
        json!("x".repeat(trolley_lib::config::MAX_CONFIGURATION_BYTES + 1));
    assert!(
        database
            .save(&invalid)
            .unwrap_err()
            .contains("Configuration")
    );
    assert_eq!(database.load().unwrap().revision, 1);
    let writer = rusqlite::Connection::open(database.path()).unwrap();
    let mut forged = empty_snapshot().preferences;
    forged["unused"] = json!(vec![
        json!({});
        trolley_lib::config::MAX_CONFIGURATION_TOKENS
            / 2
    ]);
    writer
        .execute(
            "UPDATE workspace_preferences SET preferences_json = ?1",
            [forged.to_string()],
        )
        .unwrap();
    drop(writer);
    let destination = folder.path().join("backup.sqlite3");
    std::fs::write(&destination, b"previous verified backup").unwrap();
    assert!(database.backup(&destination).is_err());
    assert_eq!(
        std::fs::read(&destination).unwrap(),
        b"previous verified backup"
    );
}

#[test]
fn initializes_legacy_revision_metadata_without_resetting_data_or_counter() {
    let folder = tempdir().unwrap();
    let database = Database::new(folder.path().join("legacy.sqlite3"));
    database.initialize().unwrap();
    database.save(&populated_snapshot()).unwrap();
    rusqlite::Connection::open(database.path())
        .unwrap()
        .execute_batch("DROP TABLE workspace_revision")
        .unwrap();
    database.initialize().unwrap();
    let snapshot = database.load().unwrap();
    assert_eq!(snapshot.revision, 0);
    assert_eq!(snapshot.projects[0].name, "Validation project");
    assert_eq!(database.save(&snapshot).unwrap(), 1);
    database.initialize().unwrap();
    assert_eq!(database.load().unwrap().revision, 1);
}
