import { useState } from "react";

import { open, save } from "@tauri-apps/plugin-dialog";

import { PRODUCT } from "../config/product";
import type {
  CardField,
  DensityMode,
  ThemeMode,
  Project,
  Task,
  WorkspaceSnapshot,
  WorkflowColumn,
} from "../domain/types";
import { usePanelFocus } from "../hooks/usePanelFocus";
import { workspaceStore, useWorkspace } from "../state/workspaceStore";
import { Icon } from "./Icon";

interface SettingsPanelProps {
  project: Project;
  columns: WorkflowColumn[];
  labels: WorkspaceSnapshot["labels"];
  members: WorkspaceSnapshot["members"];
  tasks: Task[];
  onClose: () => void;
}

const ICON_OPTIONS = [
  { value: "Archive", label: "Archive tray" },
  { value: "ArchiveX", label: "Archive box" },
  { value: "BadgeCheck", label: "Approval badge" },
  { value: "CalendarClock", label: "Scheduled work" },
  { value: "ChevronsDown", label: "Low chevrons" },
  { value: "ChevronsUp", label: "High chevrons" },
  { value: "CircleDot", label: "Status marker" },
  { value: "CircleDashed", label: "Planning circle" },
  { value: "ClipboardCheck", label: "Checked ticket" },
  { value: "Equal", label: "Medium bars" },
  { value: "FileCheck2", label: "Approved file" },
  { value: "Flame", label: "Urgent flame" },
  { value: "Flag", label: "Priority flag" },
  { value: "FolderKanban", label: "Project board" },
  { value: "Milestone", label: "Milestone diamond" },
  { value: "PackageOpen", label: "Open package" },
  { value: "PenTool", label: "Design pen" },
  { value: "ScanSearch", label: "Inspection scan" },
  { value: "Send", label: "Dispatch arrow" },
  { value: "Shovel", label: "Ground work" },
  { value: "Siren", label: "Alert beacon" },
  { value: "Users", label: "Team" },
  { value: "Wrench", label: "Workshop wrench" },
] as const;

interface IconPickerProps {
  label: string;
  value: string;
  emptyLabel?: string;
  onChange: (value: string) => void;
}

