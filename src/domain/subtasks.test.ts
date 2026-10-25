import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import {
  reorderSubtasks,
  summarizeSubtasks,
  synchronizeSubtasksForWorkflowColumn,
  synchronizeTaskSubtasks,
  synchronizeWorkspaceSubtasks,
} from "./subtasks";

describe("sub-task completion", () => {
  const task = createDemoWorkspace(
    new Date("2026-09-04T12:00:00Z"),
  ).tasks.find((candidate) => candidate.checklist.length === 3);

  it("summarizes checked sub-tasks", () => {
    expect(task).toBeDefined();
    if (!task) return;

    expect(summarizeSubtasks(task.checklist)).toEqual({
      completed: 1,
      complete: false,
      progress: 33,
      total: 3,
    });
  });

  it("derives task progress and completion from sub-tasks", () => {
    expect(task).toBeDefined();
    if (!task) return;
    const completed = task.checklist.map((subtask) => ({
      ...subtask,
      completed: true,
    }));

    expect(synchronizeTaskSubtasks(task, completed)).toMatchObject({
      completed: true,
      progress: 100,
    });
  });

  it("reorders sub-tasks and normalizes their positions", () => {
    expect(task).toBeDefined();
    if (!task) return;
    const first = task.checklist[0];
    const last = task.checklist[2];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (!first || !last) return;

    const reordered = reorderSubtasks(task.checklist, first.id, last.id);

    expect(reordered.map((subtask) => subtask.id)).toEqual([
      task.checklist[1]?.id,
      last.id,
      first.id,
    ]);
    expect(reordered.map((subtask) => subtask.sortPosition)).toEqual([
      0,
      1,
      2,
    ]);
  });

  it("normalizes persisted task progress when a workspace loads", () => {
    expect(task).toBeDefined();
    if (!task) return;
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const normalized = synchronizeWorkspaceSubtasks(snapshot);
    const normalizedTask = normalized.tasks.find(
      (candidate) => candidate.id === task.id,
    );

    expect(normalizedTask?.progress).toBe(33);
    expect(normalizedTask?.completed).toBe(false);
  });

  it("aligns completed sub-tasks with workflow completion", () => {
    expect(task).toBeDefined();
    if (!task) return;
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const completeColumn = snapshot.columns.find(
      (column) => column.completed,
    );
    const mismatchedTask = snapshot.tasks.find(
      (candidate) => candidate.id === task.id,
    );
    expect(completeColumn).toBeDefined();
    expect(mismatchedTask).toBeDefined();
    if (!completeColumn || !mismatchedTask) return;
    mismatchedTask.checklist = mismatchedTask.checklist.map((subtask) => ({
      ...subtask,
      completed: true,
    }));

    const normalized = synchronizeWorkspaceSubtasks(snapshot);
    const normalizedTask = normalized.tasks.find(
      (candidate) => candidate.id === task.id,
    );

    expect(normalizedTask?.columnId).toBe(completeColumn.id);
    expect(normalizedTask?.completed).toBe(true);
    expect(normalizedTask?.progress).toBe(100);
  });

  it("reopens the last sub-task when leaving a completion column", () => {
    expect(task).toBeDefined();
    if (!task) return;
    const completed = {
      ...task,
      checklist: task.checklist.map((subtask) => ({
        ...subtask,
        completed: true,
      })),
      completed: true,
      progress: 100,
    };

    const reopened = synchronizeSubtasksForWorkflowColumn(completed, false);

    expect(reopened.completed).toBe(false);
    expect(reopened.progress).toBe(67);
    expect(reopened.checklist.filter((item) => !item.completed)).toHaveLength(
      1,
    );
  });
});
