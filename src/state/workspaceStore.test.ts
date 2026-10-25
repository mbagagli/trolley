import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_COLUMN_TASK_LIMIT } from "../config/product";
import { createDemoWorkspace } from "../data/demo";
import type { WorkspaceSnapshot } from "../domain/types";
import { WorkspaceRepository } from "../services/workspaceRepository";
import { WorkspaceStore } from "./workspaceStore";

/** Create a second project for navigation and deletion tests.
 *
 * Keep multi-project fixtures independent of the shipped demo content.
 *
 * Args:
 *     none: This function does not accept arguments.
 * Returns:
 *     WorkspaceSnapshot: Demo data with an additional empty project.
 */
function createMultiProjectWorkspace(): WorkspaceSnapshot {
  const snapshot = createDemoWorkspace();
  snapshot.projects.push({
    ...structuredClone(snapshot.projects[0]!),
    id: "9f65b673-35fe-4d72-b489-a1e52c0b0c78",
    name: "Navigation test project",
    sortPosition: 1,
  });
  return snapshot;
}

class DeferredRepository extends WorkspaceRepository {
  readonly snapshots: WorkspaceSnapshot[] = [];
  readonly releases: Array<() => void> = [];
  private readonly initial: WorkspaceSnapshot;

  constructor(initial: WorkspaceSnapshot) {
    super();
    this.initial = initial;
  }

  override async load(): Promise<WorkspaceSnapshot> {
    return structuredClone(this.initial);
  }

  override save(snapshot: WorkspaceSnapshot): Promise<number> {
    this.snapshots.push(structuredClone(snapshot));
    return new Promise((resolve) => this.releases.push(
      () => resolve((snapshot.revision ?? 0) + 1),
    ));
  }
}

