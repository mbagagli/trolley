import workspaceDefaults from "../config/workspace-defaults.json";

import { deriveQuadrant } from "./quadrant";
import type { FilterState, Task } from "./types";

export const EMPTY_FILTER = workspaceDefaults.filter as FilterState;

/** Count selected conditions, including search and completion visibility.
 *
 * Args:
 *     filter: The shared project filter.
 * Returns:
 *     number: The number of active conditions.
 */
export function activeFilterCount(filter: FilterState): number {
  return filter.columnIds.length + filter.labelIds.length +
    filter.priorities.length + filter.quadrants.length +
    filter.assigneeIds.length + Number(Boolean(filter.dueFrom)) +
    Number(Boolean(filter.dueTo)) + Number(!filter.includeCompleted) +
    Number(Boolean(filter.query.trim()));
}

export function taskMatchesFilter(task: Task, filter: FilterState): boolean {
  const query = filter.query.trim().toLocaleLowerCase();
  if (
    query &&
    !`${task.title} ${task.description} ${task.notes}`
      .toLocaleLowerCase()
      .includes(query)
  ) {
    return false;
  }
  if (
    filter.columnIds.length > 0 &&
    !filter.columnIds.includes(task.columnId)
  ) {
    return false;
  }
  if (
    filter.labelIds.length > 0 &&
    !filter.labelIds.some((labelId) => task.labelIds.includes(labelId))
  ) {
    return false;
  }
  if (
    filter.priorities.length > 0 &&
    !filter.priorities.includes(task.priority)
  ) {
    return false;
  }
  if (
    filter.quadrants.length > 0 &&
    !filter.quadrants.includes(
      deriveQuadrant(task.isUrgent, task.isImportant),
    )
  ) {
    return false;
  }
  if (
    filter.assigneeIds.length > 0 &&
    (!task.assigneeId || !filter.assigneeIds.includes(task.assigneeId))
  ) {
    return false;
  }
  if (filter.dueFrom && (!task.dueDate || task.dueDate < filter.dueFrom)) {
    return false;
  }
  if (filter.dueTo && (!task.dueDate || task.dueDate > filter.dueTo)) {
    return false;
  }
  return filter.includeCompleted || !task.completed;
}
