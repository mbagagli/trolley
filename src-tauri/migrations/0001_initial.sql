PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color TEXT NOT NULL,
    icon TEXT,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sort_position REAL NOT NULL,
    settings_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_columns (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    task_limit INTEGER CHECK (task_limit IS NULL OR task_limit > 0),
    collapsed INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0, 1)),
    sort_position REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color TEXT NOT NULL,
    icon TEXT,
    sort_position REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    initials TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_position REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    column_id TEXT NOT NULL REFERENCES workflow_columns(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 5),
    is_urgent INTEGER NOT NULL DEFAULT 0 CHECK (is_urgent IN (0, 1)),
    is_important INTEGER NOT NULL DEFAULT 0 CHECK (is_important IN (0, 1)),
    start_date TEXT,
    due_date TEXT,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    assignee_id TEXT REFERENCES team_members(id) ON DELETE SET NULL,
    parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED,
    estimated_hours REAL
        CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
    actual_hours REAL CHECK (actual_hours IS NULL OR actual_hours >= 0),
    milestone INTEGER NOT NULL DEFAULT 0 CHECK (milestone IN (0, 1)),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    sort_position REAL NOT NULL,
    CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
);

CREATE TABLE IF NOT EXISTS task_labels (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    sort_position REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, dependency_id),
    CHECK (task_id <> dependency_id)
);

CREATE TABLE IF NOT EXISTS saved_filters (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    filter_json TEXT NOT NULL,
    sort_position REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_preferences (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
    preferences_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_sort
    ON projects(archived, sort_position);
CREATE INDEX IF NOT EXISTS idx_columns_project_sort
    ON workflow_columns(project_id, sort_position);
CREATE INDEX IF NOT EXISTS idx_labels_project_sort
    ON labels(project_id, sort_position);
CREATE INDEX IF NOT EXISTS idx_members_project_sort
    ON team_members(project_id, sort_position);
CREATE INDEX IF NOT EXISTS idx_tasks_project_column_sort
    ON tasks(project_id, column_id, archived, sort_position);
CREATE INDEX IF NOT EXISTS idx_tasks_project_dates
    ON tasks(project_id, start_date, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent
    ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_dependency
    ON task_dependencies(dependency_id);
CREATE INDEX IF NOT EXISTS idx_checklist_task_sort
    ON checklist_items(task_id, sort_position);
