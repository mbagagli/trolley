import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceRecovery } from "./WorkspaceRecovery";

const mocks = vi.hoisted(() => ({
  open: vi.fn(), save: vi.fn(), enter: vi.fn(), copy: vi.fn(), restore: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open, save: mocks.save }));
vi.mock("../services/workspaceRepository", () => ({ isTauriRuntime: () => true }));
vi.mock("../state/workspaceStore", () => ({ workspaceStore: {
  enterRecovery: mocks.enter, recoverDatabase: mocks.copy,
  restoreForRecovery: mocks.restore,
} }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.copy.mockResolvedValue(undefined);
  mocks.restore.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("WorkspaceRecovery", () => {
  it("preserves a copy without rendering damaged projects", async () => {
    mocks.save.mockResolvedValue("/selected/recovery.sqlite3");
    render(<WorkspaceRecovery message="Invalid project settings" />);
    expect(mocks.enter).toHaveBeenCalledWith("Invalid project settings");
    fireEvent.click(screen.getByRole("button", { name: "Save recovery copy" }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("/selected/recovery.sqlite3"));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("requires confirmation before restore and reopens only on success", async () => {
    mocks.open.mockResolvedValue("/selected/backup.sqlite3");
    const reopen = vi.fn();
    render(<WorkspaceRecovery message="Unreadable workspace" onReopen={reopen} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore a backup" }));
    await screen.findByRole("dialog", { name: "Replace the local workspace" });
    expect(mocks.restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restore and reopen" }));
    await waitFor(() => expect(reopen).toHaveBeenCalledOnce());
    expect(mocks.restore).toHaveBeenCalledWith("/selected/backup.sqlite3");
  });

  it("keeps recovery available after restore fails", async () => {
    mocks.open.mockResolvedValue("/selected/backup.sqlite3");
    mocks.restore.mockRejectedValue(new Error("Backup failed integrity checks"));
    const reopen = vi.fn();
    render(<WorkspaceRecovery message="Unreadable workspace" onReopen={reopen} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore a backup" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Restore and reopen" }));
    await screen.findByText("Backup failed integrity checks");
    expect(reopen).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Save recovery copy" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
