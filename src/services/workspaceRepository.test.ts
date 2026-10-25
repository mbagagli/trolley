import { afterEach, describe, expect, it } from "vitest";

import { PRODUCT } from "../config/product";
import { createDemoWorkspace } from "../data/demo";
import { WorkspaceRepository } from "./workspaceRepository";

const key = `${PRODUCT.identifier}.workspace.v1`;

describe("browser workspace revision protection", () => {
  afterEach(() => window.localStorage.removeItem(key));

  it("rejects an exhausted revision without replacing stored data", async () => {
    const snapshot = createDemoWorkspace();
    snapshot.revision = Number.MAX_SAFE_INTEGER;
    const original = JSON.stringify(snapshot);
    window.localStorage.setItem(key, original);
    await expect(new WorkspaceRepository().save(snapshot))
      .rejects.toThrow("revision limit");
    expect(window.localStorage.getItem(key)).toBe(original);
  });

  it("rejects a stale browser save without replacing newer data", async () => {
    const persisted = createDemoWorkspace();
    persisted.revision = 4;
    const original = JSON.stringify(persisted);
    window.localStorage.setItem(key, original);
    const stale = { ...persisted, revision: 3 };
    await expect(new WorkspaceRepository().save(stale))
      .rejects.toThrow("changed elsewhere");
    expect(window.localStorage.getItem(key)).toBe(original);
  });
});
