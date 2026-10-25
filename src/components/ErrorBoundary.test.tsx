import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function BrokenView(): never {
  throw new Error("Broken test view");
}

describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("replaces a failed view with a readable recovery state", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Broken test view")).toBeTruthy();
  });
});
