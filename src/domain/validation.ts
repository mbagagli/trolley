import type { Task } from "./types";

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateTaskDates(
  startDate: string | null,
  dueDate: string | null,
): ValidationIssue[] {
  if (!startDate || !dueDate) {
    return [];
  }
  const start = Date.parse(`${startDate}T00:00:00`);
  const due = Date.parse(`${dueDate}T00:00:00`);
  if (Number.isNaN(start) || Number.isNaN(due)) {
    return [{ field: "dates", message: "Enter valid calendar dates." }];
  }
  if (due < start) {
    return [
      {
        field: "dueDate",
        message: "Due date must be on or after the start date.",
      },
    ];
  }
  return [];
}

export function validateTask(task: Task): ValidationIssue[] {
  const issues = validateTaskDates(task.startDate, task.dueDate);
  if (!task.title.trim()) {
    issues.push({ field: "title", message: "Task title cannot be empty." });
  }
  if (task.progress < 0 || task.progress > 100) {
    issues.push({
      field: "progress",
      message: "Progress must be between 0 and 100.",
    });
  }
  if (task.checklist.some((subtask) => !subtask.title.trim())) {
    issues.push({
      field: "checklist",
      message: "Sub-task descriptions cannot be empty.",
    });
  }
  const subtaskIds = new Set(task.checklist.map((subtask) => subtask.id));
  if (subtaskIds.size !== task.checklist.length) {
    issues.push({
      field: "checklist",
      message: "Sub-task identifiers must be unique.",
    });
  }
  if (task.dependencyIds.includes(task.id)) {
    issues.push({
      field: "dependencies",
      message: "A task cannot depend on itself.",
    });
  }
  return issues;
}
