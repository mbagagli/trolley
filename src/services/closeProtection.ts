/** Protect desktop closure until focused fields and pending writes are saved.
 *
 * Register once outside React so Strict Mode cannot duplicate the listener.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";

import type { WorkspaceStore } from "../state/workspaceStore";

/** Intercept normal desktop close requests and drain workspace saves.
 *
 * Prevent default closure synchronously, commit the focused field, and
 * destroy the window only after persistence succeeds. Destruction avoids
 * emitting another close request.
 * Args:
 *     store: The workspace whose pending edits must be saved.
 * Returns:
 *     Promise<UnlistenFn>: The registered listener cleanup function.
 */
export async function installCloseProtection(
  store: WorkspaceStore,
): Promise<UnlistenFn> {
  const desktopWindow = getCurrentWindow();
  return desktopWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await store.closeAfterSave(() => desktopWindow.destroy());
  });
}
