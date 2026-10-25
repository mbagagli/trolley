import { useLayoutEffect, useRef } from "react";

/** Focus a modeless panel on entry and restore its trigger on exit.
 *
 * Keep background navigation available while making panel controls reachable
 * to keyboard users. Native Modal handles protected focus separately.
 *
 * Args:
 *     none: This hook does not accept arguments.
 * Returns:
 *     RefObject: The panel root reference.
 */
export function usePanelFocus() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const trigger = document.activeElement;
    const panel = ref.current;
    const target = panel?.querySelector<HTMLElement>(
      "[data-panel-focus]",
    ) ?? panel?.querySelector<HTMLElement>("button, input, select, textarea");
    target?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
      }
    };
  }, []);
  return ref;
}
