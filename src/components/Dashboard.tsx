import { useMemo, useState, type CSSProperties } from "react";

import type { Project, WorkspaceSnapshot } from "../domain/types";
import { workspaceStore } from "../state/workspaceStore";
import { BrandLogo } from "./BrandLogo";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

interface DashboardProps {
  snapshot: WorkspaceSnapshot;
}

export function Dashboard({ snapshot }: DashboardProps) {
  const [query, setQuery] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<Project | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const projects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return snapshot.projects
      .filter((project) => project.archived === showArchived)
      .filter((project) =>
        project.name.toLocaleLowerCase().includes(normalized),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [query, showArchived, snapshot.projects]);

  function completion(project: Project): number {
    const tasks = snapshot.tasks.filter(
      (task) => task.projectId === project.id && !task.archived,
    );
    if (tasks.length === 0) {
      return 0;
    }
    return Math.round(
      tasks.reduce((total, task) => total + task.progress, 0) / tasks.length,
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <button
          aria-label="Open project dashboard"
          className="brand-lockup"
          onClick={() => workspaceStore.openDashboard()}
          type="button"
        >
          <BrandLogo />
        </button>
        <label className="dashboard-search">
          <Icon name="Search" size={18} />
          <span className="sr-only">Search projects</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search every project"
            type="search"
            value={query}
          />
        </label>
      </header>
      <section className="dashboard-intro">
        <div>
          <h1>Projects ready to move</h1>
          <p>
            Open a project where you left it, or set up a fresh workflow in
            a few seconds.
          </p>
        </div>
        <form
          className="new-project-ticket"
          onSubmit={(event) => {
            event.preventDefault();
            if (workspaceStore.createProject(newProjectName)) {
              setNewProjectName("");
            }
          }}
        >
          <label htmlFor="new-project-name">New project</label>
          <div>
            <input
              id="new-project-name"
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="Name the next piece of work"
              value={newProjectName}
            />
            <button className="primary-button" type="submit">
              <Icon name="Plus" /> Create
            </button>
          </div>
        </form>
      </section>
      <nav className="dashboard-tabs" aria-label="Project state">
        <button
          aria-current={!showArchived}
          onClick={() => setShowArchived(false)}
          type="button"
        >
          Active
          <span>
            {snapshot.projects.filter((item) => !item.archived).length}
          </span>
        </button>
        <button
          aria-current={showArchived}
          onClick={() => setShowArchived(true)}
          type="button"
        >
          Archived
          <span>
            {snapshot.projects.filter((item) => item.archived).length}
          </span>
        </button>
      </nav>
      {projects.length > 0 ? (
        <div className="project-ledger">
          {projects.map((project) => {
            const projectTasks = snapshot.tasks.filter(
              (task) => task.projectId === project.id && !task.archived,
            );
            const complete = completion(project);
            return (
              <article
                className="project-ledger-row"
                key={project.id}
                style={{ "--project-color": project.color } as CSSProperties}
              >
                <button
                  className="project-open-area"
                  onClick={() => workspaceStore.selectProject(project.id)}
                  type="button"
                >
                  <span className="project-color-chip">
                    {project.icon ? <Icon name={project.icon} /> : null}
                  </span>
                  <span className="project-ledger-title">
                    <strong>{project.name}</strong>
                    <small>
                      {projectTasks.length}{" "}
                      {projectTasks.length === 1
                        ? project.settings.terminology.taskSingular
                            .toLowerCase()
                        : project.settings.terminology.taskPlural.toLowerCase()}
                      , {complete}% complete
                    </small>
                  </span>
                  <span className="project-progress" aria-hidden="true">
                    <span style={{ transform: `scaleX(${complete / 100})` }} />
                  </span>
                  <span className="project-date">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                  <Icon name="ChevronRight" />
                </button>
                <div className="project-row-actions">
                  {renamingProjectId === project.id ? (
                    <form
                      className="project-rename-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!renameDraft.trim()) {
                          workspaceStore.showToast(
                            "Project name cannot be empty.",
                            "error",
                          );
                          return;
                        }
                        workspaceStore.renameProject(
                          project.id,
                          renameDraft,
                        );
                        setRenamingProjectId(null);
                      }}
                    >
                      <label className="sr-only" htmlFor={project.id}>
                        Rename {project.name}
                      </label>
                      <input
                        autoFocus
                        id={project.id}
                        onChange={(event) =>
                          setRenameDraft(event.target.value)
                        }
                        value={renameDraft}
                      />
                      <button type="submit">
                        <Icon name="Check" /> Save
                      </button>
                      <button
                        onClick={() => setRenamingProjectId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : project.archived ? (
                    <>
                      <button
                        onClick={() => {
                          setRenamingProjectId(project.id);
                          setRenameDraft(project.name);
                        }}
                        type="button"
                      >
                        <Icon name="PenTool" /> Rename
                      </button>
                      <button
                        onClick={() =>
                          workspaceStore.setProjectArchived(project.id, false)
                        }
                        type="button"
                      >
                        <Icon name="ArchiveRestore" /> Restore
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setRenamingProjectId(project.id);
                          setRenameDraft(project.name);
                        }}
                        type="button"
                      >
                        <Icon name="PenTool" /> Rename
                      </button>
                      <button
                        onClick={() =>
                          workspaceStore.duplicateProject(project.id)
                        }
                        type="button"
                      >
                        <Icon name="Copy" /> Duplicate
                      </button>
                      <button
                        onClick={() =>
                          workspaceStore.setProjectArchived(project.id, true)
                        }
                        type="button"
                      >
                        <Icon name="Archive" /> Archive
                      </button>
                    </>
                  )}
                  {renamingProjectId !== project.id ? (
                    <button
                      className="danger-action"
                      onClick={() => setDeleteCandidate(project)}
                      type="button"
                    >
                      <Icon name="Trash2" /> Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Icon name={showArchived ? "Archive" : "Search"} size={28} />
          <h2>{query ? "No projects match" : "Nothing stored here yet"}</h2>
          <p>
            {query
              ? "Try a shorter project name or switch project state."
              : "Archived projects stay recoverable until you delete them."}
          </p>
        </div>
      )}
      {deleteCandidate ? (
        <Modal
          label="Delete project"
          onClose={() => setDeleteCandidate(null)}
        >
          <div className="dialog-scrim">
            <section className="project-delete-dialog">
              <h2>Delete {deleteCandidate.name}?</h2>
              <p>
                This permanently removes the project and all its tasks,
                columns, labels, local team, and saved filters. It cannot
                be undone. Archive instead if you may need it again.
              </p>
              <div className="project-delete-actions">
                <button
                  autoFocus
                  onClick={() => setDeleteCandidate(null)}
                  type="button"
                >Cancel</button>
                <button
                  className="danger-action"
                  onClick={() => {
                    workspaceStore.deleteProject(deleteCandidate.id);
                    setDeleteCandidate(null);
                  }}
                  type="button"
                >Delete project permanently</button>
              </div>
            </section>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
