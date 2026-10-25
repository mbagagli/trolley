import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import {
  wouldCreateDependencyCycle,
  wouldCreateParentCycle,
} from "../domain/dependencies";
import { MOTION_DURATION, sortableTransition } from "../config/motion";
import { summarizeSubtasks } from "../domain/subtasks";
import type {
  ChecklistItem,
  Label,
  PriorityLevel,
  Task,
  TeamMember,
  Terminology,
  WorkflowColumn,
} from "../domain/types";
import { usePanelFocus } from "../hooks/usePanelFocus";
import { workspaceStore } from "../state/workspaceStore";
import { useFlipList } from "../hooks/useFlipList";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { inclusiveDuration } from "../utils/date";
import { Icon } from "./Icon";
import { FloatingDragOverlay } from "./FloatingDragOverlay";
import { PriorityBadge } from "./PriorityBadge";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

interface TaskDrawerProps {
  task: Task;
  tasks: Task[];
  columns: WorkflowColumn[];
  labels: Label[];
  members: TeamMember[];
  priorities: PriorityLevel[];
  terminology: Terminology;
}

interface SortableSubtaskProps {
  item: ChecklistItem;
  onRemove: (itemId: string) => void;
  onRename: (itemId: string, title: string) => boolean;
  onToggle: (itemId: string, completed: boolean) => void;
  entering: boolean;
  reducedMotion: boolean;
  removing: boolean;
  settled: boolean;
}

const SUBTASK_ANNOUNCEMENTS: Announcements = {
  onDragStart({ active }) {
    return `${active.data.current?.title ?? "Sub-task"} picked up.`;
  },
  onDragOver({ active, over }) {
    const activeTitle = active.data.current?.title ?? "Sub-task";
    const overTitle = over?.data.current?.title;
    return overTitle ? `${activeTitle} is over ${overTitle}.` : undefined;
  },
  onDragEnd({ active, over }) {
    const title = active.data.current?.title ?? "Sub-task";
    return over ? `${title} moved.` : `${title} returned to its position.`;
  },
  onDragCancel({ active }) {
    const title = active.data.current?.title ?? "Sub-task";
    return `Moving ${title} was cancelled.`;
  },
};

function subtaskDragId(itemId: string): string {
  return `subtask:${itemId}`;
}

function SortableSubtask({
  item,
  entering,
  onRemove,
  onRename,
  onToggle,
  reducedMotion,
  removing,
  settled,
}: SortableSubtaskProps) {
  const [title, setTitle] = useState(item.title);
  const sortable = useSortable({
    id: subtaskDragId(item.id),
    data: { itemId: item.id, title: item.title },
    transition: sortableTransition(reducedMotion),
  });
  const style: CSSProperties = {
    opacity: sortable.isDragging ? 0.45 : 1,
    transform: sortable.isDragging
      ? undefined
      : CSS.Transform.toString(sortable.transform),
    transition: sortable.isDragging ? undefined : sortable.transition,
  };

  useEffect(() => setTitle(item.title), [item.title]);

  return (
    <li
      className={
        `${sortable.isDragging ? "is-dragging" : ""}` +
        `${entering ? " is-entering" : ""}` +
        `${settled ? " is-settled" : ""}` +
        `${removing ? " is-removing" : ""}`
      }
      data-motion-key={`subtask:${item.id}`}
      ref={sortable.setNodeRef}
      style={style}
    >
      <button
        aria-label={`Move sub-task: ${item.title}`}
        className="subtask-drag-handle"
        ref={sortable.setActivatorNodeRef}
        type="button"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <Icon name="GripVertical" size={14} />
      </button>
      <input
        aria-label={
          `${item.completed ? "Reopen" : "Complete"} sub-task: ` +
          item.title
        }
        checked={item.completed}
        onChange={(event) => onToggle(item.id, event.target.checked)}
        type="checkbox"
      />
      <input
        aria-label={`Sub-task description: ${item.title}`}
        className="subtask-description"
        onBlur={() => {
          const normalized = title.trim();
          if (normalized === item.title) {
            setTitle(normalized);
          } else if (!onRename(item.id, normalized)) {
            setTitle(item.title);
          }
        }}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setTitle(item.title);
            event.currentTarget.blur();
          }
        }}
        value={title}
      />
      <button
        aria-label={`Delete sub-task: ${item.title}`}
        className="subtask-delete"
        onClick={() => onRemove(item.id)}
        type="button"
      >
        <Icon name="Trash2" size={14} />
      </button>
    </li>
  );
}

