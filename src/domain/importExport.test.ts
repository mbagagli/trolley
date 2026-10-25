import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { exportProject, parseProjectExport } from "./importExport";

describe("project import and export", () => {
  it("exports only records from the selected project", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0];
    expect(project).toBeDefined();
    if (!project) return;
    const exported = exportProject(
      snapshot,
      project.id,
      "2026-09-04T12:00:00.000Z",
    );
    expect(exported.project.id).toBe(project.id);
    expect(
      exported.tasks.every((task) => task.projectId === project.id),
    ).toBe(true);
    expect(exported.exportedAt).toBe("2026-09-04T12:00:00.000Z");
  });

  it("round-trips supported JSON and rejects unrelated JSON", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0];
    expect(project).toBeDefined();
    if (!project) return;
    const serialized = JSON.stringify(exportProject(snapshot, project.id));
    expect(parseProjectExport(serialized).project.id).toBe(project.id);
    expect(() => parseProjectExport('{"hello":"world"}')).toThrow(
      "not a supported Trolley project",
    );
  });
});
