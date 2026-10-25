import { reorderItemsById } from "./ordering";
import type {
  ChecklistItem,
  Task,
  WorkflowColumn,
  WorkspaceSnapshot,
} from "./types";

export interface SubtaskSummary {
  completed: number;
  complete: boolean;
  progress: number;
  total: number;
}

type SubtaskTaskChanges = Pick<
  Task,
  "checklist" | "completed" | "progress"
>;

export function summarizeSubtasks(
  subtasks: readonly ChecklistItem[],
): SubtaskSummary {
  const completed = subtasks.reduce(
    (total, subtask) => total + Number(subtask.completed),
    0,
  );
  const total = subtasks.length;
  return {
    completed,
    complete: total > 0 && completed === total,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    total,
  };
}

export function synchronizeTaskSubtasks(
  task: Task,
  subtasks: readonly ChecklistItem[],
): SubtaskTaskChanges {
  const checklist = subtasks.map((subtask, index) => ({
    ...subtask,
    sortPosition: index,
  }));
  if (checklist.length === 0) {
    return {
      checklist,
      completed: task.completed,
      progress: task.progress,
    };
  }
  const summary = summarizeSubtasks(checklist);
  return {
    checklist,
    completed: summary.complete,
    progress: summary.progress,
  };
}

export function synchronizeSubtasksForWorkflowColumn(
  task: Task,
  completedColumn: boolean,
): SubtaskTaskChanges {
  if (task.checklist.length === 0) {
    return {
      checklist: task.checklist,
      completed: completedColumn,
      progress: completedColumn ? 100 : task.progress,
    };
  }
  if (completedColumn) {
    return synchronizeTaskSubtasks(
      task,
      task.checklist.map((subtask) => ({
        ...subtask,
        completed: true,
      })),
    );
  }
  const checklist = task.checklist.map((subtask) => ({ ...subtask }));
  if (checklist.every((subtask) => subtask.completed)) {
    const lastCompleted = checklist[checklist.length - 1];
    if (lastCompleted) {
      lastCompleted.completed = false;
    }
  }
  return synchronizeTaskSubtasks(task, checklist);
}

export function synchronizeWorkspaceSubtasks(
  snapshot: WorkspaceSnapshot,
): WorkspaceSnapshot {
  let changed = false;
  const synchronizedTasks = snapshot.tasks.map((task) => {
    if (task.checklist.length === 0) {
      return task;
    }
    const updates = synchronizeTaskSubtasks(task, task.checklist);
    const positionsChanged = updates.checklist.some(
      (subtask, index) =>
        subtask.sortPosition !== task.checklist[index]?.sortPosition,
    );
    if (
      task.completed === updates.completed &&
      task.progress === updates.progress &&
      !positionsChanged
    ) {
      return task;
    }
    changed = true;
    return { ...task, ...updates };
  });
  const alignedTasks = synchronizedTasks.map((task) => {
    const columnId = subtaskCompletionColumnId(task, snapshot.columns);
    if (!columnId || columnId === task.columnId) {
      return task;
    }
    changed = true;
    return {
      ...task,
      columnId,
      sortPosition: Number.MAX_SAFE_INTEGER,
    };
  });
  const positions = new Map<string, number>();
  for (const column of snapshot.columns) {
    alignedTasks
      .filter((task) => task.columnId === column.id && !task.archived)
      .sort((left, right) => left.sortPosition - right.sortPosition)
      .forEach((task, index) => positions.set(task.id, index));
  }
  const tasks = alignedTasks.map((task) => {
    const sortPosition = positions.get(task.id);
    if (sortPosition === undefined || sortPosition === task.sortPosition) {
      return task;
    }
    changed = true;
    return { ...task, sortPosition };
  });
  return changed ? { ...snapshot, tasks } : snapshot;
}

function subtaskCompletionColumnId(
  task: Task,
  columns: readonly WorkflowColumn[],
): string | null {
  if (task.checklist.length === 0) {
    return null;
  }
  const projectColumns = columns
    .filter((column) => column.projectId === task.projectId)
    .sort((left, right) => left.sortPosition - right.sortPosition);
  const currentColumn = projectColumns.find(
    (column) => column.id === task.columnId,
  );
  if (task.completed) {
    return currentColumn?.completed
      ? currentColumn.id
      : projectColumns.find((column) => column.completed)?.id ?? null;
  }
  if (!currentColumn?.completed) {
    return task.columnId;
  }
  const priorColumns = projectColumns.filter(
    (column) =>
      !column.completed && column.sortPosition < currentColumn.sortPosition,
  );
  const lastPriorColumn = priorColumns[priorColumns.length - 1];
  return lastPriorColumn?.id ??
    projectColumns.find((column) => !column.completed)?.id ??
    null;
}

export function reorderSubtasks(
  subtasks: readonly ChecklistItem[],
  activeId: string,
  overId: string,
): ChecklistItem[] {
  return reorderItemsById(subtasks, activeId, overId).map(
    (subtask, index) => ({
      ...subtask,
      sortPosition: index,
    }),
  );
}