function IconPicker({
  label,
  value,
  emptyLabel,
  onChange,
}: IconPickerProps) {
  return (
    <span className="icon-picker">
      <span className="icon-picker-preview" aria-hidden="true">
        <Icon name={value || "Circle"} />
      </span>
      <select
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {ICON_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

const DAY_OPTIONS = [
  [0, "Sun"],
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
] as const;

const CARD_FIELD_OPTIONS: Array<{ value: CardField; label: string }> = [
  { value: "labels", label: "Labels" },
  { value: "priority", label: "Priority" },
  { value: "dates", label: "Dates" },
  { value: "progress", label: "Progress" },
  { value: "checklist", label: "Sub-tasks" },
  { value: "dependencies", label: "Dependencies" },
  { value: "assignee", label: "Assignee" },
];

function nativeAvailable(): boolean {
  return typeof window.__TAURI_INTERNALS__ !== "undefined";
}

export function SettingsPanel({
  project,
  columns,
  labels,
  members,
  tasks,
  onClose,
}: SettingsPanelProps) {
  const panelRef = usePanelFocus();
  const settings = project.settings;
  const { dataOperation, snapshot } = useWorkspace();
  const [newMemberName, setNewMemberName] = useState("");

  async function chooseSavePath(
    title: string,
    defaultPath: string,
    filterName: string,
    extension: string,
  ): Promise<string | null> {
    if (!nativeAvailable()) {
      workspaceStore.showToast(
        "File actions are available in the desktop build.",
        "warning",
      );
      return null;
    }
    return save({
      title,
      defaultPath,
      filters: [{ name: filterName, extensions: [extension] }],
    });
  }

  async function chooseOpenPath(title: string): Promise<string | null> {
    if (!nativeAvailable()) {
      workspaceStore.showToast(
        "File actions are available in the desktop build.",
        "warning",
      );
      return null;
    }
    const selected = await open({
      title,
      multiple: false,
      directory: false,
      filters: [
        { name: `${PRODUCT.name} data`, extensions: ["json", "sqlite3"] },
      ],
    });
    return typeof selected === "string" ? selected : null;
  }

  return (
    <aside ref={panelRef} className="settings-panel" aria-label="Project settings">
      <header>
        <div>
          <h2>Project setup</h2>
          <p>Change the language and shape of this workspace.</p>
        </div>
        <button aria-label="Close settings" onClick={onClose} type="button">
          <Icon name="X" />
        </button>
      </header>
      <nav className="settings-navigation" aria-label="Project setup sections">
        {[
          "Appearance", "Identity", "Terminology", "Workflow", "Labels",
          "Local team", "Priority levels", "Matrix quadrants",
          "View defaults", "Archived tasks", "Portable data",
        ].map((label, index) => (
          <button
            key={label}
            type="button"
            disabled={dataOperation}
            onClick={() => {
              const heading = document.getElementById(`setup-section-${index === 0 ? 10 : index - 1}`);
              heading?.scrollIntoView({ block: "start" });
              heading?.focus({ preventScroll: true });
            }}
          >{label}</button>
        ))}
      </nav>
      {dataOperation ? (
        <p className="file-operation-status" role="status">
          Saving and processing your file. Please wait.
        </p>
      ) : null}
      <div className="settings-scroll" inert={dataOperation}>
        <section>
          <h3 id="setup-section-10" tabIndex={-1}>Appearance</h3>
          <p className="field-note">Applies to every project.</p>
          <div className="settings-grid two-columns">
            <label>
              Theme
              <select
                value={snapshot?.preferences.theme ?? "system"}
                onChange={(event) => workspaceStore.updatePreferences({
                  theme: event.target.value as ThemeMode,
                })}
              >
                <option value="system">Follow system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Spacing
              <select
                value={snapshot?.preferences.density ?? "comfortable"}
                onChange={(event) => workspaceStore.setDensity(
                  event.target.value as DensityMode,
                )}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
          </div>
        </section>
        <section>
          <h3 id="setup-section-0" tabIndex={-1}>Identity</h3>
          <div className="settings-grid two-columns">
            <label>
              Project name
              <input
                defaultValue={project.name}
                onBlur={(event) =>
                  workspaceStore.updateProject(project.id, {
                    name: event.target.value.trim() || project.name,
                  })
                }
              />
            </label>
            <label>
              Project color
              <span className="color-input">
                <input
                  onChange={(event) =>
                    workspaceStore.updateProject(project.id, {
                      color: event.target.value,
                    })
                  }
                  type="color"
                  value={project.color}
                />
                {project.color}
              </span>
            </label>
            <label>
              Project icon
              <IconPicker
                emptyLabel="Use project initial"
                label="Project icon"
                onChange={(value) =>
                  workspaceStore.updateProject(project.id, {
                    icon: value || null,
                  })
                }
                value={project.icon ?? ""}
              />
            </label>
          </div>
        </section>
        <section>
          <h3 id="setup-section-1" tabIndex={-1}>Terminology</h3>
          <div className="settings-grid two-columns">
            {(
              [
                ["projectSingular", "Project, singular"],
                ["projectPlural", "Project, plural"],
                ["taskSingular", "Task, singular"],
                ["taskPlural", "Task, plural"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  defaultValue={settings.terminology[key]}
                  onBlur={(event) =>
                    workspaceStore.updateProjectSettings(project.id, {
                      terminology: {
                        ...settings.terminology,
                        [key]:
                          event.target.value.trim() ||
                          settings.terminology[key],
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </section>
        <section>
          <div className="settings-section-heading">
            <div>
              <h3 id="setup-section-2" tabIndex={-1}>Workflow</h3>
              <p>
                Names, limits, completion, and sequence are project-specific.
              </p>
            </div>
            <button
              onClick={() => workspaceStore.createColumn(project.id)}
              type="button"
            >
              <Icon name="Plus" /> Add column
            </button>
          </div>
          <div className="workflow-settings-list">
            {columns.map((column) => (
              <div className="workflow-setting-row" key={column.id}>
                <Icon name="GripVertical" />
                <input
                  aria-label="Column color"
                  onChange={(event) =>
                    workspaceStore.updateColumn(column.id, {
                      color: event.target.value,
                    })
                  }
                  type="color"
                  value={column.color}
                />
                <IconPicker
                  label={`Icon for ${column.name}`}
                  onChange={(value) =>
                    workspaceStore.updateColumn(column.id, {
                      icon: value,
                    })
                  }
                  value={column.icon}
                />
                <input
                  aria-label="Column name"
                  defaultValue={column.name}
                  onBlur={(event) =>
                    workspaceStore.updateColumn(column.id, {
                      name: event.target.value.trim() || column.name,
                    })
                  }
                />
                <label>
                  Limit
                  <input
                    min={1}
                    onChange={(event) =>
                      workspaceStore.updateColumn(column.id, {
                        limit: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    type="number"
                    value={column.limit ?? ""}
                  />
                </label>
                <label className="inline-check">
                  <input
                    checked={column.completed}
                    onChange={(event) =>
                      workspaceStore.updateColumn(column.id, {
                        completed: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  Complete
                </label>
                <button
                  aria-label={`Remove ${column.name} column`}
                  className="danger-action setting-delete-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove the ${column.name} column? It must be empty.`,
                      )
                    ) {
                      workspaceStore.deleteColumn(column.id);
                    }
                  }}
                  type="button"
                >
                  <Icon name="Trash2" />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="settings-section-heading">
            <div>
              <h3 id="setup-section-3" tabIndex={-1}>Labels</h3>
              <p>Use one compact visual vocabulary across every view.</p>
            </div>
            <button
              onClick={() => workspaceStore.createLabel(project.id)}
              type="button"
            >
              <Icon name="Plus" /> Add label
            </button>
          </div>
          <div className="label-settings-list">
            {labels.map((label) => (
              <div key={label.id}>
                <input
                  aria-label="Label color"
                  onChange={(event) =>
                    workspaceStore.updateLabel(label.id, {
                      color: event.target.value,
                    })
                  }
                  type="color"
                  value={label.color}
                />
                <IconPicker
                  emptyLabel="Color dot"
                  label={`Icon for ${label.name}`}
                  onChange={(value) =>
                    workspaceStore.updateLabel(label.id, {
                      icon: value || null,
                    })
                  }
                  value={label.icon ?? ""}
                />
                <input
                  aria-label="Label name"
                  defaultValue={label.name}
                  onBlur={(event) =>
                    workspaceStore.updateLabel(label.id, {
                      name: event.target.value.trim() || label.name,
                    })
                  }
                />
                <button
                  aria-label={`Remove ${label.name} label`}
                  className="danger-action setting-delete-button"
                  onClick={() => {
                    const usage = tasks.filter((task) =>
                      task.labelIds.includes(label.id),
                    ).length;
                    if (
                      window.confirm(
                        `Remove ${label.name}? It will be cleared from ` +
                          `${usage} task(s).`,
                      )
                    ) {
                      workspaceStore.deleteLabel(label.id);
                    }
                  }}
                  type="button"
                >
                  <Icon name="Trash2" />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="settings-section-heading">
            <div>
              <h3 id="setup-section-4" tabIndex={-1}>Local team</h3>
              <p>
                Add people for assignments and filters. All details stay on
                this device.
              </p>
            </div>
          </div>
          <form
            className="member-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                workspaceStore.createMember(project.id, newMemberName)
              ) {
                setNewMemberName("");
              }
            }}
          >
            <label>
              Member name
              <input
                onChange={(event) => setNewMemberName(event.target.value)}
                placeholder="Full name"
                value={newMemberName}
              />
            </label>
            <button type="submit">
              <Icon name="Plus" /> Add member
            </button>
          </form>
          <div className="member-settings-list">
            {members.length > 0 ? (
              members.map((member) => {
                const assignmentCount = tasks.filter(
                  (task) => task.assigneeId === member.id,
                ).length;
                return (
                  <div className="member-setting-row" key={member.id}>
                    <input
                      aria-label={`Color for ${member.name}`}
                      onChange={(event) =>
                        workspaceStore.updateMember(member.id, {
                          color: event.target.value,
                        })
                      }
                      type="color"
                      value={member.color}
                    />
                    <input
                      aria-label="Member initials"
                      defaultValue={member.initials}
                      maxLength={3}
                      onBlur={(event) =>
                        workspaceStore.updateMember(member.id, {
                          initials: event.target.value,
                        })
                      }
                    />
                    <input
                      aria-label="Member name"
                      defaultValue={member.name}
                      onBlur={(event) =>
                        workspaceStore.updateMember(member.id, {
                          name: event.target.value,
                        })
                      }
                    />
                    <span>
                      {assignmentCount} assignment
                      {assignmentCount === 1 ? "" : "s"}
                    </span>
                    <button
                      aria-label={`Remove ${member.name}`}
                      className="danger-action"
                      onClick={() => {
                        const detail = assignmentCount > 0
                          ? ` ${assignmentCount} assigned task(s) will be ` +
                            "left unassigned."
                          : "";
                        if (
                          window.confirm(
                            `Remove ${member.name}?${detail}`,
                          )
                        ) {
                          workspaceStore.deleteMember(member.id);
                        }
                      }}
                      type="button"
                    >
                      <Icon name="Trash2" /> Remove
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="field-note">No local team members yet.</p>
            )}
          </div>
        </section>
        <section>
          <h3 id="setup-section-5" tabIndex={-1}>Priority levels</h3>
          <div className="priority-settings-list">
            {settings.priorities.map((priority) => (
              <div key={priority.rank}>
                <strong>{priority.rank}</strong>
                <input
                  aria-label={`Color for ${priority.name}`}
                  onChange={(event) =>
                    workspaceStore.updateProjectSettings(project.id, {
                      priorities: settings.priorities.map((candidate) =>
                        candidate.rank === priority.rank
                          ? { ...candidate, color: event.target.value }
                          : candidate,
                      ),
                    })
                  }
                  type="color"
                  value={priority.color}
                />
                <input
                  aria-label={`Name for priority ${priority.rank}`}
                  defaultValue={priority.name}
                  onBlur={(event) =>
                    workspaceStore.updateProjectSettings(project.id, {
                      priorities: settings.priorities.map((candidate) =>
                        candidate.rank === priority.rank
                          ? {
                              ...candidate,
                              name: event.target.value.trim() || priority.name,
                            }
                          : candidate,
                      ),
                    })
                  }
                />
                <label>
                  Icon
                  <IconPicker
                    label={`Icon for priority ${priority.name}`}
                    onChange={(value) =>
                      workspaceStore.updateProjectSettings(project.id, {
                        priorities: settings.priorities.map((candidate) =>
                          candidate.rank === priority.rank
                            ? { ...candidate, icon: value }
                            : candidate,
                        ),
                      })
                    }
                    value={priority.icon}
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 id="setup-section-6" tabIndex={-1}>Matrix quadrants</h3>
          <div className="quadrant-settings-list">
            {settings.quadrants.map((quadrant) => (
              <div key={quadrant.key}>
                <input
                  aria-label={`Color for ${quadrant.name}`}
                  onChange={(event) =>
                    workspaceStore.updateProjectSettings(project.id, {
                      quadrants: settings.quadrants.map((candidate) =>
                        candidate.key === quadrant.key
                          ? { ...candidate, color: event.target.value }
                          : candidate,
                      ),
                    })
                  }
                  type="color"
                  value={quadrant.color}
                />
                <input
                  aria-label={`Name for ${quadrant.key}`}
                  defaultValue={quadrant.name}
                  onBlur={(event) =>
                    workspaceStore.updateProjectSettings(project.id, {
                      quadrants: settings.quadrants.map((candidate) =>
                        candidate.key === quadrant.key
                          ? {
                              ...candidate,
                              name: event.target.value.trim() || quadrant.name,
                            }
                          : candidate,
                      ),
                    })
                  }
                />
                <input
                  aria-label={`Description for ${quadrant.name}`}
                  defaultValue={quadrant.description}
                  onBlur={(event) =>
                    workspaceStore.updateProjectSettings(project.id, {
                      quadrants: settings.quadrants.map((candidate) =>
                        candidate.key === quadrant.key
                          ? {
                              ...candidate,
                              description:
                                event.target.value.trim() ||
                                quadrant.description,
                            }
                          : candidate,
                      ),
                    })
                  }
                />
                <IconPicker
                  label={`Icon for ${quadrant.name}`}
                  onChange={(value) =>
                    workspaceStore.updateProjectSettings(project.id, {
                      quadrants: settings.quadrants.map((candidate) =>
                        candidate.key === quadrant.key
                          ? { ...candidate, icon: value }
                          : candidate,
                      ),
                    })
                  }
                  value={quadrant.icon}
                />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 id="setup-section-7" tabIndex={-1}>View defaults</h3>
          <div className="settings-grid two-columns">
            <label>
              Default view
              <select
                onChange={(event) =>
                  workspaceStore.updateProjectSettings(project.id, {
                    defaultView: event.target.value as
                      Project["settings"]["defaultView"],
                  })
                }
                value={settings.defaultView}
              >
                <option value="board">Board</option>
                <option value="gantt">Timeline</option>
                <option value="matrix">Matrix</option>
                <option value="list">List</option>
              </select>
            </label>
            <label>
              First day of week
              <select
                onChange={(event) =>
                  workspaceStore.updateProjectSettings(project.id, {
                    firstDayOfWeek: Number(event.target.value),
                  })
                }
                value={settings.firstDayOfWeek}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>
            <label>
              Date format
              <select
                onChange={(event) =>
                  workspaceStore.updateProjectSettings(project.id, {
                    dateFormat: event.target.value,
                  })
                }
                value={settings.dateFormat}
              >
                <option value="MMM d, yyyy">Sep 4, 2026</option>
                <option value="dd/MM/yyyy">04/09/2026</option>
                <option value="MM/dd/yyyy">09/04/2026</option>
                <option value="yyyy-MM-dd">2026-09-04</option>
              </select>
            </label>
          </div>
          <fieldset className="card-field-options working-day-options">
            <legend>Working days</legend>
            {DAY_OPTIONS.map(([day, label]) => (
              <label key={day}>
                <input
                  checked={settings.workingDays.includes(day)}
                  onChange={() => {
                    const workingDays = settings.workingDays.includes(day)
                      ? settings.workingDays.filter((value) => value !== day)
                      : [...settings.workingDays, day].sort();
                    if (workingDays.length === 0) {
                      workspaceStore.showToast(
                        "Keep at least one working day.",
                        "warning",
                      );
                      return;
                    }
                    workspaceStore.updateProjectSettings(project.id, {
                      workingDays,
                    });
                  }}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="binary-controls settings-toggles">
            <label>
              <input
                checked={settings.showWeekends}
                onChange={(event) =>
                  workspaceStore.updateProjectSettings(project.id, {
                    showWeekends: event.target.checked,
                  })
                }
                type="checkbox"
              />
              <span>Show non-working days</span>
            </label>
            <label>
              <input
                checked={settings.showCompletedInMatrix}
                onChange={(event) =>
                  workspaceStore.updateProjectSettings(project.id, {
                    showCompletedInMatrix: event.target.checked,
                  })
                }
                type="checkbox"
              />
              <span>Completed tasks in Matrix</span>
            </label>
          </div>
          <fieldset className="card-field-options">
            <legend>Metadata shown on task cards</legend>
            {CARD_FIELD_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  checked={settings.cardFields.includes(option.value)}
                  onChange={() => {
                    const cardFields = settings.cardFields.includes(
                      option.value,
                    )
                      ? settings.cardFields.filter(
                          (field) => field !== option.value,
                        )
                      : [...settings.cardFields, option.value];
                    workspaceStore.updateProjectSettings(project.id, {
                      cardFields,
                    });
                  }}
                  type="checkbox"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </section>
        <section>
          <h3 id="setup-section-8" tabIndex={-1}>Archived tasks</h3>
          <p className="settings-explanation">
            Archived tasks stay in the local database until you restore them.
          </p>
          <div className="archived-task-list">
            {tasks.some((task) => task.archived) ? (
              tasks
                .filter((task) => task.archived)
                .map((task) => (
                  <div key={task.id}>
                    <span>{task.title}</span>
                    <button
                      onClick={() =>
                        workspaceStore.updateTask(task.id, { archived: false })
                      }
                      type="button"
                    >
                      <Icon name="ArchiveRestore" /> Restore
                    </button>
                  </div>
                ))
            ) : (
              <p className="field-note">No archived tasks.</p>
            )}
          </div>
        </section>
        <section>
          <h3 id="setup-section-9" tabIndex={-1}>Portable data</h3>
          <p className="settings-explanation">
            Project exports are readable JSON. Backups preserve the complete
            local database for disaster recovery.
          </p>
          <div className="file-action-grid">
            <button
              onClick={async () => {
                const path = await chooseSavePath(
                  "Export project",
                  `${project.name}.json`,
                  "JSON",
                  "json",
                );
                if (path) await workspaceStore.exportProject(project.id, path);
              }}
              type="button"
            >
              Export project
            </button>
            <button
              onClick={async () => {
                const path = await chooseOpenPath("Import project");
                if (path) await workspaceStore.importProject(path);
              }}
              type="button"
            >
              Import project
            </button>
            <button
              onClick={async () => {
                const path = await chooseSavePath(
                  "Back up database",
                  `${PRODUCT.shortName.toLowerCase()}-backup.sqlite3`,
                  "SQLite database",
                  "sqlite3",
                );
                if (path) await workspaceStore.backup(path);
              }}
              type="button"
            >
              Back up database
            </button>
            <button
              onClick={async () => {
                const path = await chooseOpenPath("Restore database");
                if (
                  path &&
                  window.confirm(
                    "Restore this backup? Current data will be replaced.",
                  )
                ) {
                  await workspaceStore.restore(path);
                }
              }}
              type="button"
            >
              Restore database
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
