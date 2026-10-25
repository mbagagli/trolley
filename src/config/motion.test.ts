import { describe, expect, it } from "vitest";

import {
  DROP_ANIMATION,
  SORTABLE_TRANSITION,
  dropAnimation,
  sortableTransition,
} from "./motion";

describe("motion configuration", () => {
  it("keeps routine drag movement brief and consistent", () => {
    expect(SORTABLE_TRANSITION.duration).toBe(180);
    expect(DROP_ANIMATION).toMatchObject({ duration: 220 });
  });

  it("removes spatial drag animation for reduced motion", () => {
    expect(sortableTransition(true)).toBeNull();
    expect(dropAnimation(true)).toBeNull();
    expect(sortableTransition(false)).toBe(SORTABLE_TRANSITION);
    expect(dropAnimation(false)).toBe(DROP_ANIMATION);
  });
});