describe("WorkspaceStore autosave", () => {
  it("preserves redo across project navigation and reports availability", async () => {
    vi.useFakeTimers();
    const initial = createMultiProjectWorkspace();
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();
    const project = initial.projects[0]!;
    const other = initial.projects[1]!;
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.getSnapshot().canRedo).toBe(false);
    store.renameProject(project.id, "History edit");
    expect(store.getSnapshot().canUndo).toBe(true);
    store.undo();
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.getSnapshot().canRedo).toBe(true);
    store.selectProject(other.id);
    store.redo();
    expect(store.getSnapshot().snapshot?.projects[0]?.name)
      .toBe("History edit");
    expect(store.getSnapshot().snapshot?.preferences.lastProjectId)
      .toBe(other.id);
    expect(store.getSnapshot().canRedo).toBe(false);
    store.undo();
    expect(store.getSnapshot().snapshot?.preferences.lastProjectId)
      .toBe(other.id);
  });

  it("drains in-flight saves and saves the latest edit before closing", async () => {
    vi.useFakeTimers();
    const initial = createMultiProjectWorkspace();
    initial.preferences.columnTaskLimitMigrated = true;
    const repository = new DeferredRepository(initial);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    store.renameProject(initial.projects[0]!.id, "First queued edit");
    await vi.advanceTimersByTimeAsync(350);
    store.renameProject(initial.projects[0]!.id, "Last edit before close");
    const close = vi.fn().mockResolvedValue(undefined);
    const closing = store.closeAfterSave(close);
    const duplicateClose = vi.fn().mockResolvedValue(undefined);
    await store.closeAfterSave(duplicateClose);
    expect(duplicateClose).not.toHaveBeenCalled();
    expect(store.getSnapshot().dataOperation).toBe(true);
    store.renameProject(initial.projects[0]!.id, "Blocked while closing");
    const activeProjectId = store.getSnapshot().activeProjectId;
    store.selectProject(initial.projects[1]!.id);
    expect(store.getSnapshot().activeProjectId).toBe(activeProjectId);
    expect(close).not.toHaveBeenCalled();
    expect(repository.snapshots).toHaveLength(1);
    repository.releases[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.snapshots).toHaveLength(2);
    expect(repository.snapshots[1]!.projects[0]!.name)
      .toBe("Last edit before close");
    expect(close).not.toHaveBeenCalled();
    repository.releases[1]!();
    await closing;
    expect(close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(repository.snapshots).toHaveLength(2);
    expect(store.getSnapshot().dataOperation).toBe(false);
  });

  it("keeps the window open after a failed save and permits retry", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace();
    initial.preferences.columnTaskLimitMigrated = true;
    const repository = new DeferredRepository(initial);
    const save = vi.spyOn(repository, "save")
      .mockRejectedValueOnce(new Error("Disk is read-only"))
      .mockResolvedValue(1);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    store.renameProject(initial.projects[0]!.id, "Keep this edit");
    const close = vi.fn().mockResolvedValue(undefined);
    await store.closeAfterSave(close);
    expect(close).not.toHaveBeenCalled();
    expect(store.getSnapshot().saveState).toBe("error");
    expect(store.getSnapshot().dataOperation).toBe(false);
    expect(store.getSnapshot().toast?.message).toBe("Disk is read-only");
    await store.closeAfterSave(close);
    expect(save).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains the saved workspace if native closure fails", async () => {
    const initial = createDemoWorkspace();
    initial.preferences.columnTaskLimitMigrated = true;
    const repository = new DeferredRepository(initial);
    vi.spyOn(repository, "save").mockResolvedValue(1);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    await store.closeAfterSave(vi.fn().mockRejectedValue(
      new Error("Native close failed"),
    ));
    expect(store.getSnapshot().dataOperation).toBe(false);
    expect(store.getSnapshot().saveState).toBe("saved");
    expect(store.getSnapshot().toast?.message).toBe("Native close failed");
  });
  it("cycles undo and redo and discards redo after a fresh edit", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace();
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();
    const project = initial.projects[0]!;
    store.renameProject(project.id, "First edit");
    store.renameProject(project.id, "Second edit");
    const name = () => store.getSnapshot().snapshot!.projects[0]!.name;
    store.undo();
    store.undo();
    expect(name()).toBe(project.name);
    store.redo();
    expect(name()).toBe("First edit");
    store.redo();
    expect(name()).toBe("Second edit");
    store.undo();
    store.renameProject(project.id, "New branch");
    store.redo();
    expect(name()).toBe("New branch");
    expect(store.getSnapshot().toast?.message).toBe("Nothing to redo.");
  });

  it("deletes all project contents and cannot restore them through Undo", async () => {
    vi.useFakeTimers();
    const initial = createMultiProjectWorkspace();
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();
    const project = initial.projects[0]!;
    const otherProject = initial.projects[1]!;
    store.renameProject(project.id, "Earlier undo snapshot");
    store.undo();
    store.deleteProject(project.id);
    store.redo();
    store.undo();
    const deleted = store.getSnapshot().snapshot!;
    expect(deleted.projects.some((item) => item.id === project.id)).toBe(false);
    for (const collection of [deleted.tasks, deleted.columns, deleted.labels,
      deleted.members, deleted.savedFilters]) {
      expect(collection.some((item) => item.projectId === project.id))
        .toBe(false);
    }
    expect(deleted.projects.find((item) => item.id === otherProject.id))
      .toEqual(initial.projects[1]);
    store.renameProject(otherProject.id, "After deletion");
    store.undo();
    expect(store.getSnapshot().snapshot?.projects
      .some((item) => item.id === project.id)).toBe(false);
  });
  afterEach(() => vi.useRealTimers());

  it("upgrades and saves lower legacy limits only once", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    delete initial.preferences.columnTaskLimitMigrated;
    const limits = [5, 10, 20, 30, null];
    initial.columns.forEach((column, index) => {
      column.limit = limits[index] ?? null;
    });
    const repository = new DeferredRepository(initial);
    const store = new WorkspaceStore(repository);

    await store.initialize();

    const upgraded = store.getSnapshot().snapshot!;
    expect(upgraded.columns.map((column) => column.limit))
      .toEqual([20, 20, 20, 30, null]);
    expect(upgraded.preferences.columnTaskLimitMigrated).toBe(true);
    await vi.advanceTimersByTimeAsync(350);
    expect(repository.snapshots).toHaveLength(1);
    expect(repository.snapshots[0]).toEqual({ ...upgraded, revision: 0 });
    repository.releases[0]?.();
    await vi.advanceTimersByTimeAsync(0);

    store.updateColumn(upgraded.columns[0]!.id, { limit: 7 });
    await vi.advanceTimersByTimeAsync(350);
    const reopened = new WorkspaceStore(
      new DeferredRepository(repository.snapshots[1]!),
    );
    await reopened.initialize();
    expect(reopened.getSnapshot().snapshot?.columns[0]?.limit).toBe(7);
    expect(reopened.getSnapshot().saveState).toBe("idle");
  });

  it("uses twenty cards for new project and added columns", async () => {
    vi.useFakeTimers();
    const store = new WorkspaceStore(new DeferredRepository(
      createDemoWorkspace(new Date("2026-09-04T12:00:00Z")),
    ));
    await store.initialize();

    const projectId = store.createProject("Twenty-card workflow");
    expect(projectId).not.toBeNull();
    store.createColumn(projectId!);

    const columns = store.getSnapshot().snapshot?.columns.filter(
      (column) => column.projectId === projectId,
    );
    expect(columns).toHaveLength(5);
    expect(columns?.every((column) =>
      column.limit === DEFAULT_COLUMN_TASK_LIMIT,
    )).toBe(true);
  });

  it("serializes writes and preserves the newest snapshot", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    initial.preferences.onboardingComplete = true;
    const repository = new DeferredRepository(initial);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    const columnId = initial.columns[0]?.id;
    expect(columnId).toBeDefined();
    if (!columnId) return;

    store.createTask(columnId, "First queued task");
    await vi.advanceTimersByTimeAsync(350);
    expect(repository.snapshots).toHaveLength(1);

    store.createTask(columnId, "Second queued task");
    await vi.advanceTimersByTimeAsync(350);
    expect(repository.snapshots).toHaveLength(1);

    repository.releases[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.snapshots).toHaveLength(2);
    expect(
      repository.snapshots[1]?.tasks.some(
        (task) => task.title === "Second queued task",
      ),
    ).toBe(true);

    repository.releases[1]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().saveState).toBe("saved");
  });

  it("manages local members and clears removed assignments", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const repository = new DeferredRepository(initial);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    const project = initial.projects[0];
    const task = initial.tasks[0];
    expect(project).toBeDefined();
    expect(task).toBeDefined();
    if (!project || !task) return;

    const memberId = store.createMember(project.id, "Robin Field");
    expect(memberId).not.toBeNull();
    if (!memberId) return;
    const member = store.getSnapshot().snapshot?.members.find(
      (candidate) => candidate.id === memberId,
    );
    expect(member?.initials).toBe("RF");

    store.updateTask(task.id, { assigneeId: memberId });
    store.deleteMember(memberId);
    expect(
      store.getSnapshot().snapshot?.tasks.find(
        (candidate) => candidate.id === task.id,
      )?.assigneeId,
    ).toBeNull();
  });

  it("marks a project recent when its work changes", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = initial.projects[0];
    const column = initial.columns[0];
    expect(project).toBeDefined();
    expect(column).toBeDefined();
    if (!project || !column) return;
    project.updatedAt = "2020-01-01T00:00:00.000Z";
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();

    store.createTask(column.id, "Activity timestamp test");

    const updatedAt = store.getSnapshot().snapshot?.projects.find(
      (candidate) => candidate.id === project.id,
    )?.updatedAt;
    expect(updatedAt).toBeDefined();
    expect(updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("reorders workflow columns in both directions", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = initial.projects[0];
    expect(project).toBeDefined();
    if (!project) return;
    const columns = initial.columns
      .filter((column) => column.projectId === project.id)
      .sort((left, right) => left.sortPosition - right.sortPosition);
    const first = columns[0];
    const second = columns[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();

    store.reorderColumn(first.id, null);
    let reordered = store.getSnapshot().snapshot?.columns
      .filter((column) => column.projectId === project.id)
      .sort((left, right) => left.sortPosition - right.sortPosition);
    expect(reordered?.at(-1)?.id).toBe(first.id);

    store.reorderColumn(first.id, second.id);
    reordered = store.getSnapshot().snapshot?.columns
      .filter((column) => column.projectId === project.id)
      .sort((left, right) => left.sortPosition - right.sortPosition);
    expect(reordered?.[0]?.id).toBe(first.id);
  });

  it("keeps unique positions when reordering within a column", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const column = initial.columns.find((item) => item.name === "Ready");
    expect(column).toBeDefined();
    if (!column) return;
    const [first, second] = initial.tasks.filter(
      (task) => task.columnId === column.id,
    ).sort((left, right) => left.sortPosition - right.sortPosition);
    const third = initial.tasks.find(
      (task) => task.title === "Opening morning",
    );
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();
    if (!first || !second || !third) return;
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();
    const columnOrder = () => store.getSnapshot().snapshot?.tasks
      .filter((task) => task.columnId === column.id)
      .sort((left, right) => left.sortPosition - right.sortPosition)
      .map((task) => [task.id, task.sortPosition]);

    store.moveTask(third.id, column.id, first.id);
    store.moveTask(third.id, column.id, second.id);
    expect(columnOrder()).toEqual([
      [first.id, 0], [third.id, 1], [second.id, 2],
    ]);

    store.moveTask(third.id, column.id, first.id);
    expect(columnOrder()).toEqual([
      [third.id, 0], [first.id, 1], [second.id, 2],
    ]);
  });

  it("applies column completion semantics when moving tasks", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = initial.tasks.find(
      (candidate) =>
        !candidate.completed &&
        candidate.checklist.some((subtask) => !subtask.completed),
    );
    const completeColumn = initial.columns.find(
      (candidate) => candidate.completed,
    );
    expect(task).toBeDefined();
    expect(completeColumn).toBeDefined();
    if (!task || !completeColumn) return;
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();

    store.moveTask(task.id, completeColumn.id);

    const moved = store.getSnapshot().snapshot?.tasks.find(
      (candidate) => candidate.id === task.id,
    );
    expect(moved?.completed).toBe(true);
    expect(moved?.progress).toBe(100);
    expect(
      moved?.checklist.every((subtask) => subtask.completed),
    ).toBe(true);

    const activeColumn = initial.columns.find(
      (candidate) => !candidate.completed,
    );
    expect(activeColumn).toBeDefined();
    if (!activeColumn) return;
    store.moveTask(task.id, activeColumn.id);
    const reopened = store.getSnapshot().snapshot?.tasks.find(
      (candidate) => candidate.id === task.id,
    );
    expect(reopened?.completed).toBe(false);
    expect(reopened?.progress).toBeLessThan(100);
  });

  it("derives task completion from checked sub-tasks", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = initial.tasks.find(
      (candidate) => candidate.checklist.length === 3,
    );
    expect(task).toBeDefined();
    if (!task) return;
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();

    for (const subtask of task.checklist) {
      store.updateSubtask(task.id, subtask.id, { completed: true });
    }

    const completed = store.getSnapshot().snapshot?.tasks.find(
      (candidate) => candidate.id === task.id,
    );
    const completedColumn = initial.columns.find(
      (column) => column.completed,
    );
    expect(completed?.completed).toBe(true);
    expect(completed?.progress).toBe(100);
    expect(completed?.columnId).toBe(completedColumn?.id);

    store.updateSubtask(task.id, task.checklist[0]?.id ?? "", {
      completed: false,
    });
    const reopened = store.getSnapshot().snapshot?.tasks.find(
      (candidate) => candidate.id === task.id,
    );
    expect(reopened?.completed).toBe(false);
    expect(reopened?.progress).toBe(67);
    expect(
      initial.columns.find((column) => column.id === reopened?.columnId)
        ?.completed,
    ).toBe(false);
  });

  it("adds, edits, reorders, and deletes sub-tasks", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = initial.tasks.find(
      (candidate) => candidate.checklist.length === 3,
    );
    expect(task).toBeDefined();
    if (!task) return;
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();

    const subtaskId = store.addSubtask(task.id, "  Confirm handoff  ");
    expect(subtaskId).not.toBeNull();
    if (!subtaskId) return;
    expect(store.updateSubtask(task.id, subtaskId, {
      title: "Confirm final handoff",
    })).toBe(true);
    expect(store.reorderSubtask(
      task.id,
      subtaskId,
      task.checklist[0]?.id ?? "",
    )).toBe(true);

    const reordered = store.getSnapshot().snapshot?.tasks.find(
      (candidate) => candidate.id === task.id,
    )?.checklist;
    expect(reordered?.[0]?.id).toBe(subtaskId);
    expect(reordered?.[0]?.title).toBe("Confirm final handoff");

    expect(store.deleteSubtask(task.id, subtaskId)).toBe(true);
    const afterDelete = store.getSnapshot().snapshot?.tasks.find(
      (candidate) => candidate.id === task.id,
    )?.checklist;
    expect(afterDelete?.some((subtask) => subtask.id === subtaskId)).toBe(
      false,
    );
  });

  it("checks all sub-tasks when bulk-completing a task", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = initial.tasks.find(
      (candidate) => candidate.checklist.some((item) => !item.completed),
    );
    expect(task).toBeDefined();
    if (!task) return;
    const store = new WorkspaceStore(new DeferredRepository(initial));
    await store.initialize();

    store.toggleTaskSelection(task.id);
    store.bulkUpdate({ completed: true, progress: 100 });

    const completed = store.getSnapshot().snapshot?.tasks.find(
      (candidate) => candidate.id === task.id,
    );
    expect(completed?.checklist.every((item) => item.completed)).toBe(true);
  });
});

