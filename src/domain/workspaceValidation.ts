import workspaceDefaults from "../config/workspace-defaults.json";
import { DEFAULT_SETTINGS } from "../config/product";
import { EMPTY_FILTER } from "./filters";
import type { WorkspaceSnapshot } from "./types";

type RecordValue = Record<string, unknown>;

const DEFAULT_PREFERENCES = workspaceDefaults.preferences;
const CARD_FIELDS = [
  "labels", "priority", "dates", "progress", "checklist",
  "dependencies", "assignee", "milestone",
];
const QUADRANTS = ["do-first", "schedule", "delegate", "eliminate"];

/** Reject an invalid field without including private workspace contents. */
function invalid(path: string): never {
  throw new Error(
    `Workspace field ${path} is invalid. Restore a valid backup.`,
  );
}

/** Require a plain JSON record at a workspace boundary. */
function record(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(path);
  }
  return value as RecordValue;
}

/** Supply omitted legacy fields while rejecting incompatible supplied types. */
function withDefaults(
  value: unknown,
  defaults: RecordValue,
  path: string,
): RecordValue {
  const supplied = value === undefined ? {} : record(value, path);
  const result: RecordValue = { ...supplied };
  for (const [key, fallback] of Object.entries(defaults)) {
    const current = supplied[key];
    const field = `${path}.${key}`;
    if (current === undefined) {
      result[key] = structuredClone(fallback);
    } else if (Array.isArray(fallback)) {
      if (!Array.isArray(current)) invalid(field);
    } else if (fallback !== null && typeof fallback === "object") {
      result[key] = withDefaults(current, fallback as RecordValue, field);
    } else if (fallback === null) {
      if (current !== null && typeof current !== "string") invalid(field);
    } else if (typeof current !== typeof fallback) {
      invalid(field);
    }
  }
  return result;
}

/** Require a recognized enum value. */
function enumValue(value: unknown, choices: readonly unknown[], path: string) {
  if (!choices.includes(value)) invalid(path);
}

/** Require a list with unique supported values. */
function enumList(
  value: unknown,
  choices: readonly unknown[],
  path: string,
  nonempty = false,
): void {
  if (!Array.isArray(value) || (nonempty && value.length === 0) ||
    new Set(value).size !== value.length ||
    value.some((item) => !choices.includes(item))) invalid(path);
}

/** Require canonical calendar dates that can be rendered safely. */
function nullableDate(value: unknown, path: string): void {
  if (value === null) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000-")) {
    invalid(path);
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value) invalid(path);
}

/** Validate primitive record fields used by rendering and editing. */
function fields(
  value: RecordValue,
  strings: string[],
  numbers: string[],
  booleans: string[],
  path: string,
): void {
  for (const key of strings) {
    if (typeof value[key] !== "string") invalid(`${path}.${key}`);
  }
  for (const key of numbers) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      invalid(`${path}.${key}`);
    }
  }
  for (const key of booleans) {
    if (typeof value[key] !== "boolean") invalid(`${path}.${key}`);
  }
}

/** Normalize and validate one project's editable planning settings. */
function settings(value: unknown, path: string): RecordValue {
  const result = withDefaults(value, DEFAULT_SETTINGS as unknown as
    RecordValue, path);
  enumValue(result.defaultView, ["board", "gantt", "matrix", "list"],
    `${path}.defaultView`);
  enumValue(result.firstDayOfWeek, [0, 1, 2, 3, 4, 5, 6],
    `${path}.firstDayOfWeek`);
  enumList(result.workingDays, [0, 1, 2, 3, 4, 5, 6],
    `${path}.workingDays`, true);
  enumList(result.cardFields, CARD_FIELDS, `${path}.cardFields`);
  for (const [key, expected] of [
    ["priorities", [1, 2, 3, 4, 5]], ["quadrants", QUADRANTS],
  ] as const) {
    const entries = result[key] as unknown[];
    if (entries.length !== expected.length) invalid(`${path}.${key}`);
    const identifiers: unknown[] = [];
    const defaults = DEFAULT_SETTINGS[key] as unknown as RecordValue[];
    const identifier = key === "priorities" ? "rank" : "key";
    result[key] = entries.map((entry, index) => {
      const itemPath = `${path}.${key}[${index}]`;
      const supplied = record(entry, itemPath);
      const fallback = defaults.find((item) =>
        item[identifier] === supplied[identifier]) ?? defaults[index]!;
      const item = withDefaults(supplied, fallback, itemPath);
      fields(item, key === "priorities" ? ["name", "color", "icon"] :
        ["name", "description", "color", "icon"], [], [], itemPath);
      identifiers.push(item[identifier]);
      return item;
    });
    enumList(identifiers, expected, `${path}.${key}`, true);
  }
  return result;
}

