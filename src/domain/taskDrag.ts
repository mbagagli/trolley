import type { Task, WorkflowColumn } from "./types";

export type TaskOrder = Record<string, string[]>;

export interface TaskPlacement {
  beforeTaskId: string | null;
  columnId: string;
}

export function createTaskOrder(
  columns: WorkflowColumn[],
  tasks: Task[],
): TaskOrder {
  return Object.fromEntries(
    columns.map((column) => [
      column.id,
      tasks
        .filter((task) => task.columnId === column.id)
        .sort((left, right) => left.sortPosition - right.sortPosition)
        .map((task) => task.id),
    ]),
  );
}

export function moveTaskInOrder(
  order: TaskOrder,
  taskId: string,
  destinationColumnId: string,
  overTaskId: string | null,
): TaskOrder {
  const sourceColumnId = Object.keys(order).find((columnId) =>
    order[columnId]?.includes(taskId),
  );
  const destination = order[destinationColumnId];
  if (!sourceColumnId || !destination || overTaskId === taskId) {
    return order;
  }
  const insertionIndex = overTaskId
    ? destination.indexOf(overTaskId)
    : destination.length;
  if (overTaskId && insertionIndex < 0) {
    return order;
  }
  const next = Object.fromEntries(
    Object.entries(order).map(([columnId, taskIds]) => [
      columnId,
      [...taskIds],
    ]),
  );
  next[sourceColumnId] = (next[sourceColumnId] ?? []).filter(
    (candidate) => candidate !== taskId,
  );
  const target = next[destinationColumnId] ?? [];
  target.splice(Math.min(insertionIndex, target.length), 0, taskId);
  next[destinationColumnId] = target;
  return next;
}

export function findTaskPlacement(
  order: TaskOrder,
  taskId: string,
): TaskPlacement | null {
  const entry = Object.entries(order).find(([, taskIds]) =>
    taskIds.includes(taskId),
  );
  if (!entry) {
    return null;
  }
  const taskIndex = entry[1].indexOf(taskId);
  return {
    beforeTaskId: entry[1][taskIndex + 1] ?? null,
    columnId: entry[0],
  };
}