/** Seed an immediate repository for data-action regression checks.
 *
 * Args:
 *     none: This helper does not accept arguments.
 * Returns:
 *     object: A store, repository, and isolated initial snapshot.
 */
function dataActionFixture() {
  const initial = createDemoWorkspace(new Date("2026-09-04T12:00:00Z"));
  initial.preferences.columnTaskLimitMigrated = true;
  const repository = new DeferredRepository(initial);
  const save = vi.spyOn(repository, "save").mockResolvedValue(1);
  const store = new WorkspaceStore(repository);
  return { initial, repository, save, store };
}

describe("WorkspaceStore native data actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("flushes pending edits before export and cancels the debounce", async () => {
    vi.useFakeTimers();
    const { initial, repository, save, store } = dataActionFixture();
    const exportProject = vi.spyOn(repository, "exportProject")
      .mockResolvedValue(undefined);
    await store.initialize();
    store.createTask(initial.columns[0]!.id, "Latest pending edit");
    await store.exportProject(initial.projects[0]!.id, "test.json");
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]![0].tasks.some((task) =>
      task.title === "Latest pending edit"
    )).toBe(true);
    expect(save.mock.invocationCallOrder[0]!)
      .toBeLessThan(exportProject.mock.invocationCallOrder[0]!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledOnce();
    expect(store.getSnapshot().dataOperation).toBe(false);
  });

  it("aborts backup on save failure and exposes recovery", async () => {
    const { repository, save, store } = dataActionFixture();
    const backup = vi.spyOn(repository, "backup").mockResolvedValue(undefined);
    await store.initialize();
    save.mockRejectedValue(new Error("Disk is not writable"));
    await store.backup("test.sqlite3");
    expect(backup).not.toHaveBeenCalled();
    expect(store.getSnapshot().saveState).toBe("error");
    expect(store.getSnapshot().toast?.message).toBe("Disk is not writable");
    expect(store.getSnapshot().dataOperation).toBe(false);
  });

  it.each(["importProject", "restore"] as const)(
    "%s drains writes and invalidates old undo/selection state",
    async (method) => {
      vi.useFakeTimers();
      const { initial, repository, save, store } = dataActionFixture();
      const replacement = structuredClone(initial);
      replacement.tasks = [];
      replacement.preferences.lastProjectId = "missing-project";
      const action = vi.spyOn(repository, method).mockResolvedValue(replacement);
      await store.initialize();
      store.createTask(initial.columns[0]!.id, "Obsolete undo entry");
      store.undo();
      store.selectTask(initial.tasks[0]!.id);
      store.toggleTaskSelection(initial.tasks[0]!.id);
      store.setFilter({ ...store.getSnapshot().filter, query: "old query" });
      await store[method]("test-file");
      expect(action).toHaveBeenCalledOnce();
      expect(save.mock.invocationCallOrder[0]!)
        .toBeLessThan(action.mock.invocationCallOrder[0]!);
      expect(store.getSnapshot().snapshot?.tasks).toEqual([]);
      expect(store.getSnapshot().selectedTaskId).toBeNull();
      expect(store.getSnapshot().selectedTaskIds.size).toBe(0);
      expect(store.getSnapshot().filter.query).toBe("");
      expect(store.getSnapshot().activeProjectId).toBe(initial.projects[0]!.id);
      store.undo();
      store.redo();
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.getSnapshot().snapshot?.tasks).toEqual([]);
      expect(save).toHaveBeenCalledTimes(2);
    },
  );

  it("waits for an in-flight save and protects edits during backup", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace();
    initial.preferences.columnTaskLimitMigrated = true;
    const repository = new DeferredRepository(initial);
    const backup = vi.spyOn(repository, "backup").mockResolvedValue(undefined);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    store.createTask(initial.columns[0]!.id, "First edit");
    await vi.advanceTimersByTimeAsync(350);
    const operation = store.backup("test.sqlite3");
    const count = store.getSnapshot().snapshot!.tasks.length;
    store.createTask(initial.columns[0]!.id, "Edit during backup");
    expect(store.getSnapshot().snapshot!.tasks).toHaveLength(count);
    expect(backup).not.toHaveBeenCalled();
    repository.releases[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(backup).not.toHaveBeenCalled();
    repository.releases[1]!();
    await operation;
    expect(backup).toHaveBeenCalledOnce();
  });
});

