import { describe, expect, it } from "vitest";

import { createDemoWorkspace } from "../data/demo";
import { EMPTY_FILTER, taskMatchesFilter } from "./filters";
import { sortTasks } from "./sorting";

describe("large workspace operations", () => {
  it(
    "filters and sorts one thousand tasks within an interaction budget",
    () => {
      const source = createDemoWorkspace(
        new Date("2026-09-04T12:00:00Z"),
      ).tasks[0];
      expect(source).toBeDefined();
      if (!source) return;
      const tasks = Array.from({ length: 1_000 }, (_, index) => ({
        ...source,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        sortPosition: index,
        title: `Generated task ${index}`,
      }));
      const startedAt = performance.now();
      const visible = tasks.filter((task) =>
        taskMatchesFilter(task, EMPTY_FILTER),
      );
      const ordered = sortTasks(visible, "title");
      const elapsedMs = performance.now() - startedAt;
      expect(ordered).toHaveLength(1_000);
      expect(elapsedMs).toBeLessThan(250);
    },
  );
});
