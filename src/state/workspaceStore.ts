import { normalizeWorkspaceSnapshot } from "../domain/workspaceValidation";
import { useSyncExternalStore } from "react";

import {
  DEFAULT_COLUMN_TASK_LIMIT,
  DEFAULT_SETTINGS,
} from "../config/product";
import { EMPTY_FILTER } from "../domain/filters";
import { quadrantFlags } from "../domain/quadrant";
import {
  reorderSubtasks,
  synchronizeSubtasksForWorkflowColumn,
  synchronizeTaskSubtasks,
  synchronizeWorkspaceSubtasks,
} from "../domain/subtasks";
import type {
  ChecklistItem,
  DensityMode,
  EntityId,
  FilterState,
  PriorityRank,
  Project,
  QuadrantKey,
  SaveState,
  Task,
  ViewMode,
  WorkspaceSnapshot,
} from "../domain/types";
import { validateTask } from "../domain/validation";
import { WorkspaceRepository } from "../services/workspaceRepository";

interface ToastMessage {
  id: number;
  message: string;
  tone: "success" | "warning" | "error";
}

export interface WorkspaceState {
  snapshot: WorkspaceSnapshot | null;
  loading: boolean;
  loadError: string | null;
  activeProjectId: EntityId | null;
  activeView: ViewMode;
  selectedTaskId: EntityId | null;
  selectedTaskIds: ReadonlySet<EntityId>;
  filter: FilterState;
  saveState: SaveState;
  saveError: string | null;
  toast: ToastMessage | null;
  onboardingOpen: boolean;
  dataOperation: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

type Listener = () => void;

const initialState: WorkspaceState = {
  snapshot: null,
  loading: true,
  loadError: null,
  activeProjectId: null,
  activeView: "dashboard",
  selectedTaskId: null,
  selectedTaskIds: new Set(),
  filter: EMPTY_FILTER,
  saveState: "idle",
  saveError: null,
  toast: null,
  onboardingOpen: false,
  dataOperation: false,
  canUndo: false,
  canRedo: false,
};

function touchProject(
  snapshot: WorkspaceSnapshot,
  projectId: EntityId,
): void {
  const project = snapshot.projects.find(
    (candidate) => candidate.id === projectId,
  );
  if (project) {
    project.updatedAt = new Date().toISOString();
  }
}

function memberInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

export class WorkspaceStore {
  private state: WorkspaceState = initialState;
  private readonly listeners = new Set<Listener>();
  private readonly repository: WorkspaceRepository;
  private readonly undoStack: WorkspaceSnapshot[] = [];
  private readonly redoStack: WorkspaceSnapshot[] = [];
  private saveTimer: number | null = null;
  private saveVersion = 0;
  private saveQueue: Promise<void> = Promise.resolve();
  private toastId = 0;
  private persistedRevision = 0;
  private recovering = false;

  constructor(repository = new WorkspaceRepository()) {
    this.repository = repository;
  }

  getSnapshot = (): WorkspaceState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async initialize(): Promise<void> {
    try {
      const snapshot = synchronizeWorkspaceSubtasks(
        normalizeWorkspaceSnapshot(await this.repository.load()),
      );
      this.persistedRevision = snapshot.revision ?? 0;
      this.recovering = false;
      const migrateColumnLimits =
        !snapshot.preferences.columnTaskLimitMigrated;
      if (migrateColumnLimits) {
        for (const column of snapshot.columns) {
          if (column.limit !== null && column.limit > 0 &&
            column.limit < DEFAULT_COLUMN_TASK_LIMIT) {
            column.limit = DEFAULT_COLUMN_TASK_LIMIT;
          }
        }
        snapshot.preferences.columnTaskLimitMigrated = true;
      }
      const activeProjectId = snapshot.preferences.lastProjectId ??
        snapshot.projects.find((project) => !project.archived)?.id ??
        null;
      const project = snapshot.projects.find(
        (candidate) => candidate.id === activeProjectId,
      );
      this.setState({
        ...this.state,
        snapshot,
        loading: false,
        loadError: null,
        activeProjectId,
        activeView: project?.settings.defaultView ?? "dashboard",
        onboardingOpen: !snapshot.preferences.onboardingComplete,
      });
      if (migrateColumnLimits) {
        this.scheduleSave();
      }
    } catch (error) {
      this.recovering = true;
      this.setState({
        ...this.state,
        loading: false,
        loadError: this.errorMessage(error),
      });
    }
  }

  openDashboard(): void {
    this.setState({
      ...this.state,
      activeView: "dashboard",
      selectedTaskId: null,
      selectedTaskIds: new Set(),
    });
  }

  selectProject(projectId: EntityId): void {
    if (this.state.dataOperation) return;
    const snapshot = this.requireSnapshot();
    const project = snapshot.projects.find(
      (candidate) => candidate.id === projectId,
    );
    if (!project) {
      return;
    }
    this.setState({
      ...this.state,
      snapshot: {
        ...snapshot,
        preferences: { ...snapshot.preferences, lastProjectId: projectId },
      },
      activeProjectId: projectId,
      activeView: project.settings.defaultView,
      selectedTaskId: null,
      selectedTaskIds: new Set(),
      filter: EMPTY_FILTER,
    });
    this.scheduleSave();
  }

