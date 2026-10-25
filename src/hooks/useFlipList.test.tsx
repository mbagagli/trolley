import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFlipList } from "./useFlipList";

function FlipHarness({
  left,
  paused = false,
}: { left: number; paused?: boolean }) {
  const ref = useFlipList<HTMLDivElement>(String(left), false, paused);
  return (
    <div ref={ref}>
      <span data-left={left} data-motion-key="item" />
    </div>
  );
}

describe("useFlipList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  });

  it("moves a retained item from its previous measured position", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function measuredRect(this: HTMLElement) {
      return DOMRect.fromRect({
        height: 20,
        width: 100,
        x: Number(this.dataset.left ?? 0),
        y: 0,
      });
    });
    const result = render(<FlipHarness left={0} />);

    result.rerender(<FlipHarness left={50} />);

    expect(animate).toHaveBeenCalledWith(
      [
        { transform: "translate(-50px, 0px)" },
        { transform: "translate(0, 0)" },
      ],
      expect.objectContaining({ duration: 240 }),
    );

    result.rerender(<FlipHarness left={50} paused />);

    expect(cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledOnce();
  });
});
