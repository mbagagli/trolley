import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import type { Task } from "./types";
import { flattenTaskHierarchy, MAX_HIERARCHY_DEPTH } from "./hierarchy";

function taskWithParent(
  task: Task,
  id: string,
  parentId: string | null,
  sortPosition: number,
): Task {
  return { ...task, id, parentId, sortPosition };
}

describe("flattenTaskHierarchy", () => {
  const source = createDemoWorkspace(
    new Date("2026-09-04T12:00:00Z"),
  ).tasks[0];

  it("includes nested descendants in depth-first order", () => {
    expect(source).toBeDefined();
    if (!source) return;
    const tasks = [
      taskWithParent(source, "root", null, 0),
      taskWithParent(source, "child", "root", 0),
      taskWithParent(source, "grandchild", "child", 0),
    ];
    expect(
      flattenTaskHierarchy(tasks, new Set()).map(({ task, depth }) => [
        task.id,
        depth,
      ]),
    ).toEqual([
      ["root", 0],
      ["child", 1],
      ["grandchild", 2],
    ]);
  });

  it("hides all descendants of a collapsed task", () => {
    expect(source).toBeDefined();
    if (!source) return;
    const tasks = [
      taskWithParent(source, "root", null, 0),
      taskWithParent(source, "child", "root", 0),
      taskWithParent(source, "grandchild", "child", 0),
    ];
    expect(
      flattenTaskHierarchy(tasks, new Set(["root"])).map(
        ({ task }) => task.id,
      ),
    ).toEqual(["root"]);
  });
  it("traverses a deep chain without recursion and bounds display depth", () => {
    if (!source) throw new Error("Missing demo task");
    const tasks = Array.from({ length: 10000 }, (_, index) =>
      taskWithParent(source, String(index), index ? String(index - 1) : null,
        index));
    const result = flattenTaskHierarchy(tasks, new Set());
    expect(result).toHaveLength(10000);
    expect(result[result.length - 1]?.depth).toBe(MAX_HIERARCHY_DEPTH);
    expect(flattenTaskHierarchy(tasks, new Set(["0"])))
      .toHaveLength(1);
  });

});