  setActiveView(view: ViewMode): void {
    this.setState({
      ...this.state,
      activeView: view,
      selectedTaskIds: new Set(),
    });
  }

  selectTask(taskId: EntityId | null): void {
    this.setState({ ...this.state, selectedTaskId: taskId });
  }

  toggleTaskSelection(taskId: EntityId): void {
    const selected = new Set(this.state.selectedTaskIds);
    if (selected.has(taskId)) {
      selected.delete(taskId);
    } else {
      selected.add(taskId);
    }
    this.setState({ ...this.state, selectedTaskIds: selected });
  }

  clearTaskSelection(): void {
    this.setState({ ...this.state, selectedTaskIds: new Set() });
  }

  setFilter(filter: FilterState): void {
    this.setState({ ...this.state, filter });
  }

  saveCurrentFilter(name: string): void {
    const projectId = this.state.activeProjectId;
    const normalized = name.trim();
    if (!projectId || !normalized) {
      return;
    }
    this.mutateSnapshot("Filter preset saved", (snapshot) => {
      const projectFilters = snapshot.savedFilters.filter(
        (filter) => filter.projectId === projectId,
      );
      snapshot.savedFilters.push({
        id: crypto.randomUUID(),
        projectId,
        name: normalized,
        filter: structuredClone(this.state.filter),
        sortPosition: projectFilters.length,
      });
      touchProject(snapshot, projectId);
    });
  }

  applySavedFilter(filterId: EntityId): void {
    const saved = this.requireSnapshot().savedFilters.find(
      (filter) => filter.id === filterId,
    );
    if (saved) {
      this.setFilter(structuredClone(saved.filter));
    }
  }

  deleteSavedFilter(filterId: EntityId): void {
    this.mutateSnapshot("Filter preset removed", (snapshot) => {
      const projectId = snapshot.savedFilters.find(
        (filter) => filter.id === filterId,
      )?.projectId;
      snapshot.savedFilters = snapshot.savedFilters.filter(
        (filter) => filter.id !== filterId,
      );
      if (projectId) {
        touchProject(snapshot, projectId);
      }
    });
  }

  createTask(columnId: EntityId, title: string): EntityId | null {
    const normalized = title.trim();
    if (!normalized || !this.state.activeProjectId) {
      return null;
    }
    const taskId = crypto.randomUUID();
    this.mutateSnapshot("Task added", (snapshot) => {
      const columnTasks = snapshot.tasks.filter(
        (task) => task.columnId === columnId && !task.archived,
      );
      const timestamp = new Date().toISOString();
      snapshot.tasks.push({
        id: taskId,
        projectId: this.state.activeProjectId as EntityId,
        columnId,
        title: normalized,
        description: "",
        priority: 1,
        isUrgent: false,
        isImportant: false,
        startDate: null,
        dueDate: null,
        progress: 0,
        labelIds: [],
        assigneeId: null,
        parentId: null,
        checklist: [],
        dependencyIds: [],
        estimatedHours: null,
        actualHours: null,
        milestone: false,
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        completed: false,
        archived: false,
        sortPosition: columnTasks.length,
      });
      touchProject(snapshot, this.state.activeProjectId as EntityId);
    });
    return taskId;
  }

  updateTask(taskId: EntityId, changes: Partial<Task>): boolean {
    const existing = this.requireSnapshot().tasks.find(
      (task) => task.id === taskId,
    );
    if (!existing) {
      return false;
    }
    const merged = {
      ...existing,
      ...changes,
      id: existing.id,
      projectId: existing.projectId,
      updatedAt: new Date().toISOString(),
    };
    const candidate = changes.checklist
      ? {
          ...merged,
          ...synchronizeTaskSubtasks(existing, changes.checklist),
        }
      : merged;
    const issues = validateTask(candidate);
    if (issues.length > 0) {
      this.showToast(
        issues[0]?.message ?? "Task changes are invalid.",
        "error",
      );
      return false;
    }
    this.mutateSnapshot("Task updated", (snapshot) => {
      const tasks = snapshot.tasks.map((task) =>
        task.id === taskId ? candidate : task,
      );
      snapshot.tasks = changes.checklist
        ? synchronizeWorkspaceSubtasks({ ...snapshot, tasks }).tasks
        : tasks;
      touchProject(snapshot, existing.projectId);
    });
    return true;
  }

  addSubtask(taskId: EntityId, title: string): EntityId | null {
    const normalized = title.trim();
    const task = this.requireSnapshot().tasks.find(
      (candidate) => candidate.id === taskId,
    );
    if (!task || !normalized) {
      return null;
    }
    const subtaskId = crypto.randomUUID();
    const checklist = [
      ...task.checklist,
      {
        id: subtaskId,
        title: normalized,
        completed: false,
        sortPosition: task.checklist.length,
      },
    ];
    return this.updateTask(taskId, { checklist }) ? subtaskId : null;
  }

  updateSubtask(
    taskId: EntityId,
    subtaskId: EntityId,
    changes: Partial<Pick<ChecklistItem, "completed" | "title">>,
  ): boolean {
    const task = this.requireSnapshot().tasks.find(
      (candidate) => candidate.id === taskId,
    );
    const normalizedTitle = changes.title?.trim();
    if (!task || (changes.title !== undefined && !normalizedTitle)) {
      this.showToast("Sub-task description cannot be empty.", "error");
      return false;
    }
    const subtask = task.checklist.find(
      (candidate) => candidate.id === subtaskId,
    );
    if (!subtask) {
      return false;
    }
    const checklist = task.checklist.map((candidate) =>
      candidate.id === subtaskId
        ? {
            ...candidate,
            ...changes,
            title: normalizedTitle ?? candidate.title,
          }
        : candidate,
    );
    return this.updateTask(taskId, { checklist });
  }

