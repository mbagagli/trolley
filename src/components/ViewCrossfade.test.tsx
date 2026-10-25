import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ViewCrossfade } from "./ViewCrossfade";

describe("ViewCrossfade", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("releases the outgoing view after reduced-motion feedback", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const result = render(
      <ViewCrossfade transitionKey="board">Board view</ViewCrossfade>,
    );
    result.rerender(
      <ViewCrossfade transitionKey="list">List view</ViewCrossfade>,
    );
    expect(screen.getByText("Board view").closest("[inert]")).toBeTruthy();
    act(() => vi.advanceTimersByTime(80));
    expect(screen.queryByText("Board view")).toBeNull();
    expect(screen.getByText("List view")).toBeTruthy();
  });

  it("keeps the outgoing view through the short crossfade", () => {
    vi.useFakeTimers();
    const result = render(
      <ViewCrossfade transitionKey="board">Board view</ViewCrossfade>,
    );

    result.rerender(
      <ViewCrossfade transitionKey="list">List view</ViewCrossfade>,
    );
    expect(screen.getByText("Board view")).toBeTruthy();
    expect(screen.getByText("List view")).toBeTruthy();

    act(() => vi.advanceTimersByTime(140));
    expect(screen.queryByText("Board view")).toBeNull();
    expect(screen.getByText("List view")).toBeTruthy();
  });
});
