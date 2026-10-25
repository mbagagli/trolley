import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { workspaceStore } from "../state/workspaceStore";
import { shiftIsoDate } from "../utils/date";
import { GanttView } from "./GanttView";

describe("GanttView", () => {
  it("moves a scheduled task with an accessible keyboard control", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const task = snapshot.tasks.find(
      (candidate) => candidate.startDate && candidate.dueDate,
    );
    const project = snapshot.projects[0];
    expect(task).toBeDefined();
    expect(project).toBeDefined();
    if (!task?.startDate || !task.dueDate || !project) return;
    const updateTask = vi
      .spyOn(workspaceStore, "updateTask")
      .mockReturnValue(true);
    render(
      <GanttView
        columns={snapshot.columns}
        dateFormat="yyyy-MM-dd"
        firstDayOfWeek={1}
        showWeekends
        tasks={[task]}
        terminology={project.settings.terminology}
        workingDays={[1, 2, 3, 4, 5]}
      />,
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: new RegExp(`${task.title}, .*\\d+ visible days`),
      }),
      { key: "ArrowRight" },
    );

    expect(updateTask).toHaveBeenCalledWith(task.id, {
      startDate: shiftIsoDate(task.startDate, 1),
      dueDate: shiftIsoDate(task.dueDate, 1),
    });
    updateTask.mockRestore();
  });

  it("exposes hierarchy collapse as a native button", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const source = snapshot.tasks[0];
    const project = snapshot.projects[0];
    expect(source).toBeDefined();
    expect(project).toBeDefined();
    if (!source || !project) return;
    const root = { ...source, id: "root", title: "Root task" };
    const child = {
      ...source,
      id: "child",
      title: "Child task",
      parentId: root.id,
    };
    const result = render(
      <GanttView
        columns={snapshot.columns}
        dateFormat="yyyy-MM-dd"
        firstDayOfWeek={1}
        showWeekends
        tasks={[root, child]}
        terminology={project.settings.terminology}
        workingDays={[1, 2, 3, 4, 5]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse group" }));

    expect(screen.queryAllByText("Child task")).toHaveLength(0);
    expect(result.container.querySelector('[role="button"]')).toBeNull();
  });
  it("keeps distant schedules bounded and can reveal their dates", () => {
    const snapshot = createDemoWorkspace(new Date("2026-10-07T12:00:00Z"));
    const project = snapshot.projects[0];
    const source = snapshot.tasks[0];
    if (!project || !source) throw new Error("Missing demo project");
    const task = { ...source, startDate: "9999-01-01", dueDate: "9999-12-31" };
    const result = render(
      <GanttView
        columns={snapshot.columns} dateFormat="yyyy-MM-dd"
        firstDayOfWeek={1} showWeekends tasks={[task]}
        terminology={project.settings.terminology}
        workingDays={[1, 2, 3, 4, 5]}
      />,
    );
    expect(result.container.querySelectorAll(".gantt-date-tick").length)
      .toBeLessThanOrEqual(730);
    fireEvent.click(screen.getByRole("button", {
      name: "Show scheduled dates",
    }));
    expect(screen.getByLabelText("Timeline date")).toHaveProperty(
      "value", "9999-01-01",
    );
    expect(screen.queryByRole("button", { name: "Show scheduled dates" }))
      .toBeNull();
  });

});