/** Normalize legacy filter defaults and reject malformed filter arrays. */
function filter(value: unknown, path: string): RecordValue {
  const result = withDefaults(value, EMPTY_FILTER as unknown as
    RecordValue, path);
  for (const key of ["columnIds", "labelIds", "assigneeIds"]) {
    const ids = result[key] as unknown[];
    if (ids.some((id) => typeof id !== "string")) invalid(`${path}.${key}`);
  }
  enumList(result.priorities, [1, 2, 3, 4, 5], `${path}.priorities`);
  enumList(result.quadrants, QUADRANTS, `${path}.quadrants`);
  nullableDate(result.dueFrom, `${path}.dueFrom`);
  nullableDate(result.dueTo, `${path}.dueTo`);
  return result;
}

/** Normalize missing legacy configuration before exposing data to the UI.
 *
 * Native persistence remains the authority for identities, relationships,
 * and graph validity. This boundary also protects browser previews from
 * malformed localStorage and never substitutes defaults for wrong types.
 * Args:
 *     value: Untrusted loaded or imported workspace data.
 * Returns:
 *     WorkspaceSnapshot: A detached, renderable workspace.
 */
export function normalizeWorkspaceSnapshot(value: unknown): WorkspaceSnapshot {
  const source = record(value, "workspace");
  if (source.schemaVersion !== 1) invalid("schemaVersion");
  if (source.revision !== undefined &&
    (!Number.isSafeInteger(source.revision) ||
      (source.revision as number) < 0)) invalid("revision");
  const snapshot: RecordValue = { ...source };
  for (const key of [
    "projects", "columns", "labels", "members", "tasks", "savedFilters",
  ]) {
    if (!Array.isArray(source[key])) invalid(key);
    snapshot[key] = (source[key] as unknown[]).map((item, index) => {
      const path = `${key}[${index}]`;
      const current = { ...record(item, path) };
      fields(current, ["id"], ["sortPosition"], [], path);
      if (key !== "projects") fields(current, ["projectId"], [], [], path);
      if (key === "projects") {
        fields(current, ["name", "color", "createdAt", "updatedAt"], [],
          ["archived"], path);
        current.settings = settings(current.settings, `${path}.settings`);
      } else if (key === "tasks") {
        fields(current, ["columnId", "title", "description", "notes",
          "createdAt", "updatedAt"], ["progress", "priority"],
        ["isUrgent", "isImportant", "milestone", "completed", "archived"],
        path);
        enumValue(current.priority, [1, 2, 3, 4, 5], `${path}.priority`);
        if (!Number.isInteger(current.progress) ||
          (current.progress as number) < 0 ||
          (current.progress as number) > 100) invalid(`${path}.progress`);
        nullableDate(current.startDate, `${path}.startDate`);
        nullableDate(current.dueDate, `${path}.dueDate`);
        for (const field of ["labelIds", "dependencyIds"]) {
          if (!Array.isArray(current[field]) ||
            current[field].some((id: unknown) => typeof id !== "string")) {
            invalid(`${path}.${field}`);
          }
        }
        if (!Array.isArray(current.checklist)) invalid(`${path}.checklist`);
        current.checklist.forEach((entry: unknown, itemIndex: number) => {
          const itemPath = `${path}.checklist[${itemIndex}]`;
          fields(record(entry, itemPath), ["id", "title"], ["sortPosition"],
            ["completed"], itemPath);
        });
        for (const field of ["parentId", "assigneeId"]) {
          if (current[field] !== null && typeof current[field] !== "string") {
            invalid(`${path}.${field}`);
          }
        }
      } else if (key === "savedFilters") {
        fields(current, ["name"], [], [], path);
        current.filter = filter(current.filter, `${path}.filter`);
      } else {
        fields(current, ["name", "color"], [], [], path);
        if (key === "columns") {
          fields(current, ["icon"], [], ["completed", "collapsed"], path);
        }
        if (key === "members") fields(current, ["initials"], [], [], path);
      }
      return current;
    });
  }
  const preferences = withDefaults(source.preferences, DEFAULT_PREFERENCES,
    "preferences");
  enumValue(preferences.theme, ["system", "light", "dark"],
    "preferences.theme");
  enumValue(preferences.density, ["comfortable", "compact"],
    "preferences.density");
  if (preferences.columnTaskLimitMigrated !== undefined &&
    typeof preferences.columnTaskLimitMigrated !== "boolean") {
    invalid("preferences.columnTaskLimitMigrated");
  }
  snapshot.preferences = preferences;
  return structuredClone(snapshot) as unknown as WorkspaceSnapshot;
}
