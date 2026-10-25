import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import {
  topologicalTaskIds,
  wouldCreateDependencyCycle,
  wouldCreateParentCycle,
} from "./dependencies";

describe("dependency validation", () => {
  const tasks = createDemoWorkspace(new Date("2026-09-04T12:00:00Z")).tasks;
  const survey = tasks.find((task) => task.title === "Survey the north plot");
  const permit = tasks.find((task) => task.title === "Confirm site permit");
  const suppliers = tasks.find(
    (task) => task.title === "Compare compost suppliers",
  );

  it("detects a finish-to-start cycle before it is added", () => {
    expect(survey).toBeDefined();
    expect(permit).toBeDefined();
    if (!survey || !permit) return;
    expect(wouldCreateDependencyCycle(tasks, survey.id, permit.id)).toBe(true);
  });

  it("accepts an acyclic dependency and produces a complete order", () => {
    expect(suppliers).toBeDefined();
    expect(survey).toBeDefined();
    if (!suppliers || !survey) return;
    expect(wouldCreateDependencyCycle(tasks, suppliers.id, survey.id)).toBe(
      false,
    );
    expect(topologicalTaskIds(tasks)).toHaveLength(tasks.length);
  });

  it("rejects assigning a descendant as a parent", () => {
    const parent = tasks[0];
    const child = tasks[1];
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    if (!parent || !child) return;
    const hierarchy = tasks.map((task) =>
      task.id === child.id ? { ...task, parentId: parent.id } : task,
    );
    expect(wouldCreateParentCycle(hierarchy, parent.id, child.id)).toBe(true);
  });
});
