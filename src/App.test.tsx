import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDemoWorkspace } from "./data/demo";
import type { WorkspaceState } from "./state/workspaceStore";
import { EMPTY_FILTER } from "./domain/filters";
import App from "./App";

const shared = vi.hoisted(() => ({
  state: null as WorkspaceState | null,
  undo: vi.fn(),
  redo: vi.fn(),
  setFilter: vi.fn(),
  selectTask: vi.fn(),
  createTask: vi.fn(),
  updatePreferences: vi.fn(),
  setDensity: vi.fn(),
}));
vi.mock("./state/workspaceStore", () => ({
  useWorkspace: () => shared.state,
  workspaceStore: {
    undo: shared.undo, redo: shared.redo, setFilter: shared.setFilter,
    selectTask: shared.selectTask, createTask: shared.createTask,
    updatePreferences: shared.updatePreferences,
    setDensity: shared.setDensity,
  },
}));
vi.mock("./components/KanbanBoard", () => ({ KanbanBoard: () => null }));

let media: EventTarget & { matches: boolean };
beforeEach(() => {
  vi.clearAllMocks();
  const snapshot = createDemoWorkspace();
  snapshot.preferences.onboardingComplete = true;
  shared.state = {
    snapshot, loading: false, loadError: null,
    activeProjectId: snapshot.projects[0]!.id, activeView: "board",
    selectedTaskId: null, selectedTaskIds: new Set(),
    filter: EMPTY_FILTER, saveState: "saved", saveError: null,
    toast: null, onboardingOpen: false, dataOperation: false,
    canUndo: true, canRedo: true,
  };
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
});
afterEach(() => vi.unstubAllGlobals());

describe("workspace shell", () => {
  it("disables unavailable history actions and blocks them during saves", () => {
    shared.state!.canUndo = false;
    shared.state!.canRedo = false;
    const { rerender } = render(<App />);
    const undo = screen.getByRole("button", { name: "Undo last change" });
    const redo = screen.getByRole("button", { name: "Redo last change" });
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    expect((redo as HTMLButtonElement).disabled).toBe(true);
    shared.state!.canUndo = true;
    shared.state!.canRedo = true;
    rerender(<App />);
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    expect((redo as HTMLButtonElement).disabled).toBe(false);
    shared.state!.dataOperation = true;
    rerender(<App />);
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    expect((redo as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps appearance in settings and four header actions", async () => {
    render(<App />);
    const actions = document.querySelector(".header-actions")!;
    expect(actions.querySelectorAll("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", {
      name: "Open project settings",
    }));
    const theme = await screen.findByLabelText("Theme");
    fireEvent.change(theme, { target: { value: "dark" } });
    expect(shared.updatePreferences).toHaveBeenCalledWith({ theme: "dark" });
    fireEvent.change(screen.getByLabelText("Spacing"), {
      target: { value: "compact" },
    });
    expect(shared.setDensity).toHaveBeenCalledWith("compact");
  });
  it("preserves text undo and redo while supporting workspace undo", () => {
    render(<App />);
    const input = screen.getByRole("searchbox", { name: "Search this project" });
    const textUndo = new KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, bubbles: true, cancelable: true,
    });
    fireEvent(input, textUndo);
    expect(textUndo.defaultPrevented).toBe(false);
    expect(shared.undo).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(shared.undo).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, {
      key: "z", ctrlKey: true, shiftKey: true,
    });
    expect(shared.undo).toHaveBeenCalledOnce();
    expect(shared.redo).toHaveBeenCalledOnce();
    const textRedo = new KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, shiftKey: true,
      bubbles: true, cancelable: true,
    });
    fireEvent(input, textRedo);
    expect(textRedo.defaultPrevented).toBe(false);
    expect(shared.redo).toHaveBeenCalledOnce();
    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    expect(shared.redo).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Redo last change" }));
    expect(shared.redo).toHaveBeenCalledTimes(3);
  });

  it("updates system appearance when OS preference changes", () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe("light");
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("creates a task in the first active column from the shell", () => {
    shared.createTask.mockReturnValue("created-task");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(shared.createTask).toHaveBeenCalledWith(
      shared.state!.snapshot!.columns[0]!.id, "New Task",
    );
    expect(shared.selectTask).toHaveBeenCalledWith("created-task");
  });

  it("uses the same count for the header and panel and clears search", () => {
    shared.state!.filter = {
      ...EMPTY_FILTER, query: "handoff", includeCompleted: false,
    };
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filters (2 active)" }));
    expect(screen.getByText("2 active conditions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(shared.setFilter).toHaveBeenCalledWith(EMPTY_FILTER);
  });
});
