import { useLayoutEffect, useRef, type RefObject } from "react";

import { MOTION_DURATION, MOTION_EASING } from "../config/motion";

const FLIP_SELECTOR = "[data-motion-key]";

export function useFlipList<ElementType extends HTMLElement>(
  layoutKey: string,
  reducedMotion: boolean,
  paused = false,
): RefObject<ElementType | null> {
  const rootRef = useRef<ElementType | null>(null);
  const previousRects = useRef(new Map<string, DOMRect>());
  const wasPaused = useRef(paused);
  const animations = useRef(new Map<HTMLElement, Animation>());

  useLayoutEffect(() => {
    const interruptedRects = new Map<HTMLElement, DOMRect>();
    for (const [element, animation] of animations.current) {
      if (animation.playState === "running") {
        interruptedRects.set(element, element.getBoundingClientRect());
      }
      animation.cancel();
    }
    animations.current.clear();
    const elements = rootRef.current?.querySelectorAll<HTMLElement>(
      FLIP_SELECTOR,
    );
    const currentRects = new Map<string, DOMRect>();
    if (!elements) {
      previousRects.current = currentRects;
      wasPaused.current = paused;
      return;
    }

    for (const element of elements) {
      const key = element.dataset.motionKey;
      if (key) {
        currentRects.set(key, element.getBoundingClientRect());
      }
    }

    if (!reducedMotion && !paused && !wasPaused.current) {
      for (const element of elements) {
        const key = element.dataset.motionKey;
        const previous = key ? previousRects.current.get(key) : undefined;
        const current = key ? currentRects.get(key) : undefined;
        if (!previous || !current || typeof element.animate !== "function") {
          continue;
        }
        const interrupted = interruptedRects.get(element);
        const offsetX = interrupted ? interrupted.left - current.left : 0;
        const offsetY = interrupted ? interrupted.top - current.top : 0;
        const deltaX = previous.left - current.left + offsetX;
        const deltaY = previous.top - current.top + offsetY;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
          continue;
        }
        const animation = element.animate(
          [
            { transform: `translate(${deltaX}px, ${deltaY}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: MOTION_DURATION.layout,
            easing: MOTION_EASING,
          },
        );
        animations.current.set(element, animation);
      }
    }

    previousRects.current = currentRects;
    wasPaused.current = paused;
  }, [layoutKey, paused, reducedMotion]);

  useLayoutEffect(() => () => {
    for (const animation of animations.current.values()) {
      animation.cancel();
    }
    animations.current.clear();
  }, []);

  return rootRef;
}
