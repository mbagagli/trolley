import {
  PointerSensor,
  type PointerSensorOptions,
} from "@dnd-kit/core";
import type { PointerEvent as ReactPointerEvent } from "react";

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
].join(",");

export function isTaskDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(".priority-menu")) {
    return false;
  }
  if (target.closest(
    "[data-drag-handle], .task-ticket, .task-ticket-open",
  )) {
    return true;
  }
  return target.closest(INTERACTIVE_SELECTOR) === null;
}

export class TaskPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler(
        { nativeEvent: event }: ReactPointerEvent,
        options: PointerSensorOptions,
      ): boolean {
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }
        if (!isTaskDragTarget(event.target)) {
          return false;
        }
        options.onActivation?.({ event });
        return true;
      },
    },
  ];
}
