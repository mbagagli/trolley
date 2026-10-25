import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

describe("Modal lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens natively, handles cancel, and returns focus on unmount", () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, "showModal")
      .mockImplementation(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      });
    const close = vi.spyOn(HTMLDialogElement.prototype, "close")
      .mockImplementation(function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      });
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const result = render(
      <Modal label="Search" onClose={onClose}><input /></Modal>,
    );
    expect(show).toHaveBeenCalledOnce();
    const dialog = screen.getByRole("dialog", { name: "Search" });
    expect(fireEvent(dialog, new Event("cancel", { cancelable: true })))
      .toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
    result.unmount();
    expect(close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
