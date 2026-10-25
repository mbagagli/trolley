import { describe, expect, it } from "vitest";

import { activeFilterCount, EMPTY_FILTER, taskMatchesFilter } from "./filters";
import { createDemoWorkspace } from "../data/demo";

describe("shared filtering", () => {
  it("counts search and completion alongside selected conditions", () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({
      ...EMPTY_FILTER, query: "permit", includeCompleted: false,
      priorities: [4, 5], dueFrom: "2026-09-01",
    })).toBe(5);
    expect(activeFilterCount({ ...EMPTY_FILTER, query: "  " })).toBe(0);
  });

  it("matches notes and excludes completed or undated tasks when filtered", () => {
    const source = createDemoWorkspace().tasks[0]!;
    const task = { ...source, notes: "Unique handoff note" };
    expect(taskMatchesFilter(task, {
      ...EMPTY_FILTER, query: "unique handoff",
    })).toBe(true);
    expect(taskMatchesFilter({ ...task, completed: true }, {
      ...EMPTY_FILTER, includeCompleted: false,
    })).toBe(false);
    expect(taskMatchesFilter({ ...task, dueDate: null }, {
      ...EMPTY_FILTER, dueFrom: "2026-09-01",
    })).toBe(false);
  });
});
