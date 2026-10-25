import { PRODUCT } from "../config/product";
import type { WorkspaceSnapshot } from "./types";

export const WORKSPACE_SCHEMA_VERSION = 1;

export interface ProjectExport {
  format: "trolley-project";
  version: number;
  exportedAt: string;
  project: WorkspaceSnapshot["projects"][number];
  columns: WorkspaceSnapshot["columns"];
  labels: WorkspaceSnapshot["labels"];
  members: WorkspaceSnapshot["members"];
  tasks: WorkspaceSnapshot["tasks"];
  savedFilters: WorkspaceSnapshot["savedFilters"];
}

export function exportProject(
  snapshot: WorkspaceSnapshot,
  projectId: string,
  exportedAt = new Date().toISOString(),
): ProjectExport {
  const project = snapshot.projects.find(
    (candidate) => candidate.id === projectId,
  );
  if (!project) {
    throw new Error("Cannot export a project that does not exist.");
  }
  return {
    format: "trolley-project",
    version: WORKSPACE_SCHEMA_VERSION,
    exportedAt,
    project,
    columns: snapshot.columns.filter((item) => item.projectId === projectId),
    labels: snapshot.labels.filter((item) => item.projectId === projectId),
    members: snapshot.members.filter((item) => item.projectId === projectId),
    tasks: snapshot.tasks.filter((item) => item.projectId === projectId),
    savedFilters: snapshot.savedFilters.filter(
      (item) => item.projectId === projectId,
    ),
  };
}

export function parseProjectExport(input: string): ProjectExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isProjectExport(parsed)) {
    throw new Error(
      `The selected file is not a supported ${PRODUCT.name} project.`,
    );
  }
  return parsed;
}

function isProjectExport(value: unknown): value is ProjectExport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ProjectExport>;
  return candidate.format === "trolley-project" &&
    candidate.version === WORKSPACE_SCHEMA_VERSION &&
    Boolean(candidate.project && typeof candidate.project.id === "string") &&
    Array.isArray(candidate.columns) &&
    Array.isArray(candidate.labels) &&
    Array.isArray(candidate.members) &&
    Array.isArray(candidate.tasks) &&
    Array.isArray(candidate.savedFilters);
}
