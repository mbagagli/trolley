import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState } from "react";

import { MOTION_DURATION } from "../config/motion";
import { deriveQuadrant } from "../domain/quadrant";
import { nextItemIdAfterMove } from "../domain/ordering";
import { sortTasks, type TaskSort } from "../domain/sorting";
import type {
  Label,
  PriorityLevel,
  QuadrantConfig,
  Task,
  TeamMember,
  Terminology,
  WorkflowColumn,
} from "../domain/types";
import { workspaceStore } from "../state/workspaceStore";
import { useFlipList } from "../hooks/useFlipList";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Icon } from "./Icon";
import { FloatingDragOverlay } from "./FloatingDragOverlay";
import { ListTaskRow, listTaskDragId } from "./ListTaskRow";
import { Presence } from "./Presence";

interface ListViewProps {
  tasks: Task[];
  columns: WorkflowColumn[];
  labels: Label[];
  members: TeamMember[];
  priorities: PriorityLevel[];
  quadrants: QuadrantConfig[];
  selectedTaskIds: ReadonlySet<string>;
  dateFormat: string;
  terminology: Terminology;
}

export function ListView({
  tasks,
  columns,
  labels,
  members,
  priorities,
  quadrants,
  selectedTaskIds,
  dateFormat,
  terminology,
}: ListViewProps) {
  const [sort, setSort] = useState<TaskSort>("manual");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [previewColumnId, setPreviewColumnId] = useState<string | null>(null);
  const [settledTaskId, setSettledTaskId] = useState<string | null>(null);
  const settledTimer = useRef(0);
  const reducedMotion = useReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const orderedTasks = useMemo(
    () => sortTasks(tasks, sort, columns),
    [columns, sort, tasks],
  );
  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const labelsByTaskId = useMemo(
    () =>
      new Map(
        tasks.map((task) => [
          task.id,
          labels.filter((label) => task.labelIds.includes(label.id)),
        ]),
      ),
    [labels, tasks],
  );
  const quadrantByTaskId = useMemo(
    () =>
      new Map(
        tasks.map((task) => [
          task.id,
          quadrants.find(
            (quadrant) =>
              quadrant.key ===
              deriveQuadrant(task.isUrgent, task.isImportant),
          ),
        ]),
      ),
    [quadrants, tasks],
  );
  const allSelected =
    orderedTasks.length > 0 &&
    orderedTasks.every((task) => selectedTaskIds.has(task.id));
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const previewColumn = columnById.get(
    previewColumnId ?? activeTask?.columnId ?? "",
  );
  const listLayoutRef = useFlipList<HTMLTableSectionElement>(
    orderedTasks.map((task) => `${task.id}:${task.columnId}`).join("|"),
    reducedMotion,
    activeTaskId !== null,
  );

  useEffect(
    () => () => window.clearTimeout(settledTimer.current),
    [],
  );
  const announcements: Announcements = {
    onDragStart({ active }) {
      return `${active.data.current?.taskTitle ?? "Task"} picked up.`;
    },
    onDragOver({ active, over }) {
      const title = active.data.current?.taskTitle ?? "Task";
      const target = over?.data.current?.taskTitle;
      const columnId = String(over?.data.current?.columnId ?? "");
      const columnName = columnById.get(columnId)?.name;
      return target && columnName
        ? `Move ${title} to ${columnName} before ${target}.`
        : undefined;
    },
    onDragEnd({ active, over }) {
      const title = active.data.current?.taskTitle ?? "Task";
      return over
        ? `${title} moved. The list now uses manual order.`
        : `${title} returned to its position.`;
    },
    onDragCancel({ active }) {
      const title = active.data.current?.taskTitle ?? "Task";
      return `Moving ${title} was cancelled.`;
    },
  };

  function handleDragStart(event: DragStartEvent): void {
    setActiveTaskId(String(event.active.data.current?.taskId ?? ""));
    setPreviewColumnId(
      String(event.active.data.current?.columnId ?? ""),
    );
  }

  function handleDragOver(event: DragOverEvent): void {
    setPreviewColumnId(
      String(event.over?.data.current?.columnId ?? ""),
    );
  }

  function clearDragState(): void {
    setActiveTaskId(null);
    setPreviewColumnId(null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    clearDragState();
    const activeTaskId = String(event.active.data.current?.taskId ?? "");
    const overTaskId = String(event.over?.data.current?.taskId ?? "");
    if (!activeTaskId || !overTaskId || activeTaskId === overTaskId) {
      return;
    }
    const activeTask = tasks.find((task) => task.id === activeTaskId);
    const overTask = tasks.find((task) => task.id === overTaskId);
    if (!activeTask || !overTask) {
      return;
    }
    const beforeTaskId = activeTask.columnId === overTask.columnId
      ? nextItemIdAfterMove(
          orderedTasks.filter(
            (task) => task.columnId === overTask.columnId,
          ),
          activeTask.id,
          overTask.id,
        )
      : overTask.id;
    workspaceStore.moveTask(
      activeTask.id,
      overTask.columnId,
      beforeTaskId,
    );
    setSort("manual");
    if (!reducedMotion) {
      window.clearTimeout(settledTimer.current);
      setSettledTaskId(activeTask.id);
      settledTimer.current = window.setTimeout(
        () => setSettledTaskId(null),
        MOTION_DURATION.settle,
      );
    }
  }

  return (
    <DndContext
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Press Space to pick up a task row. Use arrow keys to move, " +
            "Space to drop, or Escape to cancel.",
        },
      }}
      collisionDetection={closestCenter}
      onDragCancel={clearDragState}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="list-view">
        <div className="list-controls">
          <p>
            {tasks.length}{" "}
            {tasks.length === 1
              ? terminology.taskSingular.toLowerCase()
              : terminology.taskPlural.toLowerCase()}
          </p>
          <div className="list-sort-control">
            <label>
              Sort by
              <select
                onChange={(event) => setSort(event.target.value as TaskSort)}
                value={sort}
              >
                <option value="manual">Manual position</option>
                <option value="priority">Priority</option>
                <option value="due-date">Due date</option>
                <option value="title">Title</option>
              </select>
            </label>
            {sort !== "manual" ? (
              <small>Dragging switches to manual position.</small>
            ) : null}
          </div>
        </div>
        <p className="list-scroll-cue">
          Scroll horizontally to see Dates and Progress.
        </p>
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th className="drag-cell">
                  <span className="sr-only">Move</span>
                </th>
                <th className="selection-cell">
                  <input
                    aria-label={
                      `Select all visible ` +
                      terminology.taskPlural.toLowerCase()
                    }
                    checked={allSelected}
                    onChange={() => {
                      for (const task of orderedTasks) {
                        if (allSelected === selectedTaskIds.has(task.id)) {
                          workspaceStore.toggleTaskSelection(task.id);
                        }
                      }
                    }}
                    type="checkbox"
                  />
                </th>
                <th>{terminology.taskSingular}</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Quadrant</th>
                <th>Assignee</th>
                <th>Dates</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody ref={listLayoutRef}>
              {orderedTasks.length === 0 ? (
                <tr className="table-empty-row">
                  <td colSpan={9}>
                    <Icon name="ScanSearch" />
                    No {terminology.taskPlural.toLowerCase()} match this view.
                  </td>
                </tr>
              ) : null}
              <SortableContext
                items={orderedTasks.map((task) => listTaskDragId(task.id))}
                strategy={verticalListSortingStrategy}
              >
                {orderedTasks.map((task) => (
                  <ListTaskRow
                    column={columnById.get(task.columnId)}
                    dateFormat={dateFormat}
                    key={task.id}
                    labels={labelsByTaskId.get(task.id) ?? []}
                    member={
                      task.assigneeId
                        ? memberById.get(task.assigneeId)
                        : undefined
                    }
                    priorities={priorities}
                    quadrant={quadrantByTaskId.get(task.id)}
                    reducedMotion={reducedMotion}
                    selected={selectedTaskIds.has(task.id)}
                    settled={settledTaskId === task.id}
                    task={task}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </div>
        <Presence
          className="bulk-action-presence"
          value={selectedTaskIds.size > 0 ? selectedTaskIds.size : null}
        >
          {(selectedCount) => (
            <div className="bulk-action-rail" role="toolbar">
              <strong>{selectedCount} selected</strong>
              <button
                onClick={() =>
                  workspaceStore.bulkUpdate({
                    completed: true,
                    progress: 100,
                  })
                }
                type="button"
              >
                <Icon name="BadgeCheck" /> Complete
              </button>
              <label>
                <span className="sr-only">
                  Set status for selected{" "}
                  {terminology.taskPlural.toLowerCase()}
                </span>
                <select
                  defaultValue=""
                  onChange={(event) =>
                    workspaceStore.bulkMoveTasks(event.target.value)
                  }
                >
                  <option disabled value="">Set status</option>
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">
                  Set priority for selected{" "}
                  {terminology.taskPlural.toLowerCase()}
                </span>
                <select
                  defaultValue=""
                  onChange={(event) =>
                    workspaceStore.bulkUpdate({
                      priority: Number(event.target.value) as Task["priority"],
                    })
                  }
                >
                  <option disabled value="">Set priority</option>
                  {priorities.map((priority) => (
                    <option key={priority.rank} value={priority.rank}>
                      {priority.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Archive the selected ` +
                        `${terminology.taskPlural.toLowerCase()}?`,
                    )
                  ) {
                    workspaceStore.bulkUpdate({ archived: true });
                  }
                }}
                type="button"
              >
                <Icon name="Archive" /> Archive
              </button>
              <button
                onClick={() => workspaceStore.clearTaskSelection()}
                type="button"
              >
                <Icon name="X" /> Clear
              </button>
            </div>
          )}
        </Presence>
      </div>
      <FloatingDragOverlay reducedMotion={reducedMotion}>
        {activeTask ? (
          <div aria-hidden="true" className="list-task-drag-overlay">
            <Icon name="GripVertical" size={16} />
            <span>
              <strong>{activeTask.title}</strong>
              <small className="drag-destination" key={previewColumn?.id}>
                Move to {previewColumn?.name ?? "current status"}
              </small>
            </span>
            <b>{activeTask.progress}%</b>
          </div>
        ) : null}
      </FloatingDragOverlay>
    </DndContext>
  );
}
