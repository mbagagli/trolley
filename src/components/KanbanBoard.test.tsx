import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { workspaceStore } from "../state/workspaceStore";
import { KanbanBoard } from "./KanbanBoard";

describe("KanbanBoard", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([20, 21])("warns only above twenty cards (%i)", (count) => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0]!;
    const column = snapshot.columns.find((item) => item.name === "Ready")!;
    const tasks = Array.from({ length: count }, (_, index) => ({
      ...snapshot.tasks[0]!,
      id: `limit-task-${index}`,
      columnId: column.id,
      sortPosition: index,
    }));
    render(
      <KanbanBoard
        cardFields={[]}
        columns={[column]}
        dateFormat={project.settings.dateFormat}
        labels={[]}
        members={[]}
        priorities={project.settings.priorities}
        projectId={project.id}
        tasks={tasks}
        terminology={project.settings.terminology}
      />,
    );

    expect(screen.getByText(`${count} / 20`)).toBeTruthy();
    expect(Boolean(screen.queryByText("Column limit exceeded")))
      .toBe(count > 20);
  });

  it("keeps every task and expanded or collapsed column movable", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0];
    expect(project).toBeDefined();
    if (!project) return;
    const columns = snapshot.columns.filter(
      (column) => column.projectId === project.id,
    );
    const tasks = snapshot.tasks.filter(
      (task) => task.projectId === project.id && !task.archived,
    );

    render(
      <KanbanBoard
        cardFields={project.settings.cardFields}
        columns={columns}
        dateFormat={project.settings.dateFormat}
        labels={snapshot.labels}
        members={snapshot.members}
        priorities={project.settings.priorities}
        projectId={project.id}
        tasks={tasks}
        terminology={project.settings.terminology}
      />,
    );

    for (const column of columns) {
      expect(screen.getByRole("button", {
        name: `Move ${column.name} column`,
      })).toBeTruthy();
    }
    for (const task of tasks.filter((candidate) => {
      const column = columns.find(
        (item) => item.id === candidate.columnId,
      );
      return !column?.collapsed;
    })) {
      expect(screen.getByRole("button", {
        name: `Move ${task.title}`,
      })).toBeTruthy();
    }
  });

  it("lifts a task into a drag overlay for keyboard movement", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0];
    const task = snapshot.tasks.find((candidate) => {
      const column = snapshot.columns.find(
        (item) => item.id === candidate.columnId,
      );
      return !column?.collapsed;
    });
    expect(project).toBeDefined();
    expect(task).toBeDefined();
    if (!project || !task) return;

    const moveTask = vi.spyOn(workspaceStore, "moveTask");
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
    const handle = screen.getByRole("button", {
      name: `Move ${task.title}`,
    });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });

    expect(document.querySelector(".board-task-drag-overlay")).toBeTruthy();
    fireEvent.keyDown(handle, { code: "Escape", key: "Escape" });
    expect(moveTask).not.toHaveBeenCalled();
  });

  it("starts pointer dragging from the task card body", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0];
    const task = snapshot.tasks.find((candidate) => {
      const column = snapshot.columns.find(
        (item) => item.id === candidate.columnId,
      );
      return !column?.collapsed;
    });
    expect(project).toBeDefined();
    expect(task).toBeDefined();
    if (!project || !task) return;

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
    const title = screen.getByRole("button", { name: task.title });
    const card = title.closest("article");
    expect(card).toBeTruthy();
    if (!card) return;

    fireEvent.pointerDown(card, {
      button: 0,
      clientX: 10,
      clientY: 10,
      isPrimary: true,
    });
    fireEvent.pointerMove(document, { clientX: 20, clientY: 20 });

    expect(document.querySelector(".board-task-drag-overlay")).toBeTruthy();
    fireEvent.pointerCancel(document);
  });
});
