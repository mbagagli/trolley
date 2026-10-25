import { describe, expect, it } from "vitest";

import { deriveQuadrant, quadrantFlags } from "./quadrant";

describe("quadrant derivation", () => {
  it.each([
    [true, true, "do-first"],
    [false, true, "schedule"],
    [true, false, "delegate"],
    [false, false, "eliminate"],
  ] as const)(
    "maps urgent=%s and important=%s to %s",
    (isUrgent, isImportant, expected) => {
      expect(deriveQuadrant(isUrgent, isImportant)).toBe(expected);
      expect(quadrantFlags(expected)).toEqual({ isUrgent, isImportant });
    },
  );
});
