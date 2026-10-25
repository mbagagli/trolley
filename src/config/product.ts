import workspaceDefaults from "./workspace-defaults.json";

import type {
  PriorityLevel,
  ProjectSettings,
  Terminology,
} from "../domain/types";

export const PRODUCT = {
  name: "Trolley",
  shortName: "Trolley",
  identifier: "io.trolley.desktop",
  databaseFile: "trolley.sqlite3",
} as const;

export const DEFAULT_COLUMN_TASK_LIMIT = 20;

// JSON widens literal unions; regressions verify the shared defaults.
export const DEFAULT_SETTINGS =
  workspaceDefaults.projectSettings as ProjectSettings;
export const DEFAULT_TERMINOLOGY: Terminology = DEFAULT_SETTINGS.terminology;
export const DEFAULT_PRIORITIES: PriorityLevel[] = DEFAULT_SETTINGS.priorities;
