import type { PriorityLevel, PriorityRank } from "./types";

export const PRIORITY_ORDER: readonly PriorityRank[] = [1, 2, 3, 4, 5];

export function comparePriority(
  left: PriorityRank,
  right: PriorityRank,
): number {
  return left - right;
}

export function nextPriority(priority: PriorityRank): PriorityRank {
  const index = PRIORITY_ORDER.indexOf(priority);
  return PRIORITY_ORDER[(index + 1) % PRIORITY_ORDER.length] ?? 1;
}

export function priorityLevel(
  levels: PriorityLevel[],
  rank: PriorityRank,
): PriorityLevel {
  const level = levels.find((candidate) => candidate.rank === rank);
  if (!level) {
    throw new Error(`Priority rank ${rank} is not configured.`);
  }
  return level;
}
