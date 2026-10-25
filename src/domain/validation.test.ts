import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { validateTask, validateTaskDates } from "./validation";

describe("task validation", () => {
  it("accepts missing dates and ordered date ranges", () => {
    expect(validateTaskDates(null, null)).toEqual([]);
    expect(validateTaskDates("2026-09-01", "2026-09-08")).toEqual([]);
  });

  it("rejects an inverted date range", () => {
    expect(validateTaskDates("2026-09-08", "2026-09-01")).toEqual([
      {
        field: "dueDate",
        message: "Due date must be on or after the start date.",
      },
    ]);
  });

  it("rejects self-dependencies and out-of-range progress", () => {
    const task = createDemoWorkspace(new Date("2026-09-04T12:00:00Z"))
      .tasks[0];
    expect(task).toBeDefined();
    if (!task) return;
    const issues = validateTask({
      ...task,
      progress: 110,
      dependencyIds: [task.id],
    });
    expect(issues.map((issue) => issue.field)).toEqual([
      "progress",
      "dependencies",
    ]);
  });

  it("rejects empty or duplicate sub-tasks", () => {
    const task = createDemoWorkspace(new Date("2026-09-04T12:00:00Z"))
      .tasks.find((candidate) => candidate.checklist.length > 0);
    expect(task).toBeDefined();
    if (!task) return;
    const first = task.checklist[0];
    expect(first).toBeDefined();
    if (!first) return;

    const issues = validateTask({
      ...task,
      checklist: [first, { ...first, title: "  " }],
    });

    expect(issues.map((issue) => issue.message)).toEqual([
      "Sub-task descriptions cannot be empty.",
      "Sub-task identifiers must be unique.",
    ]);
  });
});
