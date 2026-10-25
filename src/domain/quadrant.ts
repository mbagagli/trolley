import type { QuadrantKey } from "./types";

export function deriveQuadrant(
  isUrgent: boolean,
  isImportant: boolean,
): QuadrantKey {
  if (isUrgent && isImportant) {
    return "do-first";
  }
  if (isImportant) {
    return "schedule";
  }
  if (isUrgent) {
    return "delegate";
  }
  return "eliminate";
}

export function quadrantFlags(quadrant: QuadrantKey): {
  isUrgent: boolean;
  isImportant: boolean;
} {
  return {
    isUrgent: quadrant === "do-first" || quadrant === "delegate",
    isImportant: quadrant === "do-first" || quadrant === "schedule",
  };
}