  deleteSubtask(taskId: EntityId, subtaskId: EntityId): boolean {
    const task = this.requireSnapshot().tasks.find(
      (candidate) => candidate.id === taskId,
    );
    if (!task || !task.checklist.some((item) => item.id === subtaskId)) {
      return false;
    }
    const checklist = task.checklist.filter((item) => item.id !== subtaskId);
    return this.updateTask(taskId, { checklist });
  }

  reorderSubtask(
    taskId: EntityId,
    activeSubtaskId: EntityId,
    overSubtaskId: EntityId,
  ): boolean {
    const task = this.requireSnapshot().tasks.find(
      (candidate) => candidate.id === taskId,
    );
    if (!task || activeSubtaskId === overSubtaskId) {
      return false;
    }
    const checklist = reorderSubtasks(
      task.checklist,
      activeSubtaskId,
      overSubtaskId,
    );
    return this.updateTask(taskId, { checklist });
  }

  setTaskPriority(taskId: EntityId, priority: PriorityRank): void {
    this.updateTask(taskId, { priority });
  }

  setTaskQuadrant(taskId: EntityId, quadrant: QuadrantKey): void {
    this.updateTask(taskId, quadrantFlags(quadrant));
  }

  moveTask(
    taskId: EntityId,
    columnId: EntityId,
    beforeTaskId: EntityId | null = null,
  ): void {
    this.mutateSnapshot("Task moved", (snapshot) => {
      const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return;
      }
      const destinationColumn = snapshot.columns.find(
        (column) =>
          column.id === columnId && column.projectId === task.projectId,
      );
      if (!destinationColumn) {
        return;
      }
      const sourceColumnId = task.columnId;
      const destination = snapshot.tasks
        .filter(
          (candidate) =>
            candidate.columnId === columnId &&
            candidate.id !== taskId &&
            !candidate.archived,
        )
        .sort((left, right) => left.sortPosition - right.sortPosition);
      const targetIndex = beforeTaskId
        ? destination.findIndex((candidate) => candidate.id === beforeTaskId)
        : destination.length;
      const insertIndex = targetIndex < 0 ? destination.length : targetIndex;
      destination.splice(insertIndex, 0, task);
      for (const [index, candidate] of destination.entries()) {
        candidate.columnId = columnId;
        candidate.sortPosition = index;
        candidate.updatedAt = new Date().toISOString();
        if (candidate.id === taskId) {
          Object.assign(
            candidate,
            synchronizeSubtasksForWorkflowColumn(
              candidate,
              destinationColumn.completed,
            ),
          );
        }
      }
      if (sourceColumnId !== columnId) {
        const sourceTasks = snapshot.tasks
          .filter(
            (candidate) =>
              candidate.columnId === sourceColumnId &&
              candidate.id !== taskId &&
              !candidate.archived,
          )
          .sort((left, right) => left.sortPosition - right.sortPosition);
        sourceTasks.forEach((candidate, index) => {
          candidate.sortPosition = index;
        });
      }
      touchProject(snapshot, task.projectId);
    });
  }

  reorderColumn(columnId: EntityId, beforeColumnId: EntityId | null): void {
    const projectId = this.state.activeProjectId;
    if (!projectId || columnId === beforeColumnId) {
      return;
    }
    this.mutateSnapshot("Column reordered", (snapshot) => {
      const columns = snapshot.columns
        .filter((column) => column.projectId === projectId)
        .sort((left, right) => left.sortPosition - right.sortPosition);
      const currentIndex = columns.findIndex(
        (column) => column.id === columnId,
      );
      if (currentIndex < 0) {
        return;
      }
      const [column] = columns.splice(currentIndex, 1);
      if (!column) {
        return;
      }
      const targetIndex = beforeColumnId
        ? columns.findIndex((candidate) => candidate.id === beforeColumnId)
        : columns.length;
      columns.splice(targetIndex < 0 ? columns.length : targetIndex, 0, column);
      columns.forEach((candidate, index) => {
        candidate.sortPosition = index;
      });
      touchProject(snapshot, projectId);
    });
  }

  toggleColumn(columnId: EntityId): void {
    this.mutateSnapshot("Column toggled", (snapshot) => {
      const projectId = snapshot.columns.find(
        (column) => column.id === columnId,
      )?.projectId;
      snapshot.columns = snapshot.columns.map((column) =>
        column.id === columnId
          ? { ...column, collapsed: !column.collapsed }
          : column,
      );
      if (projectId) {
        touchProject(snapshot, projectId);
      }
    });
  }

  updateColumn(
    columnId: EntityId,
    changes: Partial<
      Pick<
        WorkspaceSnapshot["columns"][number],
        "name" | "color" | "icon" | "completed" | "limit"
      >
    >,
  ): void {
    this.mutateSnapshot("Workflow updated", (snapshot) => {
      const projectId = snapshot.columns.find(
        (column) => column.id === columnId,
      )?.projectId;
      snapshot.columns = snapshot.columns.map((column) =>
        column.id === columnId ? { ...column, ...changes } : column,
      );
      if (projectId) {
        touchProject(snapshot, projectId);
      }
    });
  }

