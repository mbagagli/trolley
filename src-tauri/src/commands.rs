use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde_json::Value;
use tauri::{State, WebviewWindow};
use tauri_plugin_fs::FsExt;
use uuid::Uuid;

use crate::config::PRODUCT_NAME;
use crate::database::Database;
use crate::file_safety::{atomic_write, read_bounded};
use crate::model::{ProjectExport, WorkspaceSnapshot};

const PROJECT_EXPORT_FORMAT: &str = "trolley-project";
const PROJECT_EXPORT_VERSION: u32 = 1;
const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;

#[tauri::command]
pub fn load_workspace(
    database: State<'_, Database>,
) -> Result<Option<WorkspaceSnapshot>, String> {
    database.initialize()?;
    if !database.has_saved_workspace()? {
        return Ok(None);
    }
    database.load().map(Some)
}

#[tauri::command]
pub fn save_workspace(
    database: State<'_, Database>,
    snapshot: WorkspaceSnapshot,
) -> Result<u64, String> {
    database.save(&snapshot)
}

#[tauri::command]
pub fn export_project(
    window: WebviewWindow,
    database: State<'_, Database>,
    project_id: String,
    path: String,
) -> Result<(), String> {
    require_selected(&window, Path::new(&path))?;
    database.validate_destination(Path::new(&path))?;
    let snapshot = database.load()?;
    let project = snapshot
        .projects
        .into_iter()
        .find(|candidate| candidate.id == project_id)
        .ok_or_else(|| "The selected project no longer exists.".to_string())?;
    let export = ProjectExport {
        format: PROJECT_EXPORT_FORMAT.to_string(),
        version: PROJECT_EXPORT_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        columns: snapshot
            .columns
            .into_iter()
            .filter(|item| item.project_id == project_id)
            .collect(),
        labels: snapshot
            .labels
            .into_iter()
            .filter(|item| item.project_id == project_id)
            .collect(),
        members: snapshot
            .members
            .into_iter()
            .filter(|item| item.project_id == project_id)
            .collect(),
        tasks: snapshot
            .tasks
            .into_iter()
            .filter(|item| item.project_id == project_id)
            .collect(),
        saved_filters: snapshot
            .saved_filters
            .into_iter()
            .filter(|item| item.project_id == project_id)
            .collect(),
        project,
    };
    let output = serde_json::to_string_pretty(&export)
        .map_err(|error| format!("Could not serialize the project: {error}"))?;
    if output.len() as u64 > MAX_IMPORT_BYTES {
        return Err("This project exceeds the 20 MiB JSON import limit. Use a verified database backup instead.".into());
    }
    atomic_write(Path::new(&path), output.as_bytes())
}

#[tauri::command]
pub fn import_project(
    window: WebviewWindow,
    database: State<'_, Database>,
    path: String,
) -> Result<WorkspaceSnapshot, String> {
    let source = PathBuf::from(path);
    require_selected(&window, &source)?;
    let input = read_bounded(&source, MAX_IMPORT_BYTES)?;
    let export: ProjectExport =
        serde_json::from_slice(&input).map_err(|error| {
            format!("The selected project JSON is invalid: {error}")
        })?;
    if export.format != PROJECT_EXPORT_FORMAT
        || export.version != PROJECT_EXPORT_VERSION
    {
        return Err(format!(
            "The selected file is not a supported {PRODUCT_NAME} project."
        ));
    }
    let mut snapshot = database.load()?;
    append_remapped_export(&mut snapshot, export);
    database.save(&snapshot)?;
    database.load()
}

#[tauri::command]
pub fn backup_database(
    window: WebviewWindow,
    database: State<'_, Database>,
    path: String,
) -> Result<(), String> {
    require_selected(&window, Path::new(&path))?;
    database.validate_destination(Path::new(&path))?;
    database.backup(Path::new(&path))
}

/// Preserve original database and journal bytes without requiring validation.
#[tauri::command]
pub fn recover_database(
    window: WebviewWindow,
    database: State<'_, Database>,
    path: String,
) -> Result<(), String> {
    require_selected(&window, Path::new(&path))?;
    database.validate_destination(Path::new(&path))?;
    database.recover(Path::new(&path))
}

#[tauri::command]
pub fn restore_database(
    window: WebviewWindow,
    database: State<'_, Database>,
    path: String,
) -> Result<WorkspaceSnapshot, String> {
    require_selected(&window, Path::new(&path))?;
    database.restore(Path::new(&path))
}

