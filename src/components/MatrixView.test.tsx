import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { MatrixView } from "./MatrixView";

describe("MatrixView", () => {
  it("aligns quadrant order with urgency rows and importance columns", () => {
    const snapshot = createDemoWorkspace();
    const project = snapshot.projects[0];
    if (!project) throw new Error("Demo project is missing");
    render(
      <MatrixView
        cardFields={project.settings.cardFields}
        dateFormat={project.settings.dateFormat}
        labels={snapshot.labels}
        members={snapshot.members}
        priorities={project.settings.priorities}
        quadrants={[...project.settings.quadrants].reverse()}
        tasks={[]}
        terminology={project.settings.terminology}
      />,
    );
    const expected = ["do-first", "delegate", "schedule", "eliminate"];
    expect(screen.getAllByRole("heading", { level: 2 }).map(
      (heading) => heading.textContent,
    )).toEqual(expected.map((key) => project.settings.quadrants.find(
      (quadrant) => quadrant.key === key,
    )?.name));
    expect(Array.from(document.querySelectorAll(".matrix-row-axis"),
      (element) => element.textContent,
    )).toEqual(["Urgent", "Not urgent"]);
    expect(project.settings.quadrants[0]?.key).toBe("do-first");
  });

  it("uses a stable card placeholder and a lifted drag overlay", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0];
    const task = snapshot.tasks.find((candidate) => !candidate.completed);
    expect(project).toBeDefined();
    expect(task).toBeDefined();
    if (!project || !task) return;

    render(
      <MatrixView
        cardFields={project.settings.cardFields}
        dateFormat={project.settings.dateFormat}
        labels={snapshot.labels}
        members={snapshot.members}
        priorities={project.settings.priorities}
        quadrants={project.settings.quadrants}
        tasks={[task]}
        terminology={project.settings.terminology}
      />,
    );
    const handle = screen.getByRole("button", {
      name: `Move ${task.title}`,
    });
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });

    expect(document.querySelector(".matrix-task-drag-overlay")).toBeTruthy();
    expect(handle.closest(".matrix-task")?.getAttribute("style")).toContain(
      "opacity: 0.32",
    );
    fireEvent.keyDown(handle, { code: "Escape", key: "Escape" });
  });
});
