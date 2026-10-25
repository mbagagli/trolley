import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Presence } from "./Presence";

describe("Presence", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps content mounted during its exit transition", () => {
    vi.useFakeTimers();
    const result = render(
      <Presence value="Panel">
        {(value) => <aside>{value}</aside>}
      </Presence>,
    );

    result.rerender(
      <Presence value={null}>
        {(value) => <aside>{value}</aside>}
      </Presence>,
    );
    expect(screen.getByText("Panel")).toBeTruthy();
    expect(screen.getByText("Panel").parentElement?.dataset.state).toBe(
      "exiting",
    );

    act(() => vi.advanceTimersByTime(140));
    expect(screen.queryByText("Panel")).toBeNull();
  });

  it("cancels an exit when content is reopened", () => {
    vi.useFakeTimers();
    const result = render(
      <Presence value="Panel">
        {(value) => <aside>{value}</aside>}
      </Presence>,
    );

    result.rerender(
      <Presence value={null}>
        {(value) => <aside>{value}</aside>}
      </Presence>,
    );
    result.rerender(
      <Presence value="Panel">
        {(value) => <aside>{value}</aside>}
      </Presence>,
    );
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("Panel")).toBeTruthy();
    expect(screen.getByText("Panel").parentElement?.dataset.state).toBe(
      "present",
    );
  });
});
