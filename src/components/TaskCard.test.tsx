import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PRIORITIES } from "../config/product";
import { createDemoWorkspace } from "../data/demo";
import { TaskCard } from "./TaskCard";

describe("TaskCard", () => {
  it("does not click through after a cancelled pointer drag", () => {
    const task = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    ).tasks[0]!;
    const onOpen = vi.fn();
    const props = {
      cardFields: [],
      dateFormat: "yyyy-MM-dd",
      labels: [],
      member: null,
      onOpen,
      onPriorityChange: vi.fn(),
      priorities: DEFAULT_PRIORITIES,
      task,
    };
    const view = render(<TaskCard {...props} dragging />);
    view.rerender(<TaskCard {...props} dragging={false} />);
    const title = screen.getByRole("button", { name: task.title });

    fireEvent.click(title, { detail: 1 });
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.pointerDown(title);
    fireEvent.click(title, { detail: 1 });
    expect(onOpen).toHaveBeenCalledOnce();

    view.rerender(<TaskCard {...props} dragging />);
    view.rerender(<TaskCard {...props} dragging={false} />);
    fireEvent.click(title, { detail: 0 });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("shows only the configured metadata fields", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = snapshot.tasks.find((candidate) => candidate.dueDate);
    expect(task).toBeDefined();
    if (!task) return;
    const taskLabels = snapshot.labels.filter((label) =>
      task.labelIds.includes(label.id),
    );
    render(
      <TaskCard
        cardFields={["dates"]}
        dateFormat="yyyy-MM-dd"
        labels={taskLabels}
        member={null}
        onOpen={vi.fn()}
        onPriorityChange={vi.fn()}
        priorities={DEFAULT_PRIORITIES}
        task={task}
      />,
    );
    expect(screen.getByText(task.dueDate as string)).toBeTruthy();
    for (const priority of DEFAULT_PRIORITIES) {
      expect(screen.queryByText(priority.name)).toBeNull();
    }
    for (const label of taskLabels) {
      expect(screen.queryByText(label.name)).toBeNull();
    }
  });

  it("opens the task from its accessible title control", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = snapshot.tasks[0];
    expect(task).toBeDefined();
    if (!task) return;
    const onOpen = vi.fn();
    render(
      <TaskCard
        cardFields={[]}
        dateFormat="yyyy-MM-dd"
        labels={[]}
        member={null}
        onOpen={onOpen}
        onPriorityChange={vi.fn()}
        priorities={DEFAULT_PRIORITIES}
        task={task}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: task.title }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows sub-task completion on the card", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = snapshot.tasks.find(
      (candidate) => candidate.checklist.length === 3,
    );
    expect(task).toBeDefined();
    if (!task) return;

    render(
      <TaskCard
        cardFields={["checklist"]}
        dateFormat="yyyy-MM-dd"
        labels={[]}
        member={null}
        onOpen={vi.fn()}
        onPriorityChange={vi.fn()}
        priorities={DEFAULT_PRIORITIES}
        task={task}
      />,
    );

    expect(screen.getByText("1/3 sub-tasks")).toBeTruthy();
  });
});
