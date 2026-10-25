import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, type CSSProperties } from "react";

import { sortableTransition } from "../config/motion";
import { summarizeSubtasks } from "../domain/subtasks";
import type {
  Label,
  PriorityLevel,
  QuadrantConfig,
  Task,
  TeamMember,
  WorkflowColumn,
} from "../domain/types";
import { workspaceStore } from "../state/workspaceStore";
import { formatShortDate } from "../utils/date";
import { Icon } from "./Icon";
import { PriorityBadge } from "./PriorityBadge";

interface ListTaskRowProps {
  column: WorkflowColumn | undefined;
  dateFormat: string;
  labels: Label[];
  member: TeamMember | undefined;
  priorities: PriorityLevel[];
  quadrant: QuadrantConfig | undefined;
  selected: boolean;
  settled: boolean;
  task: Task;
  reducedMotion: boolean;
}

export function listTaskDragId(taskId: string): string {
  return `list-task:${taskId}`;
}

export const ListTaskRow = memo(function ListTaskRow({
  column,
  dateFormat,
  labels,
  member,
  priorities,
  quadrant,
  reducedMotion,
  selected,
  settled,
  task,
}: ListTaskRowProps) {
  const sortable = useSortable({
    id: listTaskDragId(task.id),
    data: {
      columnId: task.columnId,
      taskId: task.id,
      taskTitle: task.title,
      type: "list-task",
    },
    transition: sortableTransition(reducedMotion),
  });
  const subtaskSummary = summarizeSubtasks(task.checklist);
  const style: CSSProperties = {
    opacity: sortable.isDragging ? 0.3 : 1,
    transform: sortable.isDragging
      ? undefined
      : CSS.Transform.toString(sortable.transform),
    transition: sortable.isDragging ? undefined : sortable.transition,
  };
  const classNames = [
    selected ? "is-selected" : "",
    settled ? "is-settled" : "",
    sortable.isDragging ? "is-dragging" : "",
    sortable.isOver && !sortable.isDragging ? "is-drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr
      className={classNames}
      data-motion-key={`task:${task.id}`}
      onDoubleClick={() => workspaceStore.selectTask(task.id)}
      ref={sortable.setNodeRef}
      style={style}
    >
      <td className="drag-cell">
        <button
          aria-label={`Move ${task.title}`}
          className="list-drag-handle"
          ref={sortable.setActivatorNodeRef}
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <Icon name="GripVertical" size={14} />
        </button>
      </td>
      <td className="selection-cell">
        <input
          aria-label={`Select ${task.title}`}
          checked={selected}
          onChange={() => workspaceStore.toggleTaskSelection(task.id)}
          type="checkbox"
        />
      </td>
      <td>
        <button
          className="list-task-title"
          onClick={() => workspaceStore.selectTask(task.id)}
          type="button"
        >
          {task.milestone ? <Icon name="Milestone" /> : null}
          <span>
            <strong>{task.title}</strong>
            <small>
              {labels.map((label) => (
                <i
                  key={label.id}
                  style={{ "--label-color": label.color } as CSSProperties}
                >
                  {label.icon ? (
                    <Icon name={label.icon} size={10} />
                  ) : null}
                  {label.name}
                </i>
              ))}
            </small>
          </span>
        </button>
      </td>
      <td>
        <span
          className="status-chip"
          style={{ "--status-color": column?.color } as CSSProperties}
        >
          <Icon name={column?.icon ?? "CircleDot"} />
          {column?.name ?? "Unknown"}
        </span>
      </td>
      <td>
        <PriorityBadge
          compact
          levels={priorities}
          onChange={(priority) =>
            workspaceStore.setTaskPriority(task.id, priority)
          }
          value={task.priority}
        />
      </td>
      <td>
        <span className="quadrant-list-label">
          <Icon name={quadrant?.icon ?? "Circle"} />
          {quadrant?.name ?? "Unknown"}
        </span>
      </td>
      <td>{member?.name ?? "Unassigned"}</td>
      <td className="date-cell">
        {formatShortDate(task.startDate, dateFormat)}
        <span>to</span>
        {formatShortDate(task.dueDate, dateFormat)}
      </td>
      <td>
        <div className="list-progress-cell">
          <span className="table-progress" aria-hidden="true">
            <span
              style={{ transform: `scaleX(${task.progress / 100})` }}
            />
          </span>
          <strong>{task.progress}%</strong>
          {subtaskSummary.total > 0 ? (
            <small>
              {subtaskSummary.completed}/{subtaskSummary.total} sub-tasks
            </small>
          ) : null}
        </div>
      </td>
    </tr>
  );
});
