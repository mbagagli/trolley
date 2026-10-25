import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
} from "react";

import type {
  CardField,
  Label,
  PriorityLevel,
  Task,
  TeamMember,
} from "../domain/types";
import { summarizeSubtasks } from "../domain/subtasks";
import { formatShortDate, todayIso } from "../utils/date";
import { Icon } from "./Icon";
import { PriorityBadge } from "./PriorityBadge";

interface TaskCardProps {
  task: Task;
  labels: Label[];
  member: TeamMember | null;
  priorities: PriorityLevel[];
  cardFields: CardField[];
  dateFormat: string;
  selected?: boolean;
  dragging?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onOpen: () => void;
  onPriorityChange: (priority: Task["priority"]) => void;
}

export const TaskCard = memo(function TaskCard({
  task,
  labels,
  member,
  priorities,
  cardFields,
  dateFormat,
  selected = false,
  dragging = false,
  dragHandleProps,
  onOpen,
  onPriorityChange,
}: TaskCardProps) {
  const suppressPointerClick = useRef(false);
  useEffect(() => {
    // Remember the gesture after Escape clears the draggable state.
    if (dragging) {
      suppressPointerClick.current = true;
    }
  }, [dragging]);
  const subtaskSummary = summarizeSubtasks(task.checklist);
  const dueLate = Boolean(
    task.dueDate && task.dueDate < todayIso() && !task.completed,
  );

  return (
    <article
      className={`task-ticket${selected ? " selected" : ""}`}
      onClick={onOpen}
      onClickCapture={(event) => {
        if (suppressPointerClick.current && event.detail > 0) {
          suppressPointerClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerDownCapture={() => {
        suppressPointerClick.current = false;
      }}
    >
      <div className="ticket-notches" aria-hidden="true" />
      <div className="task-ticket-topline">
        {cardFields.includes("priority") ? (
          <PriorityBadge
            compact
            levels={priorities}
            onChange={onPriorityChange}
            value={task.priority}
          />
        ) : (
          <span />
        )}
        {dragHandleProps ? (
          <button
            aria-label={`Move ${task.title}`}
            className="drag-handle"
            data-drag-handle="true"
            onClick={(event) => event.stopPropagation()}
            type="button"
            {...dragHandleProps}
          >
            <Icon name="GripVertical" size={15} />
          </button>
        ) : null}
      </div>
      <h3>
        <button
          className="task-ticket-open"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          type="button"
        >
          {task.title}
        </button>
      </h3>
      {cardFields.includes("labels") && labels.length > 0 ? (
        <ul className="label-row" aria-label="Labels">
          {labels.slice(0, 3).map((label) => (
            <li
              key={label.id}
              style={{ "--label-color": label.color } as CSSProperties}
            >
              {label.icon ? (
                <Icon name={label.icon} size={11} />
              ) : (
                <span aria-hidden="true" />
              )}
              {label.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="task-metadata">
        {cardFields.includes("dates") && task.dueDate ? (
          <span className={dueLate ? "is-late" : ""}>
            <Icon name={dueLate ? "Clock3" : "CalendarDays"} size={13} />
            {formatShortDate(task.dueDate, dateFormat)}
          </span>
        ) : null}
        {cardFields.includes("progress") && task.progress > 0 ? (
          <span>
            <Icon name="BarChart3" size={13} />
            {task.progress}%
          </span>
        ) : null}
        {cardFields.includes("checklist") && task.checklist.length > 0 ? (
          <span title="Sub-tasks completed">
            <Icon name="CheckSquare2" size={13} />
            {subtaskSummary.completed}/{subtaskSummary.total} sub-tasks
          </span>
        ) : null}
        {cardFields.includes("dependencies") &&
        task.dependencyIds.length > 0 ? (
          <span title={`${task.dependencyIds.length} dependencies`}>
            <Icon name="Link2" size={13} />
            {task.dependencyIds.length}
          </span>
        ) : null}
        {cardFields.includes("milestone") && task.milestone ? (
          <span title="Milestone">
            <Icon name="Milestone" size={13} />
            Milestone
          </span>
        ) : null}
        {cardFields.includes("assignee") && member ? (
          <span
            className="member-chip"
            style={{ "--member-color": member.color } as CSSProperties}
            title={member.name}
          >
            {member.initials}
          </span>
        ) : null}
      </div>
      {cardFields.includes("progress") && task.progress > 0 ? (
        <div
          aria-label={`${task.progress}% complete`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={task.progress}
          className="ticket-progress"
          role="progressbar"
        >
          <span style={{ transform: `scaleX(${task.progress / 100})` }} />
        </div>
      ) : null}
    </article>
  );
});
