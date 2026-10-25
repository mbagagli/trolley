import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import type { Task } from "../domain/types";
import { ListView } from "./ListView";

function renderDemoList(): Task[] {
  const snapshot = createDemoWorkspace(
    new Date("2026-09-04T12:00:00Z"),
  );
  const project = snapshot.projects[0];
  if (!project) {
    throw new Error("The demo workspace must include a project.");
  }
  const tasks = snapshot.tasks.filter(
    (task) => task.projectId === project.id && !task.archived,
  );

  render(
    <ListView
      columns={snapshot.columns}
      dateFormat={project.settings.dateFormat}
      labels={snapshot.labels}
      members={snapshot.members}
      priorities={project.settings.priorities}
      quadrants={project.settings.quadrants}
      selectedTaskIds={new Set()}
      tasks={tasks}
      terminology={project.settings.terminology}
    />,
  );
  return tasks;
}

describe("ListView", () => {
  it("gives every task row an accessible move handle", () => {
    const tasks = renderDemoList();

    expect(screen.getAllByRole("button", { name: /^Move / })).toHaveLength(
      tasks.length,
    );
    expect(screen.getByText("1/3 sub-tasks")).toBeTruthy();
  });

  it("keeps a complete table-row placeholder during keyboard drag", () => {
    renderDemoList();
    const handle = screen.getByRole("button", {
      name: "Move Opening morning",
    });

    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });

    const row = handle.closest("tr");
    expect(row?.style.transform).toBe("");
    expect(row?.style.opacity).toBe("0.3");
    expect(row?.querySelectorAll("td")).toHaveLength(9);
    expect(screen.getByText("Move to Backlog")).toBeTruthy();

    fireEvent.keyDown(handle, { code: "Escape", key: "Escape" });
  });
});