fn append_remapped_export(
    snapshot: &mut WorkspaceSnapshot,
    mut export: ProjectExport,
) {
    let project_id = new_id();
    let mut id_map = HashMap::<String, String>::new();
    id_map.insert(export.project.id.clone(), project_id.clone());
    for column in &export.columns {
        id_map.insert(column.id.clone(), new_id());
    }
    for label in &export.labels {
        id_map.insert(label.id.clone(), new_id());
    }
    for member in &export.members {
        id_map.insert(member.id.clone(), new_id());
    }
    for task in &export.tasks {
        id_map.insert(task.id.clone(), new_id());
        for item in &task.checklist {
            id_map.insert(item.id.clone(), new_id());
        }
    }
    for filter in &export.saved_filters {
        id_map.insert(filter.id.clone(), new_id());
    }
    export.project.id = project_id.clone();
    export.project.name = format!("{} imported", export.project.name);
    export.project.archived = false;
    export.project.sort_position = snapshot.projects.len() as f64;
    export.project.created_at = Utc::now().to_rfc3339();
    export.project.updated_at = export.project.created_at.clone();
    remap_value(&mut export.project.settings, &id_map);
    for column in &mut export.columns {
        remap_id(&mut column.id, &id_map);
        column.project_id = project_id.clone();
    }
    for label in &mut export.labels {
        remap_id(&mut label.id, &id_map);
        label.project_id = project_id.clone();
    }
    for member in &mut export.members {
        remap_id(&mut member.id, &id_map);
        member.project_id = project_id.clone();
    }
    for task in &mut export.tasks {
        remap_id(&mut task.id, &id_map);
        task.project_id = project_id.clone();
        remap_id(&mut task.column_id, &id_map);
        remap_optional_id(&mut task.assignee_id, &id_map);
        remap_optional_id(&mut task.parent_id, &id_map);
        for id in &mut task.label_ids {
            remap_id(id, &id_map);
        }
        for id in &mut task.dependency_ids {
            remap_id(id, &id_map);
        }
        for item in &mut task.checklist {
            remap_id(&mut item.id, &id_map);
        }
    }
    for filter in &mut export.saved_filters {
        remap_id(&mut filter.id, &id_map);
        filter.project_id = project_id.clone();
        remap_value(&mut filter.filter, &id_map);
    }
    snapshot.projects.push(export.project);
    snapshot.columns.extend(export.columns);
    snapshot.labels.extend(export.labels);
    snapshot.members.extend(export.members);
    snapshot.tasks.extend(export.tasks);
    snapshot.saved_filters.extend(export.saved_filters);
}

fn remap_value(value: &mut Value, id_map: &HashMap<String, String>) {
    match value {
        Value::String(text) => {
            if let Some(mapped) = id_map.get(text) {
                *text = mapped.clone();
            }
        }
        Value::Array(values) => {
            for value in values {
                remap_value(value, id_map);
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                remap_value(value, id_map);
            }
        }
        _ => {}
    }
}

fn remap_optional_id(
    value: &mut Option<String>,
    id_map: &HashMap<String, String>,
) {
    if let Some(id) = value {
        remap_id(id, id_map);
    }
}

fn remap_id(value: &mut String, id_map: &HashMap<String, String>) {
    if let Some(mapped) = id_map.get(value) {
        *value = mapped.clone();
    }
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Require a native dialog grant before accepting a frontend file path.
fn require_selected<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    path: &Path,
) -> Result<(), String> {
    if window.label() != "main" || !window.fs_scope().is_allowed(path) {
        return Err(
            "Select this file using Trolley's file dialog first.".into()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ProjectRecord, WorkspaceSnapshot};

    #[test]
    fn file_operations_require_exact_native_selection() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::default(),
        )
        .build()
        .unwrap();
        let folder = tempfile::tempdir().unwrap();
        let selected = folder.path().join("selected.json");
        let other = folder.path().join("other.json");
        assert!(require_selected(&window, &selected).is_err());
        window.fs_scope().allow_file(&selected).unwrap();
        assert!(require_selected(&window, &selected).is_ok());
        assert!(require_selected(&window, &other).is_err());
        let other_window = tauri::WebviewWindowBuilder::new(
            &app,
            "other",
            tauri::WebviewUrl::default(),
        )
        .build()
        .unwrap();
        assert!(require_selected(&other_window, &selected).is_err());
    }

    #[test]
    fn remaps_project_and_nested_identifiers() {
        let original_project_id = Uuid::new_v4().to_string();
        let export = ProjectExport {
            format: PROJECT_EXPORT_FORMAT.to_string(),
            version: PROJECT_EXPORT_VERSION,
            exported_at: Utc::now().to_rfc3339(),
            project: ProjectRecord {
                id: original_project_id.clone(),
                name: "Example".to_string(),
                color: "#000000".to_string(),
                icon: None,
                archived: false,
                created_at: Utc::now().to_rfc3339(),
                updated_at: Utc::now().to_rfc3339(),
                sort_position: 0.0,
                settings: serde_json::json!({
                    "lastProjectId": original_project_id,
                }),
            },
            columns: vec![],
            labels: vec![],
            members: vec![],
            tasks: vec![],
            saved_filters: vec![],
        };
        let mut snapshot = WorkspaceSnapshot {
            revision: 0,
            schema_version: 1,
            projects: vec![],
            columns: vec![],
            labels: vec![],
            members: vec![],
            tasks: vec![],
            saved_filters: vec![],
            preferences: serde_json::json!({}),
        };
        append_remapped_export(&mut snapshot, export);
        assert_eq!(snapshot.projects.len(), 1);
        assert_ne!(snapshot.projects[0].id, original_project_id);
        assert_eq!(snapshot.projects[0].name, "Example imported");
    }
}
