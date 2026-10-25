import { describe, expect, it } from "vitest";

import { DEFAULT_PRIORITIES } from "../config/product";
import {
  PRIORITY_ORDER,
  comparePriority,
  nextPriority,
  priorityLevel,
} from "./priority";

describe("priority ordering", () => {
  it("keeps five stable internal ranks", () => {
    expect(PRIORITY_ORDER).toEqual([1, 2, 3, 4, 5]);
    expect(comparePriority(1, 5)).toBeLessThan(0);
    expect(nextPriority(5)).toBe(1);
  });

  it("uses display customization without changing rank", () => {
    const customized = DEFAULT_PRIORITIES.map((priority) =>
      priority.rank === 1 ? { ...priority, name: "Untriaged" } : priority,
    );
    expect(priorityLevel(customized, 1).name).toBe("Untriaged");
    expect(priorityLevel(customized, 1).rank).toBe(1);
  });
});
