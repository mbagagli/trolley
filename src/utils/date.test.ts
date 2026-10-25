import { describe, expect, it } from "vitest";

import { formatShortDate } from "./date";

describe("formatShortDate", () => {
  it("honors each supported project date format", () => {
    expect(formatShortDate("2026-09-04", "yyyy-MM-dd")).toBe("2026-09-04");
    expect(formatShortDate("2026-09-04", "dd/MM/yyyy")).toBe("04/09/2026");
    expect(formatShortDate("2026-09-04", "MM/dd/yyyy")).toBe("09/04/2026");
  });
});
