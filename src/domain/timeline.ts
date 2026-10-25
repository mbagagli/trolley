import { parseLocalDate } from "../utils/date";

export const MAX_TIMELINE_SHIFT = 730;
export const MAX_TIMELINE_DAYS = 730;

export function isWorkingDay(
  date: string,
  workingDays: number[],
): boolean {
  return workingDays.includes(parseLocalDate(date).getDay());
}

export function visibleTimelineDays(
  days: string[],
  showNonWorkingDays: boolean,
  workingDays: number[],
): string[] {
  if (showNonWorkingDays) {
    return days;
  }
  return days.filter((date) => isWorkingDay(date, workingDays));
}

export function timelineDayIndex(days: string[], date: string): number {
  return days.findIndex((candidate) => candidate >= date);
}

export function timelineDayEndIndex(days: string[], date: string): number {
  return days.filter((candidate) => candidate <= date).length;
}

export function timelineDaySpan(
  days: string[],
  startDate: string,
  dueDate: string,
): number {
  return Math.max(
    1,
    days.filter((date) => date >= startDate && date <= dueDate).length,
  );
}

export function shiftByTimelineDays(
  date: string,
  delta: number,
  showNonWorkingDays: boolean,
  workingDays: number[],
): string {
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > MAX_TIMELINE_SHIFT) {
    throw new Error("Choose a timeline shift of at most 730 days.");
  }
  if (!showNonWorkingDays && (workingDays.length === 0 ||
    workingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) {
    throw new Error("Keep at least one valid working day.");
  }
  if (delta === 0 || showNonWorkingDays) {
    return shiftTimelineFocus(date, delta);
  }
  const direction = delta < 0 ? -1 : 1;
  let shifted = date;
  let remaining = Math.abs(delta);
  while (remaining > 0) {
    const next = shiftTimelineFocus(shifted, direction);
    if (next === shifted) return shifted;
    shifted = next;
    if (isWorkingDay(shifted, workingDays)) {
      remaining -= 1;
    }
  }
  return shifted;
}

const TIMELINE_DAY_MS = 86_400_000;
const FIRST_CALENDAR_DAY = Date.parse("0001-01-01T12:00:00Z");
const LAST_CALENDAR_DAY = Date.parse("9999-12-31T12:00:00Z");

/** Build a bounded daily timeline window while preserving distant dates.
 *
 * Small projects keep their complete date range. Large spans use a window
 * around the selected date, with navigation supplying another focus date.
 * Args:
 *     dates: Canonical task dates included in the project.
 *     padding: Extra calendar days surrounding the project range.
 *     focus: The selected date for a bounded window.
 * Returns:
 *     string[]: At most 730 canonical calendar dates.
 */
export function boundedTimelineDays(
  dates: string[],
  padding: number,
  focus: string,
): string[] {
  const focusTime = Date.parse(`${focus}T12:00:00Z`);
  if (!Number.isFinite(focusTime) || focusTime < FIRST_CALENDAR_DAY ||
    focusTime > LAST_CALENDAR_DAY || !Number.isInteger(padding) ||
    padding < 0 || padding > MAX_TIMELINE_DAYS) {
    throw new Error("Choose a valid timeline date.");
  }
  let first = focusTime;
  let last = focusTime;
  for (const date of dates) {
    const time = Date.parse(`${date}T12:00:00Z`);
    if (!Number.isFinite(time)) throw new Error("Invalid task calendar date.");
    first = Math.min(first, time);
    last = Math.max(last, time);
  }
  first = Math.max(FIRST_CALENDAR_DAY, first - padding * TIMELINE_DAY_MS);
  last = Math.min(LAST_CALENDAR_DAY, last + padding * TIMELINE_DAY_MS);
  const length = Math.round((last - first) / TIMELINE_DAY_MS) + 1;
  if (length > MAX_TIMELINE_DAYS) {
    first = Math.max(FIRST_CALENDAR_DAY,
      focusTime - Math.floor(MAX_TIMELINE_DAYS / 2) * TIMELINE_DAY_MS);
    last = Math.min(LAST_CALENDAR_DAY,
      first + (MAX_TIMELINE_DAYS - 1) * TIMELINE_DAY_MS);
    first = Math.max(FIRST_CALENDAR_DAY,
      last - (MAX_TIMELINE_DAYS - 1) * TIMELINE_DAY_MS);
  }
  const count = Math.round((last - first) / TIMELINE_DAY_MS) + 1;
  return Array.from({ length: count }, (_, index) =>
    new Date(first + index * TIMELINE_DAY_MS).toISOString().slice(0, 10));
}

/** Move timeline navigation without exceeding the supported calendar. */
export function shiftTimelineFocus(date: string, days: number): string {
  const time = Date.parse(`${date}T12:00:00Z`);
  return new Date(Math.min(LAST_CALENDAR_DAY,
    Math.max(FIRST_CALENDAR_DAY, time + days * TIMELINE_DAY_MS)))
    .toISOString().slice(0, 10);
}