  createColumn(projectId: EntityId): void {
    this.mutateSnapshot("Column added", (snapshot) => {
      const columns = snapshot.columns.filter(
        (column) => column.projectId === projectId,
      );
      snapshot.columns.push({
        id: crypto.randomUUID(),
        projectId,
        name: "New column",
        color: "#477b78",
        icon: "CircleDot",
        completed: false,
        limit: DEFAULT_COLUMN_TASK_LIMIT,
        collapsed: false,
        sortPosition: columns.length,
      });
      touchProject(snapshot, projectId);
    });
  }

  deleteColumn(columnId: EntityId): boolean {
    const snapshot = this.requireSnapshot();
    const column = snapshot.columns.find(
      (candidate) => candidate.id === columnId,
    );
    if (!column) {
      return false;
    }
    const projectColumns = snapshot.columns.filter(
      (candidate) => candidate.projectId === column.projectId,
    );
    if (projectColumns.length <= 1) {
      this.showToast("A project needs at least one column.", "error");
      return false;
    }
    if (snapshot.tasks.some((task) => task.columnId === columnId)) {
      this.showToast(
        "Move this column's tasks before removing it.",
        "warning",
      );
      return false;
    }
    this.mutateSnapshot("Column removed", (draft) => {
      draft.columns = draft.columns.filter(
        (candidate) => candidate.id !== columnId,
      );
      draft.columns
        .filter((candidate) => candidate.projectId === column.projectId)
        .sort((left, right) => left.sortPosition - right.sortPosition)
        .forEach((candidate, index) => {
          candidate.sortPosition = index;
        });
      touchProject(draft, column.projectId);
    });
    return true;
  }

  updateLabel(
    labelId: EntityId,
    changes: Partial<
      Pick<WorkspaceSnapshot["labels"][number], "name" | "color" | "icon">
    >,
  ): void {
    this.mutateSnapshot("Label updated", (snapshot) => {
      const projectId = snapshot.labels.find(
        (label) => label.id === labelId,
      )?.projectId;
      snapshot.labels = snapshot.labels.map((label) =>
        label.id === labelId ? { ...label, ...changes } : label,
      );
      if (projectId) {
        touchProject(snapshot, projectId);
      }
    });
  }

  createLabel(projectId: EntityId): void {
    this.mutateSnapshot("Label added", (snapshot) => {
      const labels = snapshot.labels.filter(
        (label) => label.projectId === projectId,
      );
      snapshot.labels.push({
        id: crypto.randomUUID(),
        projectId,
        name: "New label",
        color: "#aa654a",
        icon: null,
        sortPosition: labels.length,
      });
      touchProject(snapshot, projectId);
    });
  }

  deleteLabel(labelId: EntityId): void {
    this.mutateSnapshot("Label removed", (snapshot) => {
      const label = snapshot.labels.find(
        (candidate) => candidate.id === labelId,
      );
      if (!label) {
        return;
      }
      snapshot.labels = snapshot.labels.filter(
        (candidate) => candidate.id !== labelId,
      );
      snapshot.labels
        .filter((candidate) => candidate.projectId === label.projectId)
        .sort((left, right) => left.sortPosition - right.sortPosition)
        .forEach((candidate, index) => {
          candidate.sortPosition = index;
        });
      const timestamp = new Date().toISOString();
      snapshot.tasks.forEach((task) => {
        if (task.labelIds.includes(labelId)) {
          task.labelIds = task.labelIds.filter((id) => id !== labelId);
          task.updatedAt = timestamp;
        }
      });
      touchProject(snapshot, label.projectId);
    });
  }

  createMember(
    projectId: EntityId,
    name: string,
    color = "#477b78",
  ): EntityId | null {
    const normalized = name.trim();
    if (!normalized) {
      this.showToast("Team member name cannot be empty.", "error");
      return null;
    }
    const memberId = crypto.randomUUID();
    this.mutateSnapshot("Team member added", (snapshot) => {
      const members = snapshot.members.filter(
        (member) => member.projectId === projectId,
      );
      snapshot.members.push({
        id: memberId,
        projectId,
        name: normalized,
        initials: memberInitials(normalized),
        color,
        sortPosition: members.length,
      });
      touchProject(snapshot, projectId);
    });
    return memberId;
  }

  updateMember(
    memberId: EntityId,
    changes: Partial<
      Pick<
        WorkspaceSnapshot["members"][number],
        "name" | "initials" | "color"
      >
    >,
  ): void {
    this.mutateSnapshot("Team member updated", (snapshot) => {
      const member = snapshot.members.find(
        (candidate) => candidate.id === memberId,
      );
      if (!member) {
        return;
      }
      const name = changes.name?.trim() || member.name;
      const initials = changes.initials?.trim().slice(0, 3) ||
        (changes.name ? memberInitials(name) : member.initials);
      Object.assign(member, { ...changes, name, initials });
      touchProject(snapshot, member.projectId);
    });
  }