export function TaskDrawer({
  task,
  tasks,
  columns,
  labels,
  members,
  priorities,
  terminology,
}: TaskDrawerProps) {
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState(task);
  const [descriptionMode, setDescriptionMode] = useState<"edit" | "preview">(
    "edit",
  );
  const [dependencyId, setDependencyId] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [activeSubtaskId, setActiveSubtaskId] = useState<string | null>(null);
  const [enteringSubtaskId, setEnteringSubtaskId] = useState<string | null>(
    null,
  );
  const [settledSubtaskId, setSettledSubtaskId] = useState<string | null>(null);
  const [removingSubtasks, setRemovingSubtasks] = useState<Set<string>>(
    new Set(),
  );
  const [completionFeedback, setCompletionFeedback] = useState(false);
  const settledTimer = useRef(0);
  const entryTimer = useRef(0);
  const completionTimer = useRef(0);
  const removalTimers = useRef(new Map<string, number>());
  const previousCompletion = useRef(task.completed);
  const subtaskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const projectTasks = useMemo(
    () => tasks.filter((candidate) => candidate.projectId === task.projectId),
    [task.projectId, tasks],
  );
  const subtaskLayoutRef = useFlipList<HTMLOListElement>(
    draft.checklist.map((item) => item.id).join("|"),
    reducedMotion,
    activeSubtaskId !== null,
  );

  useEffect(() => setDraft(task), [task]);

  useEffect(() => {
    if (!previousCompletion.current && task.completed && !reducedMotion) {
      window.clearTimeout(completionTimer.current);
      setCompletionFeedback(true);
      completionTimer.current = window.setTimeout(
        () => setCompletionFeedback(false),
        MOTION_DURATION.completion,
      );
    }
    previousCompletion.current = task.completed;
  }, [reducedMotion, task.completed]);

  useEffect(
    () => () => {
      window.clearTimeout(settledTimer.current);
      window.clearTimeout(entryTimer.current);
      window.clearTimeout(completionTimer.current);
      for (const timer of removalTimers.current.values()) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  function save(changes: Partial<Task>): void {
    if (workspaceStore.updateTask(task.id, changes)) {
      setDraft((current) => ({ ...current, ...changes }));
    }
  }

  function toggleLabel(labelId: string): void {
    const labelIds = draft.labelIds.includes(labelId)
      ? draft.labelIds.filter((id) => id !== labelId)
      : [...draft.labelIds, labelId];
    save({ labelIds });
  }

  function addChecklistItem(): void {
    const title = checklistTitle.trim();
    if (!title) {
      return;
    }
    const itemId = workspaceStore.addSubtask(task.id, title);
    if (itemId) {
      setChecklistTitle("");
      if (!reducedMotion) {
        window.clearTimeout(entryTimer.current);
        setEnteringSubtaskId(itemId);
        entryTimer.current = window.setTimeout(
          () => setEnteringSubtaskId(null),
          MOTION_DURATION.sorting,
        );
      }
    }
  }

  function handleSubtaskDragStart(event: DragStartEvent): void {
    setActiveSubtaskId(String(event.active.data.current?.itemId ?? ""));
  }

  function clearSubtaskDrag(): void {
    setActiveSubtaskId(null);
  }

  function handleSubtaskDragEnd(event: DragEndEvent): void {
    const activeId = event.active.data.current?.itemId;
    const overId = event.over?.data.current?.itemId;
    clearSubtaskDrag();
    if (activeId && overId && activeId !== overId) {
      workspaceStore.reorderSubtask(
        task.id,
        String(activeId),
        String(overId),
      );
      if (!reducedMotion) {
        window.clearTimeout(settledTimer.current);
        setSettledSubtaskId(String(activeId));
        settledTimer.current = window.setTimeout(
          () => setSettledSubtaskId(null),
          MOTION_DURATION.settle,
        );
      }
    }
  }

  function removeSubtask(itemId: string): void {
    if (reducedMotion) {
      workspaceStore.deleteSubtask(task.id, itemId);
      return;
    }
    setRemovingSubtasks((current) => new Set(current).add(itemId));
    const timer = window.setTimeout(() => {
      workspaceStore.deleteSubtask(task.id, itemId);
      setRemovingSubtasks((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
      removalTimers.current.delete(itemId);
    }, MOTION_DURATION.feedback);
    removalTimers.current.set(itemId, timer);
  }

  function addDependency(): void {
    if (!dependencyId) {
      return;
    }
    if (wouldCreateDependencyCycle(tasks, task.id, dependencyId)) {
      workspaceStore.showToast(
        "That dependency would create a cycle. Choose another task.",
        "error",
      );
      return;
    }
    save({ dependencyIds: [...draft.dependencyIds, dependencyId] });
    setDependencyId("");
  }

  const duration = inclusiveDuration(draft.startDate, draft.dueDate);
  const panelRef = usePanelFocus();
  const subtaskSummary = summarizeSubtasks(draft.checklist);
  return (
    <aside
      ref={panelRef}
      className={
        `task-drawer${completionFeedback ? " is-complete-feedback" : ""}`
      }
      aria-label={`${terminology.taskSingular} details: ${task.title}`}
    >
      <header className="drawer-header">
        <div>
          <span className="drawer-ticket-code">
            TASK-{task.id.slice(0, 4).toUpperCase()}
          </span>
          <p>Task details</p>
        </div>
        <button
          aria-label="Close task details"
          className="icon-button"
          onClick={() => workspaceStore.selectTask(null)}
          type="button"
        >
          <Icon name="X" size={18} />
        </button>
      </header>
      <div className="drawer-scroll">
        <label className="title-field">
          <span>{terminology.taskSingular} title</span>
          <textarea
            data-panel-focus
            onBlur={() => save({ title: draft.title })}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            rows={2}
            value={draft.title}
          />
        </label>
        <div className="drawer-state-row">
          <PriorityBadge
            levels={priorities}
            onChange={(priority) => save({ priority })}
            value={draft.priority}
          />
          <label className="select-field compact-field">
            <span>Status</span>
            <select
              onChange={(event) =>
                workspaceStore.moveTask(task.id, event.target.value)
              }
              value={draft.columnId}
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <section className="drawer-section">
          <div className="drawer-section-heading">
            <h2>Description</h2>
            <div className="mini-tabs">
              <button
                aria-pressed={descriptionMode === "edit"}
                onClick={() => setDescriptionMode("edit")}
                type="button"
              >
                Edit
              </button>
              <button
                aria-pressed={descriptionMode === "preview"}
                onClick={() => setDescriptionMode("preview")}
                type="button"
              >
                Preview
              </button>
            </div>
          </div>
          {descriptionMode === "edit" ? (
            <textarea
              aria-label="Task description"
              className="description-editor"
              onBlur={() => save({ description: draft.description })}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Add Markdown notes, links, and context..."
              rows={7}
              value={draft.description}
            />
          ) : (
            <div className="markdown-preview">
              {draft.description ? (
                <ReactMarkdown
                  components={{
                    img: ({ alt }) => (
                      <span className="field-note">
                        {alt ? `Image: ${alt}. ` : "Image. "}
                        Images are disabled to keep your workspace offline.
                      </span>
                    ),
                    a: ({ children, href }) => (
                      <a
                        href={href}
                        onClick={(event) => {
                          event.preventDefault();
                          workspaceStore.showToast(
                            "Right-click to copy this link and open it in your browser.",
                            "warning",
                          );
                        }}
                        onAuxClick={(event) => event.preventDefault()}
                        title="Copy this link to open it in your browser"
                      >
                        {children}
                      </a>
                    ),
                  }}
                  rehypePlugins={[rehypeSanitize]}
                  remarkPlugins={[remarkGfm]}
                >
                  {draft.description}
                </ReactMarkdown>
              ) : (
                <p>No description yet.</p>
              )}
            </div>
          )}
        </section>
        <section className="drawer-section">
          <h2>Classification</h2>
          <div className="binary-controls">
            <label>
              <input
                checked={draft.isUrgent}
                onChange={(event) => save({ isUrgent: event.target.checked })}
                type="checkbox"
              />
              <span><Icon name="Flame" /> Urgent</span>
            </label>
            <label>
              <input
                checked={draft.isImportant}
                onChange={(event) =>
                  save({ isImportant: event.target.checked })
                }
                type="checkbox"
              />
              <span><Icon name="Flag" /> Important</span>
            </label>
            <label>
              <input
                checked={draft.milestone}
                onChange={(event) => save({ milestone: event.target.checked })}
                type="checkbox"
              />
              <span><Icon name="Milestone" /> Milestone</span>
            </label>
          </div>
        </section>
        <section className="drawer-section">
          <h2>Schedule</h2>
          <div className="schedule-fields">
            <label>
              Start
              <input
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    startDate: event.target.value || null,
                  }))
                }
                onBlur={() => save({ startDate: draft.startDate })}
                type="date"
                value={draft.startDate ?? ""}
              />
            </label>
            <label>
              Due
              <input
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dueDate: event.target.value || null,
                  }))
                }
                onBlur={() => save({ dueDate: draft.dueDate })}
                type="date"
                value={draft.dueDate ?? ""}
              />
            </label>
          </div>
          <p className="field-note">
            {duration ? `${duration} calendar days` : "Dates are optional"}
          </p>
          <label className="range-field">
            <span>Progress</span>
            <input
              aria-describedby={
                draft.checklist.length > 0
                  ? "subtask-progress-note"
                  : undefined
              }
              disabled={draft.checklist.length > 0}
              max={100}
              min={0}
              onChange={(event) =>
                save({ progress: Number(event.target.value) })
              }
              type="range"
              value={draft.progress}
            />
            <output>{draft.progress}%</output>
          </label>
          {draft.checklist.length > 0 ? (
            <p className="field-note" id="subtask-progress-note">
              Progress follows completed sub-tasks.
            </p>
          ) : null}
        </section>
        <section className="drawer-section">
          <h2>Assignment and labels</h2>
          <label className="select-field">
            <span>Assignee</span>
            <select
              onChange={(event) =>
                save({ assigneeId: event.target.value || null })
              }
              value={draft.assigneeId ?? ""}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <div className="drawer-labels">
            {labels.map((label) => (
              <label key={label.id}>
                <input
                  checked={draft.labelIds.includes(label.id)}
                  onChange={() => toggleLabel(label.id)}
                  type="checkbox"
                />
                <span style={{ backgroundColor: label.color }} />
                {label.name}
              </label>
            ))}
          </div>
        </section>
        <section className="drawer-section">
          <div className="drawer-section-heading">
            <h2>Sub-tasks</h2>
            {subtaskSummary.total > 0 ? (
              <span className="subtask-count">
                {subtaskSummary.completed} of {subtaskSummary.total} complete
              </span>
            ) : null}
          </div>
          <p className="field-note">
            Checkable steps; their completion controls this task's progress.
          </p>
          {subtaskSummary.total > 0 ? (
            <div
              aria-label={`${subtaskSummary.progress}% of sub-tasks complete`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={subtaskSummary.progress}
              className="subtask-progress"
              role="progressbar"
            >
              <span
                style={{
                  transform: `scaleX(${subtaskSummary.progress / 100})`,
                }}
              />
            </div>
          ) : null}
          <form
            className="subtask-add-row"
            onSubmit={(event) => {
              event.preventDefault();
              addChecklistItem();
            }}
          >
            <label className="sr-only" htmlFor="new-subtask">
              New sub-task description
            </label>
            <input
              id="new-subtask"
              onChange={(event) => setChecklistTitle(event.target.value)}
              placeholder="Describe a new sub-task"
              required
              value={checklistTitle}
            />
            <button aria-label="Add sub-task" type="submit">
              <Icon name="Plus" /> Add
            </button>
          </form>
          {draft.checklist.length > 0 ? (
            <DndContext
              accessibility={{
                announcements: SUBTASK_ANNOUNCEMENTS,
                screenReaderInstructions: {
                  draggable:
                    "Press Space to pick up a sub-task. Use arrow keys " +
                    "to move it, Space to drop, or Escape to cancel.",
                },
              }}
              collisionDetection={closestCenter}
              onDragCancel={clearSubtaskDrag}
              onDragEnd={handleSubtaskDragEnd}
              onDragStart={handleSubtaskDragStart}
              sensors={subtaskSensors}
            >
              <SortableContext
                items={draft.checklist.map((item) => subtaskDragId(item.id))}
                strategy={verticalListSortingStrategy}
              >
                <ol className="subtask-items" ref={subtaskLayoutRef}>
                  {draft.checklist.map((item) => (
                    <SortableSubtask
                      entering={enteringSubtaskId === item.id}
                      item={item}
                      key={item.id}
                      onRemove={removeSubtask}
                      onRename={(itemId, title) =>
                        workspaceStore.updateSubtask(task.id, itemId, {
                          title,
                        })
                      }
                      onToggle={(itemId, completed) =>
                        workspaceStore.updateSubtask(task.id, itemId, {
                          completed,
                        })
                      }
                      reducedMotion={reducedMotion}
                      removing={removingSubtasks.has(item.id)}
                      settled={settledSubtaskId === item.id}
                    />
                  ))}
                </ol>
              </SortableContext>
              <FloatingDragOverlay reducedMotion={reducedMotion}>
                {activeSubtaskId ? (
                  <div aria-hidden="true" className="subtask-drag-overlay">
                    <Icon name="GripVertical" size={14} />
                    <span>
                      {draft.checklist.find(
                        (item) => item.id === activeSubtaskId,
                      )?.title ?? "Sub-task"}
                    </span>
                  </div>
                ) : null}
              </FloatingDragOverlay>
            </DndContext>
          ) : (
            <p className="subtask-empty">
              Break this task into small, checkable steps.
            </p>
          )}
        </section>
        <details className="drawer-section advanced-section">
          <summary>Relationships</summary>
          <p className="field-note">
            Parent-linked tasks are full records in Timeline. Checklist steps
            above belong only to this task.
          </p>
          <label className="select-field">
            <span>Parent {terminology.taskSingular.toLowerCase()}</span>
            <select
              onChange={(event) =>
                save({ parentId: event.target.value || null })
              }
              value={draft.parentId ?? ""}
            >
              <option value="">No parent</option>
              {projectTasks
                .filter(
                  (candidate) =>
                    candidate.id !== task.id &&
                    !wouldCreateParentCycle(tasks, task.id, candidate.id),
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="dependency-add-row">
            <select
              aria-label={`Dependency ${terminology.taskSingular}`}
              onChange={(event) => setDependencyId(event.target.value)}
              value={dependencyId}
            >
              <option value="">Choose a prerequisite</option>
              {projectTasks
                .filter(
                  (candidate) =>
                    candidate.id !== task.id &&
                    !draft.dependencyIds.includes(candidate.id),
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
            </select>
            <button onClick={addDependency} type="button">
              Add
            </button>
          </div>
          <ul className="dependency-list">
            {draft.dependencyIds.map((id) => {
              const dependency = projectTasks.find(
                (candidate) => candidate.id === id,
              );
              return (
                <li key={id}>
                  <Icon name="Link2" />
                  <span>{dependency?.title ?? "Missing task"}</span>
                  <button
                    aria-label={`Remove dependency ${dependency?.title ?? id}`}
                    onClick={() =>
                      save({
                        dependencyIds: draft.dependencyIds.filter(
                          (candidate) => candidate !== id,
                        ),
                      })
                    }
                    type="button"
                  >
                    <Icon name="X" />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
        <details className="drawer-section advanced-section">
          <summary>Effort and notes</summary>
          <p className="field-note">Hours are entered manually.</p>
          <div className="effort-fields">
            <label>
              Estimated hours
              <input
                min={0}
                onChange={(event) =>
                  save({
                    estimatedHours: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                type="number"
                value={draft.estimatedHours ?? ""}
              />
            </label>
            <label>
              Actual hours
              <input
                min={0}
                onChange={(event) =>
                  save({
                    actualHours: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                type="number"
                value={draft.actualHours ?? ""}
              />
            </label>
          </div>
          <label className="notes-field">
            Notes
            <textarea
              onBlur={() => save({ notes: draft.notes })}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Record decisions and context..."
              rows={4}
              value={draft.notes}
            />
          </label>
          <p className="record-timestamps">
            <span>Created {formatTimestamp(task.createdAt)}</span>
            <span>Updated {formatTimestamp(task.updatedAt)}</span>
          </p>
        </details>
      </div>
      <footer className="drawer-footer">
        <label>
          <input
            checked={draft.completed}
            disabled={draft.checklist.length > 0}
            onChange={(event) =>
              save({
                completed: event.target.checked,
                progress: event.target.checked ? 100 : draft.progress,
              })
            }
            type="checkbox"
          />
          {draft.checklist.length > 0
            ? "Completion follows sub-tasks"
            : "Mark complete"}
        </label>
        <button
          className="danger-action"
          onClick={() => {
            if (
              window.confirm(
                `Archive this ${terminology.taskSingular.toLowerCase()}?`,
              )
            ) {
              save({ archived: true });
              workspaceStore.selectTask(null);
            }
          }}
          type="button"
        >
          <Icon name="Archive" /> Archive
        </button>
      </footer>
    </aside>
  );
}