describe("WorkspaceStore security boundaries", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("uses the latest persisted revision for queued edits and undo", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace();
    initial.revision = 4;
    initial.preferences.columnTaskLimitMigrated = true;
    const repository = new DeferredRepository(initial);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    store.renameProject(initial.projects[0]!.id, "First");
    await vi.advanceTimersByTimeAsync(350);
    expect(repository.snapshots[0]!.revision).toBe(4);
    store.renameProject(initial.projects[0]!.id, "Second");
    await vi.advanceTimersByTimeAsync(350);
    repository.releases[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.snapshots[1]!.revision).toBe(5);
    repository.releases[1]!();
    await vi.advanceTimersByTimeAsync(0);
    store.undo();
    await vi.advanceTimersByTimeAsync(350);
    expect(repository.snapshots[2]!.revision).toBe(6);
    repository.releases[2]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().snapshot!.revision).toBe(7);
  });

  it("does not reset the expected revision to overwrite a conflict", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace();
    initial.revision = 8;
    initial.preferences.columnTaskLimitMigrated = true;
    const repository = new DeferredRepository(initial);
    const save = vi.spyOn(repository, "save").mockRejectedValue(
      new Error("This workspace changed elsewhere"),
    );
    const store = new WorkspaceStore(repository);
    await store.initialize();
    store.renameProject(initial.projects[0]!.id, "Pending edit");
    await store.retrySave();
    await store.retrySave();
    expect(save.mock.calls.every(([snapshot]) => snapshot.revision === 8)).toBe(true);
    expect(store.getSnapshot().saveState).toBe("error");
    expect(store.getSnapshot().snapshot!.projects[0]!.name).toBe("Pending edit");
  });

  it("can preserve and restore data after load failure without autosaving", async () => {
    const initial = createDemoWorkspace();
    const repository = new DeferredRepository(initial);
    vi.spyOn(repository, "load").mockRejectedValue(new Error("Invalid settings"));
    const save = vi.spyOn(repository, "save");
    const copy = vi.spyOn(repository, "recoverDatabase").mockResolvedValue(undefined);
    const restored = { ...initial, revision: 12 };
    vi.spyOn(repository, "restore").mockResolvedValue(restored);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    expect(store.getSnapshot().loadError).toBe("Invalid settings");
    await store.recoverDatabase("/selected/recovery.zip");
    expect(copy).toHaveBeenCalledOnce();
    await store.restoreForRecovery("/selected/backup.sqlite3");
    expect(save).not.toHaveBeenCalled();
    expect(store.getSnapshot().loadError).toBeNull();
    expect(store.getSnapshot().snapshot!.revision).toBe(12);
  });

  it.each(["undo", "redo"] as const)(
    "blocks %s and retains history while recovering",
    async (method) => {
      vi.useFakeTimers();
      const initial = createDemoWorkspace();
      initial.preferences.columnTaskLimitMigrated = true;
      const repository = new DeferredRepository(initial);
      const store = new WorkspaceStore(repository);
      await store.initialize();
      store.renameProject(initial.projects[0]!.id, "Before recovery");
      if (method === "redo") store.undo();
      const before = store.getSnapshot();
      store.enterRecovery("Broken view");
      store[method]();
      expect(store.getSnapshot().snapshot).toBe(before.snapshot);
      expect(store.getSnapshot().canUndo).toBe(before.canUndo);
      expect(store.getSnapshot().canRedo).toBe(before.canRedo);
      await vi.advanceTimersByTimeAsync(1000);
      expect(repository.snapshots).toHaveLength(0);
    },
  );

  it("pauses autosave in recovery and blocks closure during a recovery copy", async () => {
    vi.useFakeTimers();
    const initial = createDemoWorkspace();
    initial.preferences.columnTaskLimitMigrated = true;
    const repository = new DeferredRepository(initial);
    const store = new WorkspaceStore(repository);
    await store.initialize();
    store.renameProject(initial.projects[0]!.id, "Pending view failure");
    store.enterRecovery("Broken view");
    let complete!: () => void;
    vi.spyOn(repository, "recoverDatabase").mockImplementation(
      () => new Promise<void>((resolve) => { complete = resolve; }),
    );
    const copying = store.recoverDatabase("/selected/recovery.zip");
    await vi.advanceTimersByTimeAsync(1000);
    expect(repository.snapshots).toHaveLength(0);
    const close = vi.fn().mockResolvedValue(undefined);
    await store.closeAfterSave(close);
    expect(close).not.toHaveBeenCalled();
    complete();
    await copying;
    await store.closeAfterSave(close);
    expect(close).toHaveBeenCalledOnce();
  });
});
