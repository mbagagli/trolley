import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PRODUCT } from "../config/product";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("renders the configured wordmark by default", () => {
    const { container } = render(<BrandLogo />);

    expect(screen.getByText(PRODUCT.name)).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden"))
      .toBe("true");
  });

  it("can render the standalone mark", () => {
    render(<BrandLogo showWordmark={false} />);

    expect(screen.queryByText(PRODUCT.name)).toBeNull();
  });
});