  deleteMember(memberId: EntityId): void {
    this.mutateSnapshot("Team member removed", (snapshot) => {
      const member = snapshot.members.find(
        (candidate) => candidate.id === memberId,
      );
      if (!member) {
        return;
      }
      snapshot.members = snapshot.members.filter(
        (candidate) => candidate.id !== memberId,
      );
      snapshot.tasks.forEach((task) => {
        if (task.assigneeId === memberId) {
          task.assigneeId = null;
          task.updatedAt = new Date().toISOString();
        }
      });
      touchProject(snapshot, member.projectId);
    });
  }

  createProject(name: string, color = "#477b78"): EntityId | null {
    const normalized = name.trim();
    if (!normalized) {
      return null;
    }
    const projectId = crypto.randomUUID();
    this.mutateSnapshot("Project created", (snapshot) => {
      const timestamp = new Date().toISOString();
      const newProject: Project = {
        id: projectId,
        name: normalized,
        color,
        icon: null,
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        sortPosition: snapshot.projects.length,
        settings: structuredClone(DEFAULT_SETTINGS),
      };
      snapshot.projects.push(newProject);
      const names = ["Backlog", "Ready", "In progress", "Complete"];
      const colors = ["#756b76", "#477b78", "#d39a3c", "#456052"];
      names.forEach((columnName, index) => {
        snapshot.columns.push({
          id: crypto.randomUUID(),
          projectId,
          name: columnName,
          color: colors[index] ?? "#756b76",
          icon: index === names.length - 1 ? "BadgeCheck" : "CircleDot",
          completed: index === names.length - 1,
          limit: DEFAULT_COLUMN_TASK_LIMIT,
          collapsed: false,
          sortPosition: index,
        });
      });
    });
    this.selectProject(projectId);
    return projectId;
  }

