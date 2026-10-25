use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
    pub sort_position: f64,
    pub settings: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowColumnRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub completed: bool,
    pub limit: Option<i64>,
    pub collapsed: bool,
    pub sort_position: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub color: String,
    pub icon: Option<String>,
    pub sort_position: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamMemberRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub initials: String,
    pub color: String,
    pub sort_position: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItemRecord {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub sort_position: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub project_id: String,
    pub column_id: String,
    pub title: String,
    pub description: String,
    pub priority: u8,
    pub is_urgent: bool,
    pub is_important: bool,
    pub start_date: Option<String>,
    pub due_date: Option<String>,
    pub progress: u8,
    pub label_ids: Vec<String>,
    pub assignee_id: Option<String>,
    pub parent_id: Option<String>,
    pub checklist: Vec<ChecklistItemRecord>,
    pub dependency_ids: Vec<String>,
    pub estimated_hours: Option<f64>,
    pub actual_hours: Option<f64>,
    pub milestone: bool,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub completed: bool,
    pub archived: bool,
    pub sort_position: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFilterRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub filter: Value,
    pub sort_position: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    #[serde(default)]
    pub revision: u64,
    pub schema_version: u32,
    pub projects: Vec<ProjectRecord>,
    pub columns: Vec<WorkflowColumnRecord>,
    pub labels: Vec<LabelRecord>,
    pub members: Vec<TeamMemberRecord>,
    pub tasks: Vec<TaskRecord>,
    pub saved_filters: Vec<SavedFilterRecord>,
    pub preferences: Value,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectExport {
    pub format: String,
    pub version: u32,
    pub exported_at: String,
    pub project: ProjectRecord,
    pub columns: Vec<WorkflowColumnRecord>,
    pub labels: Vec<LabelRecord>,
    pub members: Vec<TeamMemberRecord>,
    pub tasks: Vec<TaskRecord>,
    pub saved_filters: Vec<SavedFilterRecord>,
}
