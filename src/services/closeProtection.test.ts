import { describe, expect, it, vi } from "vitest";
import type { CloseRequestedEvent } from "@tauri-apps/api/window";

import { installCloseProtection } from "./closeProtection";
import type { WorkspaceStore } from "../state/workspaceStore";

const nativeWindow = vi.hoisted(() => ({
  onCloseRequested: vi.fn(),
  destroy: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => nativeWindow,
}));

describe("desktop close protection", () => {
  it("prevents closure and commits focused fields before awaiting saves", async () => {
    let handler!: (event: CloseRequestedEvent) => Promise<void>;
    const unlisten = vi.fn();
    nativeWindow.onCloseRequested.mockImplementation((callback) => {
      handler = callback;
      return Promise.resolve(unlisten);
    });
    const input = document.createElement("input");
    document.body.append(input);
    const commit = vi.fn();
    input.addEventListener("blur", commit);
    input.focus();
    const preventDefault = vi.fn();
    const closeAfterSave = vi.fn(async (close: () => Promise<void>) => {
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(commit).toHaveBeenCalledOnce();
      expect(nativeWindow.destroy).not.toHaveBeenCalled();
      await close();
    });
    const store = { closeAfterSave } as unknown as WorkspaceStore;
    expect(await installCloseProtection(store)).toBe(unlisten);
    await handler({ preventDefault } as unknown as CloseRequestedEvent);
    expect(closeAfterSave).toHaveBeenCalledOnce();
    expect(nativeWindow.destroy).toHaveBeenCalledOnce();
    input.remove();
  });
});
