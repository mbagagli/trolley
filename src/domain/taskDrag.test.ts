import { describe, expect, it } from "vitest";

import {
  findTaskPlacement,
  moveTaskInOrder,
  type TaskOrder,
} from "./taskDrag";

describe("task drag ordering", () => {
  it("moves a task before another task in a different column", () => {
    const order: TaskOrder = {
      backlog: ["task-a", "task-b"],
      ready: ["task-c", "task-d"],
    };

    const moved = moveTaskInOrder(
      order,
      "task-b",
      "ready",
      "task-d",
    );

    expect(moved).toEqual({
      backlog: ["task-a"],
      ready: ["task-c", "task-b", "task-d"],
    });
    expect(findTaskPlacement(moved, "task-b")).toEqual({
      beforeTaskId: "task-d",
      columnId: "ready",
    });
  });

  it("moves a task to an empty column", () => {
    const order: TaskOrder = {
      backlog: ["task-a"],
      ready: [],
    };

    const moved = moveTaskInOrder(order, "task-a", "ready", null);

    expect(findTaskPlacement(moved, "task-a")).toEqual({
      beforeTaskId: null,
      columnId: "ready",
    });
  });
});
