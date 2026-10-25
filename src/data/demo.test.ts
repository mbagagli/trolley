import { describe, expect, it } from "vitest";

import { DEFAULT_COLUMN_TASK_LIMIT } from "../config/product";
import { createDemoWorkspace } from "./demo";

describe("createDemoWorkspace", () => {
  it("ships only the populated community garden project", () => {
    const snapshot = createDemoWorkspace();
    expect(snapshot.projects).toHaveLength(1);
    const project = snapshot.projects[0]!;
    expect(project.name).toBe("Community garden launch");
    expect(project.archived).toBe(false);
    expect(snapshot.tasks).toHaveLength(8);
    for (const collection of [snapshot.tasks, snapshot.columns,
      snapshot.labels, snapshot.members, snapshot.savedFilters]) {
      expect(collection.every((item) => item.projectId === project.id))
        .toBe(true);
    }
    expect(snapshot.preferences.lastProjectId).toBe(project.id);
  });

  it("uses the twenty-card limit for limited workflow columns", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const limitedColumns = snapshot.columns.filter(
      (column) => column.limit !== null,
    );

    expect(DEFAULT_COLUMN_TASK_LIMIT).toBe(20);
    expect(limitedColumns).not.toHaveLength(0);
    for (const column of limitedColumns) {
      expect(column.limit).toBe(DEFAULT_COLUMN_TASK_LIMIT);
    }
  });
});
