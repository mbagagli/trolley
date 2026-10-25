import { invoke } from "@tauri-apps/api/core";

import { PRODUCT } from "../config/product";
import { createDemoWorkspace } from "../data/demo";
import { normalizeWorkspaceSnapshot } from "../domain/workspaceValidation";
import type { WorkspaceSnapshot } from "../domain/types";

const STORAGE_KEY = `${PRODUCT.identifier}.workspace.v1`;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" &&
    typeof window.__TAURI_INTERNALS__ !== "undefined";
}

export class WorkspaceRepository {
  async load(): Promise<WorkspaceSnapshot> {
    if (isTauriRuntime()) {
      const loaded = await invoke<WorkspaceSnapshot | null>("load_workspace");
      if (loaded) {
        return normalizeWorkspaceSnapshot(loaded);
      }
      const seeded = createDemoWorkspace();
      seeded.revision = await this.save(seeded);
      return normalizeWorkspaceSnapshot(seeded);
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDemoWorkspace();
    }
    try {
      return normalizeWorkspaceSnapshot(JSON.parse(stored));
    } catch {
      throw new Error(
        "Local workspace data is unreadable. Restore a backup or clear " +
          "the browser preview data.",
      );
    }
  }

  async save(snapshot: WorkspaceSnapshot): Promise<number> {
    if (isTauriRuntime()) {
      return invoke<number>("save_workspace", { snapshot });
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const revision = stored ? normalizeWorkspaceSnapshot(JSON.parse(stored)).revision ?? 0 : 0;
    if ((snapshot.revision ?? 0) !== revision) {
      throw new Error("This workspace changed elsewhere. Reopen it before saving again.");
    }
    if (revision >= Number.MAX_SAFE_INTEGER) {
      throw new Error("Workspace revision limit reached. Preserve a copy before resetting preview data.");
    }
    const nextRevision = revision + 1;
    window.localStorage.setItem(
      STORAGE_KEY, JSON.stringify({ ...snapshot, revision: nextRevision }),
    );
    return nextRevision;
  }

  async exportProject(projectId: string, path: string): Promise<void> {
    if (!isTauriRuntime()) {
      throw new Error("Native file export is available in the desktop app.");
    }
    await invoke("export_project", { projectId, path });
  }

  async importProject(path: string): Promise<WorkspaceSnapshot> {
    if (!isTauriRuntime()) {
      throw new Error("Native file import is available in the desktop app.");
    }
    return normalizeWorkspaceSnapshot(
      await invoke<WorkspaceSnapshot>("import_project", { path }),
    );
  }

  async backup(path: string): Promise<void> {
    if (!isTauriRuntime()) {
      throw new Error("Database backup is available in the desktop app.");
    }
    await invoke("backup_database", { path });
  }

  /** Preserve persisted SQLite data without requiring valid project settings.
   *
   * Args:
   *     path: A destination selected through the native save dialog.
   * Returns:
   *     Promise<void>: Resolves after the recovery copy is safely written.
   */
  async recoverDatabase(path: string): Promise<void> {
    if (!isTauriRuntime()) {
      throw new Error("Database recovery is available in the desktop app.");
    }
    await invoke("recover_database", { path });
  }

  async restore(path: string): Promise<WorkspaceSnapshot> {
    if (!isTauriRuntime()) {
      throw new Error("Database restore is available in the desktop app.");
    }
    return normalizeWorkspaceSnapshot(
      await invoke<WorkspaceSnapshot>("restore_database", { path }),
    );
  }
}
