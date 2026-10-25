import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { sortTasks } from "./sorting";

describe("task sorting", () => {
  const tasks = createDemoWorkspace(new Date("2026-09-04T12:00:00Z")).tasks;

  it("sorts higher priority ranks first without mutating input", () => {
    const original = [...tasks];
    const ordered = sortTasks(tasks, "priority");
    expect(ordered[0]?.priority).toBe(5);
    expect(tasks).toEqual(original);
  });

  it("places unscheduled tasks after dated tasks", () => {
    const source = tasks[0];
    expect(source).toBeDefined();
    if (!source) return;
    const undated = {
      ...source,
      id: "314c2dc6-7060-4b63-b965-423e5a5c9d22",
      startDate: null,
      dueDate: null,
    };
    const ordered = sortTasks([...tasks, undated], "due-date");
    const firstMissingDate = ordered.findIndex((task) => !task.dueDate);
    let lastDated = -1;
    ordered.forEach((task, index) => {
      if (task.dueDate) lastDated = index;
    });
    expect(firstMissingDate).toBeGreaterThan(lastDated);
  });

  it("groups manual list order by workflow column", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const ordered = sortTasks(snapshot.tasks, "manual", snapshot.columns);
    const columnPositions = ordered.map((task) =>
      snapshot.columns.find((column) => column.id === task.columnId)
        ?.sortPosition,
    );

    expect(columnPositions).toEqual([...columnPositions].sort());
  });
});
