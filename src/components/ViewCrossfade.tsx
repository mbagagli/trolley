import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { MOTION_DURATION } from "../config/motion";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface ViewCrossfadeProps {
  children: ReactNode;
  transitionKey: string;
}

interface ViewLayer {
  content: ReactNode;
  key: string;
}

export function ViewCrossfade({
  children,
  transitionKey,
}: ViewCrossfadeProps) {
  const reducedMotion = useReducedMotion();
  const lastLayer = useRef<ViewLayer>({
    content: children,
    key: transitionKey,
  });
  const [previousLayer, setPreviousLayer] = useState<ViewLayer | null>(null);
  const exitTimer = useRef(0);

  useLayoutEffect(() => {
    if (lastLayer.current.key !== transitionKey) {
      window.clearTimeout(exitTimer.current);
      setPreviousLayer(lastLayer.current);
      exitTimer.current = window.setTimeout(
        () => setPreviousLayer(null),
        reducedMotion ? 80 : MOTION_DURATION.feedback,
      );
    }
    lastLayer.current = { content: children, key: transitionKey };
  }, [children, reducedMotion, transitionKey]);

  useLayoutEffect(
    () => () => window.clearTimeout(exitTimer.current),
    [],
  );

  return (
    <div className="view-crossfade">
      {previousLayer ? (
        <div
          aria-hidden="true"
          className="view-transition-layer is-exiting"
          inert
          key={`previous:${previousLayer.key}`}
        >
          {previousLayer.content}
        </div>
      ) : null}
      <div
        className="view-transition-layer is-current"
        key={transitionKey}
      >
        {children}
      </div>
    </div>
  );
}
