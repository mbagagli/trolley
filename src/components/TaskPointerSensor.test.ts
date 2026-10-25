import { describe, expect, it } from "vitest";

import { isTaskDragTarget } from "./TaskPointerSensor";

describe("isTaskDragTarget", () => {
  it("allows a drag from the task card surface", () => {
    const card = document.createElement("article");
    const title = document.createElement("span");
    card.append(title);

    expect(isTaskDragTarget(title)).toBe(true);
  });

  it("keeps interactive task controls clickable", () => {
    const button = document.createElement("button");

    expect(isTaskDragTarget(button)).toBe(false);
  });

  it("allows dragging from the priority badge inside a card", () => {
    const card = document.createElement("article");
    const button = document.createElement("button");
    const icon = document.createElement("svg");
    card.className = "task-ticket";
    button.append(icon);
    card.append(button);

    expect(isTaskDragTarget(icon)).toBe(true);
  });

  it("keeps open priority menu options outside the drag surface", () => {
    const card = document.createElement("article");
    const menu = document.createElement("div");
    const option = document.createElement("button");
    card.className = "task-ticket";
    menu.className = "priority-menu";
    menu.append(option);
    card.append(menu);

    expect(isTaskDragTarget(option)).toBe(false);
  });

  it("allows dragging the title while preserving its click action", () => {
    const title = document.createElement("button");
    title.className = "task-ticket-open";

    expect(isTaskDragTarget(title)).toBe(true);
  });

  it("allows the dedicated drag handle", () => {
    const handle = document.createElement("button");
    const icon = document.createElement("svg");
    handle.dataset.dragHandle = "true";
    handle.append(icon);

    expect(isTaskDragTarget(icon)).toBe(true);
  });
});
