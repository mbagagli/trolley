import { DragOverlay } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { dropAnimation } from "../config/motion";
import { useWorkspace } from "../state/workspaceStore";

interface FloatingDragOverlayProps {
  children: ReactNode;
  reducedMotion: boolean;
}

export function FloatingDragOverlay({
  children,
  reducedMotion,
}: FloatingDragOverlayProps) {
  const { snapshot } = useWorkspace();
  const density = snapshot?.preferences.density ?? "comfortable";

  // Fixed drag coordinates must bypass transformed views and panels.
  return createPortal(
    <DragOverlay
      adjustScale={false}
      className={`floating-drag-overlay density-${density}`}
      dropAnimation={dropAnimation(reducedMotion)}
    >
      {children}
    </DragOverlay>,
    document.body,
  );
}
