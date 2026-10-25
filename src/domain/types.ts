export type EntityId = string;
export type ViewMode = "dashboard" | "board" | "gantt" | "matrix" | "list";
export type ThemeMode = "light" | "dark" | "system";
export type DensityMode = "comfortable" | "compact";
export type SaveState = "idle" | "saving" | "saved" | "error";
export type PriorityRank = 1 | 2 | 3 | 4 | 5;
export type QuadrantKey =
  | "do-first"
  | "schedule"
  | "delegate"
  | "eliminate";

export interface Terminology {
  projectSingular: string;
  projectPlural: string;
  taskSingular: string;
  taskPlural: string;
}

export interface PriorityLevel {
  rank: PriorityRank;
  name: string;
  color: string;
  icon: string;
}

export interface QuadrantConfig {
  key: QuadrantKey;
  name: string;
  description: string;
  color: string;
  icon: string;
}

export type CardField =
  | "labels"
  | "priority"
  | "dates"
  | "progress"
  | "checklist"
  | "dependencies"
  | "assignee"
  | "milestone";

export interface ProjectSettings {
  terminology: Terminology;
  priorities: PriorityLevel[];
  quadrants: QuadrantConfig[];
  defaultView: Exclude<ViewMode, "dashboard">;
  dateFormat: string;
  firstDayOfWeek: number;
  workingDays: number[];
  showWeekends: boolean;
  showCompletedInMatrix: boolean;
  cardFields: CardField[];
}

export interface Project {
  id: EntityId;
  name: string;
  color: string;
  icon: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  sortPosition: number;
  settings: ProjectSettings;
}

export interface WorkflowColumn {
  id: EntityId;
  projectId: EntityId;
  name: string;
  color: string;
  icon: string;
  completed: boolean;
  limit: number | null;
  collapsed: boolean;
  sortPosition: number;
}

export interface Label {
  id: EntityId;
  projectId: EntityId;
  name: string;
  color: string;
  icon: string | null;
  sortPosition: number;
}

export interface TeamMember {
  id: EntityId;
  projectId: EntityId;
  name: string;
  initials: string;
  color: string;
  sortPosition: number;
}

export interface ChecklistItem {
  id: EntityId;
  title: string;
  completed: boolean;
  sortPosition: number;
}

export interface Task {
  id: EntityId;
  projectId: EntityId;
  columnId: EntityId;
  title: string;
  description: string;
  priority: PriorityRank;
  isUrgent: boolean;
  isImportant: boolean;
  startDate: string | null;
  dueDate: string | null;
  progress: number;
  labelIds: EntityId[];
  assigneeId: EntityId | null;
  parentId: EntityId | null;
  checklist: ChecklistItem[];
  dependencyIds: EntityId[];
  estimatedHours: number | null;
  actualHours: number | null;
  milestone: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  archived: boolean;
  sortPosition: number;
}

export interface FilterState {
  query: string;
  columnIds: EntityId[];
  labelIds: EntityId[];
  priorities: PriorityRank[];
  quadrants: QuadrantKey[];
  assigneeIds: EntityId[];
  dueFrom: string | null;
  dueTo: string | null;
  includeCompleted: boolean;
}

export interface SavedFilter {
  id: EntityId;
  projectId: EntityId;
  name: string;
  filter: FilterState;
  sortPosition: number;
}

export interface WorkspacePreferences {
  columnTaskLimitMigrated?: boolean;
  theme: ThemeMode;
  density: DensityMode;
  onboardingComplete: boolean;
  lastProjectId: EntityId | null;
}

export interface WorkspaceSnapshot {
  revision?: number;
  schemaVersion: number;
  projects: Project[];
  columns: WorkflowColumn[];
  labels: Label[];
  members: TeamMember[];
  tasks: Task[];
  savedFilters: SavedFilter[];
  preferences: WorkspacePreferences;
}
