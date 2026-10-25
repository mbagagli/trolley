import { describe, expect, it } from "vitest";

import { nextItemIdAfterMove, reorderItemsById } from "./ordering";

const ITEMS = [{ id: "first" }, { id: "second" }, { id: "third" }];

describe("sortable ordering", () => {
  it("moves an item to the sortable target index", () => {
    expect(
      reorderItemsById(ITEMS, "first", "third").map((item) => item.id),
    ).toEqual(["second", "third", "first"]);
  });

  it("returns the following item for a move-before store operation", () => {
    expect(nextItemIdAfterMove(ITEMS, "third", "first")).toBe("first");
    expect(nextItemIdAfterMove(ITEMS, "first", "third")).toBeNull();
  });
});