  renameProject(projectId: EntityId, name: string): void {
    const normalized = name.trim();
    if (!normalized) {
      this.showToast("Project name cannot be empty.", "error");
      return;
    }
    this.mutateSnapshot("Project renamed", (snapshot) => {
      snapshot.projects = snapshot.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              name: normalized,
              updatedAt: new Date().toISOString(),
            }
          : project,
      );
    });
  }

  updateProject(
    projectId: EntityId,
    changes: Partial<Pick<Project, "name" | "color" | "icon">>,
  ): void {
    this.mutateSnapshot("Project settings updated", (snapshot) => {
      snapshot.projects = snapshot.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              ...changes,
              updatedAt: new Date().toISOString(),
            }
          : project,
      );
    });
  }

  updateProjectSettings(
    projectId: EntityId,
    changes: Partial<Project["settings"]>,
  ): void {
    this.mutateSnapshot("Project settings updated", (snapshot) => {
      snapshot.projects = snapshot.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              settings: { ...project.settings, ...changes },
              updatedAt: new Date().toISOString(),
            }
          : project,
      );
    });
  }

  duplicateProject(projectId: EntityId): void {
    const snapshot = this.requireSnapshot();
    const source = snapshot.projects.find(
      (project) => project.id === projectId,
    );
    if (!source) {
      return;
    }
    const newProjectId = crypto.randomUUID();
    this.mutateSnapshot("Project duplicated", (draft) => {
      const timestamp = new Date().toISOString();
      draft.projects.push({
        ...structuredClone(source),
        id: newProjectId,
        name: `${source.name} copy`,
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        sortPosition: draft.projects.length,
      });
      const columnMap = new Map<EntityId, EntityId>();
      for (const column of draft.columns.filter(
        (candidate) => candidate.projectId === projectId,
      )) {
        const id = crypto.randomUUID();
        columnMap.set(column.id, id);
        draft.columns.push({ ...column, id, projectId: newProjectId });
      }
      const labelMap = new Map<EntityId, EntityId>();
      for (const label of draft.labels.filter(
        (candidate) => candidate.projectId === projectId,
      )) {
        const id = crypto.randomUUID();
        labelMap.set(label.id, id);
        draft.labels.push({ ...label, id, projectId: newProjectId });
      }
      const memberMap = new Map<EntityId, EntityId>();
      for (const member of draft.members.filter(
        (candidate) => candidate.projectId === projectId,
      )) {
        const id = crypto.randomUUID();
        memberMap.set(member.id, id);
        draft.members.push({ ...member, id, projectId: newProjectId });
      }
      const taskMap = new Map<EntityId, EntityId>();
      const sourceTasks = draft.tasks.filter(
        (candidate) => candidate.projectId === projectId,
      );
      sourceTasks.forEach((sourceTask) => {
        taskMap.set(sourceTask.id, crypto.randomUUID());
      });
      for (const sourceTask of sourceTasks) {
        draft.tasks.push({
          ...structuredClone(sourceTask),
          id: taskMap.get(sourceTask.id) as EntityId,
          projectId: newProjectId,
          columnId: columnMap.get(sourceTask.columnId) as EntityId,
          parentId: sourceTask.parentId
            ? taskMap.get(sourceTask.parentId) ?? null
            : null,
          labelIds: sourceTask.labelIds.flatMap((id) => {
            const mapped = labelMap.get(id);
            return mapped ? [mapped] : [];
          }),
          assigneeId: sourceTask.assigneeId
            ? memberMap.get(sourceTask.assigneeId) ?? null
            : null,
          dependencyIds: sourceTask.dependencyIds.flatMap((id) => {
            const mapped = taskMap.get(id);
            return mapped ? [mapped] : [];
          }),
          checklist: sourceTask.checklist.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
          })),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    });
    this.showToast("Project duplicated.", "success");
  }

  setProjectArchived(projectId: EntityId, archived: boolean): void {
    this.mutateSnapshot(
      archived ? "Project archived" : "Project restored",
      (snapshot) => {
        snapshot.projects = snapshot.projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                archived,
                updatedAt: new Date().toISOString(),
              }
            : project,
        );
      },
    );
    if (archived && this.state.activeProjectId === projectId) {
      this.openDashboard();
    }
  }

  /** Remove a project and its contents without retaining an undo copy.
   *
   * Clear earlier snapshots so later Undo cannot resurrect deleted data.
   * Args:
   *     projectId: The project to permanently remove.
   * Returns:
   *     void: No return value.
   */
  deleteProject(projectId: EntityId): void {
    if (this.state.dataOperation || this.recovering) {
      this.showToast("Wait for the file action before editing.", "warning");
      return;
    }
    this.mutateSnapshot(
      "Project permanently deleted",
      (snapshot) => {
        snapshot.projects = snapshot.projects.filter(
          (project) => project.id !== projectId,
        );
        snapshot.columns = snapshot.columns.filter(
          (column) => column.projectId !== projectId,
        );
        snapshot.labels = snapshot.labels.filter(
          (label) => label.projectId !== projectId,
        );
        snapshot.members = snapshot.members.filter(
          (member) => member.projectId !== projectId,
        );
        snapshot.tasks = snapshot.tasks.filter(
          (task) => task.projectId !== projectId,
        );
        snapshot.savedFilters = snapshot.savedFilters.filter(
          (filter) => filter.projectId !== projectId,
        );
      },
      false,
    );
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.openDashboard();
  }

  bulkUpdate(changes: Partial<Task>): void {
    const ids = this.state.selectedTaskIds;
    if (ids.size === 0) {
      return;
    }
    this.mutateSnapshot("Tasks updated", (snapshot) => {
      const timestamp = new Date().toISOString();
      const projectIds = new Set<EntityId>();
      const tasks = snapshot.tasks.map((task) => {
        if (!ids.has(task.id)) {
          return task;
        }
        projectIds.add(task.projectId);
        const updated = { ...task, ...changes, updatedAt: timestamp };
        if (changes.completed === true) {
          updated.checklist = updated.checklist.map((subtask) => ({
            ...subtask,
            completed: true,
          }));
        }
        return updated;
      });
      snapshot.tasks = changes.completed === true
        ? synchronizeWorkspaceSubtasks({ ...snapshot, tasks }).tasks
        : tasks;
      projectIds.forEach((projectId) => touchProject(snapshot, projectId));
    });
    this.clearTaskSelection();
  }

  bulkMoveTasks(columnId: EntityId): void {
    const ids = this.state.selectedTaskIds;
    if (ids.size === 0) {
      return;
    }
    this.mutateSnapshot("Tasks moved", (snapshot) => {
      const column = snapshot.columns.find(
        (candidate) => candidate.id === columnId,
      );
      if (!column) {
        return;
      }
      const timestamp = new Date().toISOString();
      let destinationIndex = snapshot.tasks.filter(
        (task) =>
          task.columnId === columnId &&
          !task.archived &&
          !ids.has(task.id),
      ).length;
      snapshot.tasks.forEach((task) => {
        if (!ids.has(task.id) || task.projectId !== column.projectId) {
          return;
        }
        task.columnId = columnId;
        Object.assign(
          task,
          synchronizeSubtasksForWorkflowColumn(task, column.completed),
        );
        task.sortPosition = destinationIndex;
        task.updatedAt = timestamp;
        destinationIndex += 1;
      });
      for (const projectColumn of snapshot.columns.filter(
        (candidate) => candidate.projectId === column.projectId,
      )) {
        snapshot.tasks
          .filter(
            (task) =>
              task.columnId === projectColumn.id && !task.archived,
          )
          .sort((left, right) => left.sortPosition - right.sortPosition)
          .forEach((task, index) => {
            task.sortPosition = index;
          });
      }
      touchProject(snapshot, column.projectId);
    });
    this.clearTaskSelection();
  }

  undo(): void {
    if (this.recovering || this.state.dataOperation) return;
    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      this.showToast("Nothing to undo.", "warning");
      return;
    }
    this.redoStack.push(this.requireSnapshot());
    this.restoreHistorySnapshot(snapshot);
    this.scheduleSave();
    this.showToast("Last change undone.", "success");
  }

  /** Reapply the most recently undone workspace change.
   *
   * Return the current snapshot to Undo and persist the restored state.
   * File operations and recovery block history changes.
   * Args:
   *     none: This method does not accept arguments.
   * Returns:
   *     void: No return value.
   */
  redo(): void {
    if (this.recovering || this.state.dataOperation) return;
    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      this.showToast("Nothing to redo.", "warning");
      return;
    }
    this.undoStack.push(this.requireSnapshot());
    this.restoreHistorySnapshot(snapshot);
    this.scheduleSave();
    this.showToast("Last change redone.", "success");
  }

  /** Restore task history while retaining the last selected project.
   *
   * Navigation does not change history or become an undoable edit.
   * Args:
   *     snapshot: The historical workspace to restore.
   * Returns:
   *     void: No return value.
   */
  private restoreHistorySnapshot(snapshot: WorkspaceSnapshot): void {
    this.setState({
      ...this.state,
      snapshot: {
        ...snapshot,
        preferences: {
          ...snapshot.preferences,
          lastProjectId: this.requireSnapshot().preferences.lastProjectId,
        },
      },
    });
  }

  /** Save every pending edit before allowing the desktop window to close.
   *
   * Keep the window open on failure or while another file action runs.
   * The shared data-operation guard blocks editing until closure completes.
   * Args:
   *     close: The native close action, called only after saving succeeds.
   * Returns:
   *     Promise<void>: Resolve after closure or visible failure feedback.
   */
  async closeAfterSave(close: () => Promise<void>): Promise<void> {
    if (this.state.loading) {
      this.showToast("Wait for the workspace to finish loading.", "warning");
      return;
    }
    if (this.state.dataOperation) {
      this.showToast("Wait for the file action before closing.", "warning");
      return;
    }
    if (this.recovering || this.state.loadError) {
      await this.saveQueue;
      await close();
      return;
    }
    await this.runDataOperation(async () => {
      await close();
    }, "");
  }

  completeOnboarding(): void {
    this.updatePreferences({ onboardingComplete: true });
    this.setState({ ...this.state, onboardingOpen: false });
  }

  startBlankWorkspace(): void {
    this.mutateSnapshot(
      "Blank workspace created",
      (snapshot) => {
        snapshot.projects = [];
        snapshot.columns = [];
        snapshot.labels = [];
        snapshot.members = [];
        snapshot.tasks = [];
        snapshot.savedFilters = [];
        snapshot.preferences = {
          ...snapshot.preferences,
          onboardingComplete: true,
          lastProjectId: null,
        };
      },
      false,
    );
    this.setState({
      ...this.state,
      activeProjectId: null,
      activeView: "dashboard",
      onboardingOpen: false,
    });
  }

  setDensity(density: DensityMode): void {
    this.updatePreferences({ density });
  }

  /** Export a project after all pending edits are saved.
   *
   * Args:
   *     projectId: The project to export.
   *     path: The native destination selected by the user.
   * Returns:
   *     Promise<void>: Resolve after completion or visible error feedback.
   */
  async exportProject(projectId: EntityId, path: string): Promise<void> {
    await this.runDataOperation(
      () => this.repository.exportProject(projectId, path),
      "Project exported.",
    );
  }

  /** Import a project after saving pending edits and reset stale undo state.
   *
   * Args:
   *     path: The selected native JSON file.
   * Returns:
   *     Promise<void>: Resolve after completion or visible error feedback.
   */
  async importProject(path: string): Promise<void> {
    await this.runDataOperation(
      () => this.repository.importProject(path), "Project imported.",
    );
  }

  /** Back up persisted data including the latest in-memory edits.
   *
   * Args:
   *     path: The selected native backup destination.
   * Returns:
   *     Promise<void>: Resolve after completion or visible error feedback.
   */
  async backup(path: string): Promise<void> {
    await this.runDataOperation(
      () => this.repository.backup(path), "Database backup created.",
    );
  }

  /** Restore a workspace after draining saves and clear obsolete UI state.
   *
   * Args:
   *     path: The selected native database backup.
   * Returns:
   *     Promise<void>: Resolve after completion or visible error feedback.
   */
  async restore(path: string): Promise<void> {
    await this.runDataOperation(
      () => this.repository.restore(path), "Database restored.",
    );
  }

  /** Run one data action while protecting its saved workspace boundary.
   *
   * Stop before the native action if saving fails. Snapshot replacements
   * invalidate undo and redo history to prevent restoring old data.
   *
   * Args:
   *     action: The native repository action.
   *     message: The completion notification.
   * Returns:
   *     Promise<void>: Resolve once busy state and feedback are updated.
   */
  private async runDataOperation(
    action: () => Promise<WorkspaceSnapshot | void>,
    message: string,
  ): Promise<void> {
    if (this.state.dataOperation) {
      this.showToast("Wait for the current file action to finish.", "warning");
      return;
    }
    this.setState({ ...this.state, dataOperation: true });
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await this.persistNow(true);
      const loaded = await action();
      if (loaded) {
        const snapshot = synchronizeWorkspaceSubtasks(
          normalizeWorkspaceSnapshot(loaded),
        );
        this.persistedRevision = snapshot.revision ?? 0;
        const activeProject = snapshot.projects.find((project) =>
          project.id === this.state.activeProjectId && !project.archived
        ) ?? snapshot.projects.find((project) =>
          project.id === snapshot.preferences.lastProjectId && !project.archived
        ) ?? snapshot.projects.find((project) => !project.archived);
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.saveVersion += 1;
        this.setState({
          ...this.state,
          snapshot,
          activeProjectId: activeProject?.id ?? null,
          activeView: activeProject?.settings.defaultView ?? "dashboard",
          selectedTaskId: null,
          selectedTaskIds: new Set(),
          filter: EMPTY_FILTER,
          saveState: "saved",
          saveError: null,
        });
        await this.persistNow(true);
      }
      if (message) this.showToast(message, "success");
    } catch (error) {
      this.showToast(this.errorMessage(error), "error");
    } finally {
      this.setState({ ...this.state, dataOperation: false });
    }
  }

  /** Pause editing and queued autosaves when the workspace needs recovery.
   *
   * Args:
   *     message: The validation or rendering failure shown to the user.
   * Returns:
   *     void: No return value.
   */
  enterRecovery(message: string): void {
    this.recovering = true;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.setState({ ...this.state, loadError: message, loading: false });
  }

  /** Save a troubleshooting copy without saving damaged in-memory data.
   *
   * Args:
   *     path: A native-dialog-selected destination.
   * Returns:
   *     Promise<void>: Resolves after the recovery copy completes.
   */
  async recoverDatabase(path: string): Promise<void> {
    await this.runRecoveryOperation(() => this.repository.recoverDatabase(path));
  }

  /** Restore validated persisted data without relying on broken project views.
   *
   * Args:
   *     path: A backup selected through the native open dialog.
   * Returns:
   *     Promise<void>: Resolves once safe workspace state is available.
   */
  async restoreForRecovery(path: string): Promise<void> {
    const loaded = await this.runRecoveryOperation(() => this.repository.restore(path));
    const snapshot = synchronizeWorkspaceSubtasks(
      normalizeWorkspaceSnapshot(loaded),
    );
    this.persistedRevision = snapshot.revision ?? 0;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.recovering = false;
    this.saveVersion += 1;
    this.setState({
      ...initialState, snapshot, loading: false,
      activeProjectId: snapshot.preferences.lastProjectId ?? null,
      activeView: "dashboard", saveState: "saved",
    });
  }

  /** Serialize recovery actions and keep closure blocked until completion.
   *
   * Args:
   *     action: A native copy or restore action independent of project views.
   * Returns:
   *     Promise<T>: The completed native action result.
   */
  private async runRecoveryOperation<T>(action: () => Promise<T>): Promise<T> {
    if (this.state.dataOperation) {
      throw new Error("Wait for the current file action to finish.");
    }
    this.setState({ ...this.state, dataOperation: true });
    try {
      await this.saveQueue;
      return await action();
    } finally {
      this.setState({ ...this.state, dataOperation: false });
    }
  }

  updatePreferences(
    changes: Partial<WorkspaceSnapshot["preferences"]>,
    pushUndo = true,
  ): void {
    this.mutateSnapshot(
      "Preferences updated",
      (snapshot) => {
        snapshot.preferences = { ...snapshot.preferences, ...changes };
      },
      pushUndo,
    );
  }

  showToast(
    message: string,
    tone: ToastMessage["tone"] = "success",
  ): void {
    this.toastId += 1;
    this.setState({
      ...this.state,
      toast: { id: this.toastId, message, tone },
    });
  }

  dismissToast(): void {
    this.setState({ ...this.state, toast: null });
  }

  async retrySave(): Promise<void> {
    await this.persistNow();
  }

  private mutateSnapshot(
    _message: string,
    update: (snapshot: WorkspaceSnapshot) => void,
    pushUndo = true,
  ): void {
    if (this.state.dataOperation || this.recovering) {
      this.showToast("Wait for the file action before editing.", "warning");
      return;
    }
    const current = this.requireSnapshot();
    const next = structuredClone(current);
    update(next);
    this.redoStack.length = 0;
    if (pushUndo) {
      this.undoStack.push(current);
      if (this.undoStack.length > 30) {
        this.undoStack.shift();
      }
    }
    this.setState({ ...this.state, snapshot: next });
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.setState({
      ...this.state,
      saveState: "saving",
      saveError: null,
    });
    this.saveVersion += 1;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persistNow();
    }, 350);
  }

  /** Queue a stable snapshot and optionally propagate write failures.
   *
   * Args:
   *     propagateErrors: Whether a waiting data action must abort on failure.
   * Returns:
   *     Promise<void>: The queued save completion.
   */
  private persistNow(propagateErrors = false): Promise<void> {
    const snapshot = this.state.snapshot;
    if (!snapshot) {
      return Promise.resolve();
    }
    const version = this.saveVersion;
    const stableSnapshot = structuredClone(snapshot);
    const operation = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          if (this.recovering) return;
          stableSnapshot.revision = this.persistedRevision;
          const revision = await this.repository.save(stableSnapshot);
          this.persistedRevision = revision;
          if (this.state.snapshot) {
            this.setState({
              ...this.state,
              snapshot: { ...this.state.snapshot, revision },
            });
          }
          if (version === this.saveVersion) {
            this.setState({
              ...this.state,
              saveState: "saved",
              saveError: null,
            });
          }
        } catch (error) {
          if (version === this.saveVersion) {
            this.setState({
              ...this.state,
              saveState: "error",
              saveError: this.errorMessage(error),
            });
          }
          throw error;
        }
      });
    this.saveQueue = operation.catch(() => undefined);
    return propagateErrors ? operation : operation.catch(() => undefined);
  }

  private requireSnapshot(): WorkspaceSnapshot {
    if (!this.state.snapshot) {
      throw new Error("The workspace has not finished loading.");
    }
    return this.state.snapshot;
  }

  private setState(state: WorkspaceState): void {
    this.state = {
      ...state,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    };
    this.listeners.forEach((listener) => listener());
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const workspaceStore = new WorkspaceStore();

export function useWorkspace(): WorkspaceState {
  return useSyncExternalStore(
    workspaceStore.subscribe,
    workspaceStore.getSnapshot,
    workspaceStore.getSnapshot,
  );
}
