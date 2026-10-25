import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauriRuntime } from "../services/workspaceRepository";
import { workspaceStore } from "../state/workspaceStore";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

interface WorkspaceRecoveryProps {
  message: string;
  title?: string;
  onReopen?: () => void;
}

/** Offer recovery without rendering or saving a damaged project.
 *
 * Args:
 *     message: The load or rendering failure to explain.
 *     title: The recovery heading.
 *     onReopen: Reload action after recovery or when retrying.
 * Returns:
 *     JSX.Element: Safe recovery controls and explicit replacement confirmation.
 */
export function WorkspaceRecovery({
  message, title = "The workspace could not be opened",
  onReopen = () => window.location.reload(),
}: WorkspaceRecoveryProps) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const native = isTauriRuntime();

  useEffect(() => workspaceStore.enterRecovery(message), [message]);

  async function preserveCopy(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const path = await save({
        title: "Preserve a recovery copy",
        defaultPath: "trolley-recovery.zip",
        filters: [{ name: "Recovery archive", extensions: ["zip"] }],
      });
      if (!path) return;
      await workspaceStore.recoverDatabase(path);
      setFeedback("Recovery archive saved. It preserves the database and any journal files for troubleshooting; it is not a validated backup.");
    } catch (error) {
      setFailed(true);
      setFeedback(String(error instanceof Error ? error.message : error));
    } finally { setBusy(false); }
  }

  async function chooseBackup(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const path = await open({
        title: "Choose a backup to restore", multiple: false, directory: false,
        filters: [{ name: "SQLite database", extensions: ["sqlite3"] }],
      });
      if (typeof path === "string") setPendingRestore(path);
    } catch (error) {
      setFailed(true);
      setFeedback(String(error instanceof Error ? error.message : error));
    } finally { setBusy(false); }
  }

  async function restoreBackup(): Promise<void> {
    if (!pendingRestore) return;
    setBusy(true);
    setFailed(false);
    try {
      await workspaceStore.restoreForRecovery(pendingRestore);
      setPendingRestore(null);
      onReopen();
    } catch (error) {
      setFailed(true);
      setFeedback(String(error instanceof Error ? error.message : error));
      setPendingRestore(null);
    } finally { setBusy(false); }
  }

  return (
    <main className="fatal-state" role="alert">
      <Icon name="Siren" size={30} />
      <h1>{title}</h1>
      <p>{message}</p>
      <p>Your local files have not been reset. Preserve a recovery copy,
        then restore a known-good backup.</p>
      {native ? <div className="recovery-actions">
        <button disabled={busy} onClick={() => void preserveCopy()} type="button">
          Save recovery copy
        </button>
        <button disabled={busy} onClick={() => void chooseBackup()} type="button">
          Restore a backup
        </button>
        <button disabled={busy} onClick={() => void workspaceStore.closeAfterSave(
          () => getCurrentWindow().destroy(),
        )} type="button">Close Trolley</button>
      </div> : <p>Database recovery is available in the installed desktop app.</p>}
      <button disabled={busy} onClick={onReopen} type="button">
        Reopen workspace
      </button>
      {feedback ? <p role={failed ? "alert" : "status"}>{feedback}</p> : null}
      {pendingRestore ? <Modal
        label="Replace the local workspace"
        onClose={() => { if (!busy) setPendingRestore(null); }}
      ><section className="modal-card">
        <h2>Replace the local workspace?</h2>
        <p>The selected backup replaces all current projects. Trolley keeps a
          safety copy of the previous database. Save a separate recovery copy
          first if you want to retain it independently.</p>
        <button disabled={busy} onClick={() => setPendingRestore(null)} type="button">
          Cancel
        </button>
        <button disabled={busy} onClick={() => void restoreBackup()} type="button">
          Restore and reopen
        </button>
      </section></Modal> : null}
    </main>
  );
}
