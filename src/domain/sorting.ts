import { comparePriority } from "./priority";
import type { Task, WorkflowColumn } from "./types";

export type TaskSort = "manual" | "priority" | "due-date" | "title";

export function sortTasks(
  tasks: Task[],
  sort: TaskSort,
  columns: WorkflowColumn[] = [],
): Task[] {
  const columnPositions = new Map(
    columns.map((column) => [column.id, column.sortPosition]),
  );
  return [...tasks].sort((left, right) => {
    if (sort === "priority") {
      return comparePriority(right.priority, left.priority) ||
        left.sortPosition - right.sortPosition;
    }
    if (sort === "due-date") {
      if (!left.dueDate) return 1;
      if (!right.dueDate) return -1;
      return left.dueDate.localeCompare(right.dueDate) ||
        left.sortPosition - right.sortPosition;
    }
    if (sort === "title") {
      return left.title.localeCompare(right.title);
    }
    return (columnPositions.get(left.columnId) ?? 0) -
        (columnPositions.get(right.columnId) ?? 0) ||
      left.sortPosition - right.sortPosition;
  });
}
