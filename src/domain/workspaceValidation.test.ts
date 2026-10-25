import { describe, expect, it } from "vitest";
import workspaceDefaults from "../config/workspace-defaults.json";
import {
  DEFAULT_SETTINGS, DEFAULT_PRIORITIES, DEFAULT_TERMINOLOGY,
} from "../config/product";
import { EMPTY_FILTER } from "./filters";
import { createDemoWorkspace } from "../data/demo";
import { normalizeWorkspaceSnapshot } from "./workspaceValidation";

function legacyWorkspace() {
  const value = createDemoWorkspace(new Date("2026-10-07T12:00:00Z"));
  return value as unknown as Record<string, any>;
}

describe("workspace configuration boundary", () => {
  it("uses one shared source for exports and legacy normalization", () => {
    expect(DEFAULT_SETTINGS).toEqual(workspaceDefaults.projectSettings);
    expect(DEFAULT_PRIORITIES)
      .toEqual(workspaceDefaults.projectSettings.priorities);
    expect(DEFAULT_TERMINOLOGY)
      .toEqual(workspaceDefaults.projectSettings.terminology);
    expect(EMPTY_FILTER).toEqual(workspaceDefaults.filter);
    const value = legacyWorkspace();
    value.projects[0].settings = {};
    value.preferences = {};
    value.savedFilters = [{
      id: "legacy", projectId: value.projects[0].id,
      name: "Legacy", sortPosition: 0, filter: {},
    }];
    const normalized = normalizeWorkspaceSnapshot(value);
    expect(normalized.projects[0]?.settings)
      .toEqual(workspaceDefaults.projectSettings);
    expect(normalized.preferences).toEqual(workspaceDefaults.preferences);
    expect(normalized.savedFilters[0]?.filter)
      .toEqual(workspaceDefaults.filter);
  });

  it("supplies missing legacy fields without changing the source", () => {
    const value = legacyWorkspace();
    value.projects[0].settings = { terminology: { taskPlural: "Jobs" } };
    value.preferences = {};
    const normalized = normalizeWorkspaceSnapshot(value);
    expect(normalized.projects[0]?.settings.priorities)
      .toEqual(DEFAULT_SETTINGS.priorities);
    expect(normalized.projects[0]?.settings.terminology.taskPlural)
      .toBe("Jobs");
    expect(normalized.projects[0]?.settings.terminology.taskSingular)
      .toBe("Task");
    expect(normalized.preferences.theme).toBe("system");
    expect(value.projects[0].settings.priorities).toBeUndefined();
  });

  it("fills legacy fields within ranked configuration entries", () => {
    const value = legacyWorkspace();
    value.projects[0].settings.priorities = DEFAULT_PRIORITIES.map(
      ({ rank, name }) => ({ rank, name }),
    );
    expect(normalizeWorkspaceSnapshot(value).projects[0]?.settings.priorities)
      .toEqual(DEFAULT_PRIORITIES);
    value.projects[0].settings.priorities[0].color = 4;
    expect(() => normalizeWorkspaceSnapshot(value)).toThrow("color");
  });

  it.each([
    ["workingDays", []], ["workingDays", [7]],
    ["workingDays", [1, 1]], ["priorities", []],
    ["terminology", null], ["showWeekends", "false"],
    ["defaultView", "unknown"], ["cardFields", ["unsupported"]],
  ])("rejects malformed supplied setting %s", (key, supplied) => {
    const value = legacyWorkspace();
    value.projects[0].settings[key] = supplied;
    expect(() => normalizeWorkspaceSnapshot(value)).toThrow("invalid");
  });

  it("rejects malformed preferences, dates, and revision", () => {
    const value = legacyWorkspace();
    value.preferences.theme = "unsupported";
    expect(() => normalizeWorkspaceSnapshot(value))
      .toThrow("preferences.theme");
    value.preferences.theme = "system";
    value.tasks[0].startDate = "2026-02-31";
    expect(() => normalizeWorkspaceSnapshot(value)).toThrow("startDate");
    value.tasks[0].startDate = null;
    value.revision = -1;
    expect(() => normalizeWorkspaceSnapshot(value)).toThrow("revision");
    value.revision = 5;
    expect(normalizeWorkspaceSnapshot(value).revision).toBe(5);
  });

  it("normalizes legacy filters and rejects wrong arrays", () => {
    const value = legacyWorkspace();
    value.savedFilters = [{
      id: "filter", projectId: value.projects[0].id,
      name: "Old filter", sortPosition: 0, filter: { query: "garden" },
    }];
    expect(normalizeWorkspaceSnapshot(value).savedFilters[0]?.filter.columnIds)
      .toEqual([]);
    value.savedFilters[0].filter.columnIds = [4];
    expect(() => normalizeWorkspaceSnapshot(value)).toThrow("columnIds");
  });
});
