import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PRIORITIES } from "../config/product";
import { createDemoWorkspace } from "../data/demo";
import { workspaceStore } from "../state/workspaceStore";
import { TaskDrawer } from "./TaskDrawer";

describe("TaskDrawer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("sanitizes rendered Markdown", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const source = snapshot.tasks[0];
    expect(source).toBeDefined();
    if (!source) return;
    const task = {
      ...source,
      description: "## Safe heading\n<script>alert('unsafe')</script>\n[External](https://example.com)\n[Unsafe](javascript:alert)\n![Remote](https://example.com/tracker.png)\n![Inline](data:image/png;base64,AAA)",
    };
    const projectId = task.projectId;
    const terminology = snapshot.projects[0]?.settings.terminology;
    expect(terminology).toBeDefined();
    if (!terminology) return;
    const result = render(
      <TaskDrawer
        columns={snapshot.columns.filter(
          (column) => column.projectId === projectId,
        )}
        labels={snapshot.labels.filter(
          (label) => label.projectId === projectId,
        )}
        members={snapshot.members.filter(
          (member) => member.projectId === projectId,
        )}
        priorities={DEFAULT_PRIORITIES}
        task={task}
        tasks={snapshot.tasks}
        terminology={terminology}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(
      screen.getByRole("heading", { name: "Safe heading" }),
    ).toBeTruthy();
    expect(result.container.querySelector("script")).toBeNull();
    expect(result.container.querySelector(".markdown-preview img")).toBeNull();
    expect(screen.getAllByText(/Images are disabled/)).toHaveLength(2);
    expect(result.container.querySelector('a[href^="javascript:"]')).toBeNull();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link", { name: "External" }), click);
    expect(click.defaultPrevented).toBe(true);
    const auxiliary = new MouseEvent("auxclick", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link", { name: "External" }), auxiliary);
    expect(auxiliary.defaultPrevented).toBe(true);
  });

  it("saves an edited title through the workspace store", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = snapshot.tasks[0];
    const project = snapshot.projects[0];
    expect(task).toBeDefined();
    expect(project).toBeDefined();
    if (!task || !project) return;
    const updateTask = vi
      .spyOn(workspaceStore, "updateTask")
      .mockReturnValue(true);
    render(
      <TaskDrawer
        columns={snapshot.columns}
        labels={snapshot.labels}
        members={snapshot.members}
        priorities={DEFAULT_PRIORITIES}
        task={task}
        tasks={snapshot.tasks}
        terminology={project.settings.terminology}
      />,
    );
    const title = screen.getByLabelText("Task title");
    fireEvent.change(title, { target: { value: "Revised title" } });
    fireEvent.blur(title);

    expect(updateTask).toHaveBeenCalledWith(task.id, {
      title: "Revised title",
    });
    updateTask.mockRestore();
  });

  it("edits and completes sub-tasks through named controls", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = snapshot.tasks.find(
      (candidate) => candidate.checklist.length === 3,
    );
    const project = snapshot.projects[0];
    expect(task).toBeDefined();
    expect(project).toBeDefined();
    if (!task || !project) return;
    const firstSubtask = task.checklist[0];
    expect(firstSubtask).toBeDefined();
    if (!firstSubtask) return;
    const updateSubtask = vi
      .spyOn(workspaceStore, "updateSubtask")
      .mockReturnValue(true);
    const addSubtask = vi
      .spyOn(workspaceStore, "addSubtask")
      .mockReturnValue("new-subtask-id");
    const deleteSubtask = vi
      .spyOn(workspaceStore, "deleteSubtask")
      .mockReturnValue(true);
    render(
      <TaskDrawer
        columns={snapshot.columns}
        labels={snapshot.labels}
        members={snapshot.members}
        priorities={DEFAULT_PRIORITIES}
        task={task}
        tasks={snapshot.tasks}
        terminology={project.settings.terminology}
      />,
    );

    expect(screen.getByRole("heading", { name: "Sub-tasks" })).toBeTruthy();
    expect(screen.getAllByRole("button", {
      name: /^Move sub-task:/,
    })).toHaveLength(3);
    const newSubtask = screen.getByLabelText("New sub-task description");
    fireEvent.change(newSubtask, {
      target: { value: "Confirm the final handoff" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add sub-task" }));
    expect(addSubtask).toHaveBeenCalledWith(
      task.id,
      "Confirm the final handoff",
    );

    fireEvent.click(screen.getByRole("checkbox", {
      name: `Reopen sub-task: ${firstSubtask.title}`,
    }));
    expect(updateSubtask).toHaveBeenCalledWith(task.id, firstSubtask.id, {
      completed: false,
    });

    const description = screen.getByRole("textbox", {
      name: `Sub-task description: ${firstSubtask.title}`,
    });
    fireEvent.change(description, { target: { value: "Revised step" } });
    fireEvent.blur(description);
    expect(updateSubtask).toHaveBeenCalledWith(task.id, firstSubtask.id, {
      title: "Revised step",
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", {
      name: `Delete sub-task: ${firstSubtask.title}`,
    }));
    expect(deleteSubtask).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(140));
    expect(deleteSubtask).toHaveBeenCalledWith(task.id, firstSubtask.id);
  });

  it("acknowledges a newly completed task once", () => {
    vi.useFakeTimers();
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const source = snapshot.tasks[0];
    const project = snapshot.projects[0];
    expect(source).toBeDefined();
    expect(project).toBeDefined();
    if (!source || !project) return;
    const task = { ...source, completed: false };
    const result = render(
      <TaskDrawer
        columns={snapshot.columns}
        labels={snapshot.labels}
        members={snapshot.members}
        priorities={DEFAULT_PRIORITIES}
        task={task}
        tasks={snapshot.tasks}
        terminology={project.settings.terminology}
      />,
    );

    result.rerender(
      <TaskDrawer
        columns={snapshot.columns}
        labels={snapshot.labels}
        members={snapshot.members}
        priorities={DEFAULT_PRIORITIES}
        task={{ ...task, completed: true }}
        tasks={snapshot.tasks}
        terminology={project.settings.terminology}
      />,
    );
    expect(
      result.container.querySelector(".is-complete-feedback"),
    ).toBeTruthy();

    act(() => vi.advanceTimersByTime(360));
    expect(
      result.container.querySelector(".is-complete-feedback"),
    ).toBeNull();
  });
});
