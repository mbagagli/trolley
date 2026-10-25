import { useMemo, useState } from "react";

import type { WorkspaceSnapshot } from "../domain/types";
import { workspaceStore } from "../state/workspaceStore";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

interface GlobalSearchProps {
  snapshot: WorkspaceSnapshot;
  onClose: () => void;
}

export function GlobalSearch({ snapshot, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const projects = useMemo(
    () =>
      normalized
        ? snapshot.projects
            .filter((project) =>
              project.name.toLocaleLowerCase().includes(normalized),
            )
            .slice(0, 5)
        : snapshot.projects.filter((project) => !project.archived).slice(0, 5),
    [normalized, snapshot.projects],
  );
  const tasks = useMemo(
    () =>
      normalized
        ? snapshot.tasks
            .filter((task) => !task.archived)
            .filter((task) =>
              `${task.title} ${task.description} ${task.notes}`
                .toLocaleLowerCase()
                .includes(normalized),
            )
            .slice(0, 8)
        : [],
    [normalized, snapshot.tasks],
  );

  return (
    <Modal label="Search all projects" onClose={onClose}>
    <div className="dialog-scrim" onMouseDown={onClose} role="presentation">
      <section
        className="command-palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label className="command-search">
          <Icon name="Search" size={20} />
          <span className="sr-only">Search projects and tasks</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects and tasks..."
            value={query}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-results">
          {projects.length > 0 ? (
            <section>
              <h2>Projects</h2>
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    workspaceStore.selectProject(project.id);
                    onClose();
                  }}
                  type="button"
                >
                  <Icon name={project.archived ? "Archive" : "FolderKanban"} />
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.archived ? "Archived" : "Active"}</small>
                  </span>
                  <Icon name="ChevronRight" />
                </button>
              ))}
            </section>
          ) : null}
          {tasks.length > 0 ? (
            <section>
              <h2>Tasks</h2>
              {tasks.map((task) => {
                const project = snapshot.projects.find(
                  (candidate) => candidate.id === task.projectId,
                );
                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      workspaceStore.selectProject(task.projectId);
                      workspaceStore.setActiveView("board");
                      workspaceStore.selectTask(task.id);
                      onClose();
                    }}
                    type="button"
                  >
                    <Icon name="ClipboardCheck" />
                    <span>
                      <strong>{task.title}</strong>
                      <small>{project?.name ?? "Unknown project"}</small>
                    </span>
                    <Icon name="ChevronRight" />
                  </button>
                );
              })}
            </section>
          ) : null}
          {normalized && projects.length === 0 && tasks.length === 0 ? (
            <div className="command-empty">
              <Icon name="Search" />
              <p>No matching projects or tasks.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
    </Modal>
  );
}
