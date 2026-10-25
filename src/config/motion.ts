import {
  defaultDropAnimationSideEffects,
  type DropAnimation,
} from "@dnd-kit/core";
import type { Transition } from "@dnd-kit/utilities";

type SortableTransition = Pick<Transition, "duration" | "easing">;

export const MOTION_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
export const MOTION_DURATION = {
  feedback: 140,
  sorting: 180,
  drop: 220,
  layout: 240,
  settle: 320,
  completion: 360,
} as const;
// Keep feedback mounted until drop travel and acknowledgement both finish.
export const TASK_SETTLE_WINDOW_MS =
  MOTION_DURATION.drop + MOTION_DURATION.settle;

export const SORTABLE_TRANSITION: SortableTransition = {
  duration: MOTION_DURATION.sorting,
  easing: MOTION_EASING,
};

export const DROP_ANIMATION: DropAnimation = {
  duration: MOTION_DURATION.drop,
  easing: MOTION_EASING,
  sideEffects: defaultDropAnimationSideEffects({
    className: { dragOverlay: "is-dropping" },
    styles: {
      active: {
        opacity: "0",
      },
    },
  }),
};

export function sortableTransition(
  reducedMotion: boolean,
): SortableTransition | null {
  return reducedMotion ? null : SORTABLE_TRANSITION;
}

export function dropAnimation(
  reducedMotion: boolean,
): DropAnimation | null {
  return reducedMotion ? null : DROP_ANIMATION;
}
