import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { workspaceStore } from "../state/workspaceStore";
import { Dashboard } from "./Dashboard";

describe("Dashboard", () => {
  it.each([false, true])(
    "confirms deletion for an archived=%s project and supports cancel",
    (archived) => {
      const snapshot = createDemoWorkspace();
      const project = snapshot.projects[0]!;
      project.archived = archived;
      const remove = vi.spyOn(workspaceStore, "deleteProject")
        .mockImplementation(() => undefined);
      render(<Dashboard snapshot={snapshot} />);
      if (archived) {
        fireEvent.click(screen.getByRole("button", { name: /Archived/ }));
      }
      const row = screen.getByText(project.name).closest("article")!;
      if (!archived) {
        expect(within(row).getByRole("button", { name: "Archive" }))
          .toBeTruthy();
      }
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
      expect(remove).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Delete project" }))
        .toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(remove).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
      fireEvent.click(screen.getByRole("button", {
        name: "Delete project permanently",
      }));
      expect(remove).toHaveBeenCalledExactlyOnceWith(project.id);
      remove.mockRestore();
    },
  );
  it("renames a project inline", () => {
    const snapshot = createDemoWorkspace(
      new Date("2026-09-04T12:00:00Z"),
    );
    const project = snapshot.projects[0];
    expect(project).toBeDefined();
    if (!project) return;
    const renameProject = vi
      .spyOn(workspaceStore, "renameProject")
      .mockImplementation(() => undefined);
    render(<Dashboard snapshot={snapshot} />);

    const row = screen.getByText(project.name).closest("article");
    expect(row).not.toBeNull();
    if (!row) return;
    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));
    const input = screen.getByRole("textbox", {
      name: `Rename ${project.name}`,
    });
    fireEvent.change(input, { target: { value: "Neighborhood launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(renameProject).toHaveBeenCalledWith(
      project.id,
      "Neighborhood launch",
    );
    renameProject.mockRestore();
  });
});
