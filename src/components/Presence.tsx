import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { MOTION_DURATION } from "../config/motion";

interface PresenceProps<Value> {
  children: (value: Value) => ReactNode;
  className?: string;
  exitDuration?: number;
  value: Value | null;
}

type PresenceState = "entering" | "present" | "exiting";

export function Presence<Value>({
  children,
  className = "",
  exitDuration = MOTION_DURATION.feedback,
  value,
}: PresenceProps<Value>) {
  const [renderedValue, setRenderedValue] = useState<Value | null>(value);
  const [presenceState, setPresenceState] = useState<PresenceState>(
    value === null ? "exiting" : "entering",
  );

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    if (value !== null) {
      if (renderedValue !== value) {
        setRenderedValue(value);
      }
      if (renderedValue === null || presenceState !== "present") {
        setPresenceState("entering");
        frame = window.requestAnimationFrame(() => {
          setPresenceState("present");
        });
      }
    } else if (renderedValue !== null) {
      setPresenceState("exiting");
      timer = window.setTimeout(() => {
        setRenderedValue(null);
      }, exitDuration);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [exitDuration, presenceState, renderedValue, value]);

  if (renderedValue === null) {
    return null;
  }

  return (
    <div
      className={`motion-presence ${className}`.trim()}
      data-state={presenceState}
    >
      {children(renderedValue)}
    </div>
  );
}
