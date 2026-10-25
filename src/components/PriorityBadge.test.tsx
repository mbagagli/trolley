import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PRIORITIES } from "../config/product";
import { PriorityBadge } from "./PriorityBadge";

describe("PriorityBadge", () => {
  it("changes priority without opening a task editor", () => {
    const onChange = vi.fn();
    render(
      <PriorityBadge
        levels={DEFAULT_PRIORITIES}
        onChange={onChange}
        value={3}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Medium" }));
    fireEvent.click(screen.getByRole("option", { name: /Critical/ }));
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
