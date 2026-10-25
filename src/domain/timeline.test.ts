import { describe, expect, it } from "vitest";

import {
  boundedTimelineDays,
  MAX_TIMELINE_DAYS,
  shiftTimelineFocus,
  shiftByTimelineDays,
  timelineDayEndIndex,
  timelineDayIndex,
  timelineDaySpan,
  visibleTimelineDays,
} from "./timeline";

describe("timeline calendar", () => {
  const days = [
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
  ];
  const workingDays = [1, 2, 3, 4, 5];

  it("can hide configured non-working days", () => {
    expect(visibleTimelineDays(days, false, workingDays)).toEqual([
      "2026-09-03",
      "2026-09-04",
      "2026-09-07",
    ]);
  });

  it("positions and sizes work across hidden weekends", () => {
    const visible = visibleTimelineDays(days, false, workingDays);
    expect(timelineDayIndex(visible, "2026-09-04")).toBe(1);
    expect(timelineDayEndIndex(visible, "2026-09-07")).toBe(3);
    expect(timelineDaySpan(visible, "2026-09-04", "2026-09-07")).toBe(2);
  });

  it("moves by visible days when non-working days are hidden", () => {
    expect(
      shiftByTimelineDays("2026-09-04", 1, false, workingDays),
    ).toBe("2026-09-07");
    expect(
      shiftByTimelineDays("2026-09-07", -1, false, workingDays),
    ).toBe("2026-09-04");
  });
  it("bounds wide task spans while allowing distant-date navigation", () => {
    const dates = ["0001-01-01", "9999-12-31"];
    const visible = boundedTimelineDays(dates, 14, "2026-10-07");
    expect(visible).toHaveLength(MAX_TIMELINE_DAYS);
    expect(visible).toContain("2026-10-07");
    const last = boundedTimelineDays(dates, 90, "9999-12-31");
    expect(last).toHaveLength(MAX_TIMELINE_DAYS);
    expect(last[last.length - 1]).toBe("9999-12-31");
    expect(boundedTimelineDays(dates, 14, "0001-01-01")[0])
      .toBe("0001-01-01");
    expect(shiftTimelineFocus("9999-12-31", 365)).toBe("9999-12-31");
    expect(shiftTimelineFocus("0001-01-01", -365)).toBe("0001-01-01");
    expect(shiftByTimelineDays("9999-12-31", 1, true, [1]))
      .toBe("9999-12-31");
    expect(() => boundedTimelineDays([], 14, "0000-01-01"))
      .toThrow("valid timeline date");
  });

  it("rejects impossible working-day loops and excessive shifts", () => {
    expect(() => shiftByTimelineDays("2026-09-04", 1, false, []))
      .toThrow("working day");
    expect(() => shiftByTimelineDays("2026-09-04", 1, false, [7]))
      .toThrow("working day");
    expect(() => shiftByTimelineDays("2026-09-04", Infinity, true, []))
      .toThrow("730");
  });

});
