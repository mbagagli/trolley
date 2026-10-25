const DAY_MS = 86_400_000;

export function parseLocalDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function shiftIsoDate(value: string, days: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

export function daysBetween(start: string, end: string): number {
  return Math.round(
    (parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) /
      DAY_MS,
  );
}

export function formatShortDate(
  value: string | null,
  format = "MMM d, yyyy",
): string {
  if (!value) {
    return "No date";
  }
  const date = parseLocalDate(value);
  if (format === "yyyy-MM-dd") {
    return value;
  }
  if (format === "dd/MM/yyyy") {
    return new Intl.DateTimeFormat("en-GB").format(date);
  }
  if (format === "MM/dd/yyyy") {
    return new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function inclusiveDuration(
  startDate: string | null,
  dueDate: string | null,
): number | null {
  if (!startDate || !dueDate) {
    return null;
  }
  return Math.max(1, daysBetween(startDate, dueDate) + 1);
}
