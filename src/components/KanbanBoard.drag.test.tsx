import type { DragEndEvent } from "@dnd-kit/core";
import { act, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { workspaceStore } from "../state/workspaceStore";
import { KanbanBoard } from "./KanbanBoard";

const handlers = vi.hoisted(() => ({
  current: {} as ComponentProps<typeof import("@dnd-kit/core").DndContext>,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...original,
    DndContext(props: typeof handlers.current) {
      handlers.current = props;
      return <original.DndContext {...props} />;
    },
  };
});

function renderBoard() {
  const snapshot = createDemoWorkspace(new Date("2026-09-04T12:00:00Z"));
  const project = snapshot.projects[0]!;
  const source = snapshot.columns.find((column) => column.name === "Backlog")!;
  const destination = snapshot.columns.find((column) =>
    column.name === "Ready",
  )!;
  const task = snapshot.tasks.find((item) => item.columnId === source.id)!;
  const event: DragEndEvent = {
    activatorEvent: new Event("pointerdown"),
    active: {
      id: `task:${task.id}`,
      data: { current: {
        type: "task", taskId: task.id, columnId: source.id,
      } },
      rect: { current: { initial: null, translated: null } },
    },
    collisions: null,
    delta: { x: 300, y: 0 },
    over: {
      id: `column:${destination.id}`,
      data: { current: { type: "column", columnId: destination.id } },
      disabled: false,
      rect: new DOMRect(300, 0, 288, 500),
    },
  };
  render(
    <KanbanBoard
      cardFields={project.settings.cardFields}
      columns={snapshot.columns}
      dateFormat={project.settings.dateFormat}
      labels={snapshot.labels}
      members={snapshot.members}
      priorities={project.settings.priorities}
      projectId={project.id}
      tasks={snapshot.tasks}
      terminology={project.settings.terminology}
    />,
  );
  act(() => handlers.current.onDragStart?.(event));
  return { event, snapshot, destination, source, task };
}

describe("Kanban drop targets", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the released column even before the hover preview updates", () => {
    const move = vi.spyOn(workspaceStore, "moveTask")
      .mockImplementation(() => undefined);
    const { event, destination, task } = renderBoard();

    act(() => handlers.current.onDragEnd?.(event));

    expect(move).toHaveBeenCalledWith(task.id, destination.id, null);
  });

  it("inserts before a released task in a different column", () => {
    const move = vi.spyOn(workspaceStore, "moveTask")
      .mockImplementation(() => undefined);
    const { event, snapshot, destination, task } = renderBoard();
    const target = snapshot.tasks.find((item) =>
      item.columnId === destination.id,
    )!;
    event.over!.id = `task:${target.id}`;
    event.over!.data.current = {
      type: "task", taskId: target.id, columnId: destination.id,
    };

    act(() => handlers.current.onDragEnd?.(event));

    expect(move).toHaveBeenCalledWith(task.id, destination.id, target.id);
  });

  it("does not save a cancelled or outside drop", () => {
    const move = vi.spyOn(workspaceStore, "moveTask")
      .mockImplementation(() => undefined);
    const { event } = renderBoard();
    act(() => handlers.current.onDragOver?.(event));
    event.over = null;

    act(() => handlers.current.onDragEnd?.(event));

    expect(move).not.toHaveBeenCalled();
  });

  it("does not keep a stale destination after returning to the source", () => {
    const move = vi.spyOn(workspaceStore, "moveTask")
      .mockImplementation(() => undefined);
    const { event, source, task } = renderBoard();
    act(() => handlers.current.onDragOver?.(event));
    event.over!.id = `column:${source.id}`;
    event.over!.data.current = { type: "column", columnId: source.id };
    event.active.data.current = undefined;

    act(() => handlers.current.onDragEnd?.(event));

    expect(move).toHaveBeenCalledWith(task.id, source.id, null);
  });
});
