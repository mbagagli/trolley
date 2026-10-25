import {
  DndContext,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { TASK_SETTLE_WINDOW_MS } from "../config/motion";
import { deriveQuadrant } from "../domain/quadrant";
import type {
  CardField,
  Label,
  PriorityLevel,
  QuadrantKey,
  QuadrantConfig,
  Task,
  TeamMember,
  Terminology,
} from "../domain/types";
import { workspaceStore } from "../state/workspaceStore";
import { useFlipList } from "../hooks/useFlipList";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Icon } from "./Icon";
import { FloatingDragOverlay } from "./FloatingDragOverlay";
import { TaskCard } from "./TaskCard";
import { TaskPointerSensor } from "./TaskPointerSensor";

interface MatrixViewProps {
  tasks: Task[];
  labels: Label[];
  members: TeamMember[];
  priorities: PriorityLevel[];
  quadrants: QuadrantConfig[];
  cardFields: CardField[];
  dateFormat: string;
  terminology: Terminology;
}

const MATRIX_ORDER: QuadrantKey[] = [
  "do-first", "delegate", "schedule", "eliminate",
];

const MATRIX_INSTRUCTIONS = {
  draggable:
    "Press Space to pick up a task. Use arrow keys to move it, " +
    "Space to drop it, or Escape to cancel.",
};

const MATRIX_ANNOUNCEMENTS: Announcements = {
  onDragStart({ active }) {
    const title = active.data.current?.taskTitle ?? "Task";
    return `${title} picked up. Use arrow keys to choose a quadrant.`;
  },
  onDragOver({ active, over }) {
    const title = active.data.current?.taskTitle ?? "Task";
    const quadrant = over?.data.current?.quadrantName;
    return quadrant ? `${title} is over ${quadrant}.` : undefined;
  },
  onDragEnd({ active, over }) {
    const title = active.data.current?.taskTitle ?? "Task";
    const quadrant = over?.data.current?.quadrantName;
    return quadrant
      ? `${title} moved to ${quadrant}.`
      : `${title} returned to its original quadrant.`;
  },
  onDragCancel({ active }) {
    const title = active.data.current?.taskTitle ?? "Task";
    return `Moving ${title} was cancelled.`;
  },
};

function MatrixTask({
  task,
  labels,
  members,
  priorities,
  cardFields,
  dateFormat,
  settled,
}: Omit<MatrixViewProps, "tasks" | "quadrants" | "terminology"> & {
  settled: boolean;
  task: Task;
}) {
  const draggable = useDraggable({
    id: `matrix-task:${task.id}`,
    data: { taskId: task.id, taskTitle: task.title },
  });
  const style: CSSProperties = {
    transform: draggable.isDragging
      ? undefined
      : CSS.Translate.toString(draggable.transform),
    opacity: draggable.isDragging ? 0.32 : 1,
  };
  return (
    <div
      className={
        `matrix-task${draggable.isDragging ? " is-dragging" : ""}` +
        `${settled ? " is-settled" : ""}`
      }
      data-motion-key={`task:${task.id}`}
      onPointerDown={(event) => draggable.listeners?.onPointerDown?.(event)}
      ref={draggable.setNodeRef}
      style={style}
    >
      <TaskCard
        cardFields={cardFields}
        dateFormat={dateFormat}
        dragging={draggable.isDragging}
        dragHandleProps={{
          ...draggable.attributes,
          ...draggable.listeners,
        }}
        labels={labels.filter((label) => task.labelIds.includes(label.id))}
        member={members.find((member) => member.id === task.assigneeId) ?? null}
        onOpen={() => workspaceStore.selectTask(task.id)}
        onPriorityChange={(priority) =>
          workspaceStore.setTaskPriority(task.id, priority)
        }
        priorities={priorities}
        task={task}
      />
    </div>
  );
}

function Quadrant({
  quadrant,
  tasks,
  labels,
  members,
  priorities,
  cardFields,
  dateFormat,
  settledTaskId,
  terminology,
}: Omit<MatrixViewProps, "quadrants"> & {
  quadrant: QuadrantConfig;
  settledTaskId: string | null;
}) {
  const droppable = useDroppable({
    id: `quadrant:${quadrant.key}`,
    data: { quadrant: quadrant.key, quadrantName: quadrant.name },
  });
  const totalHours = tasks.reduce(
    (total, task) => total + (task.estimatedHours ?? 0),
    0,
  );
  return (
    <section
      className={`matrix-quadrant${droppable.isOver ? " is-over" : ""}`}
      ref={droppable.setNodeRef}
      style={{ "--quadrant-color": quadrant.color } as CSSProperties}
    >
      <header>
        <span className="quadrant-icon"><Icon name={quadrant.icon} /></span>
        <div>
          <h2>{quadrant.name}</h2>
          <p>{quadrant.description}</p>
          <span className="quadrant-classification">
            {quadrant.key === "do-first" || quadrant.key === "delegate"
              ? "Urgent" : "Not urgent"}
            {" / "}
            {quadrant.key === "do-first" || quadrant.key === "schedule"
              ? "Important" : "Not important"}
          </span>
        </div>
        <div className="quadrant-summary">
          <strong>{tasks.length}</strong>
          <span>{totalHours > 0 ? `${totalHours}h` : "Unestimated"}</span>
        </div>
      </header>
      <div className="matrix-task-grid">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <MatrixTask
              key={task.id}
              labels={labels}
              members={members}
              priorities={priorities}
              cardFields={cardFields}
              dateFormat={dateFormat}
              settled={settledTaskId === task.id}
              task={task}
            />
          ))
        ) : (
          <div className="matrix-empty">
            <Icon name="GripVertical" />
            Drop {terminology.taskPlural.toLowerCase()} here
          </div>
        )}
      </div>
    </section>
  );
}

export function MatrixView(props: MatrixViewProps) {
  const reducedMotion = useReducedMotion();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [settledTaskId, setSettledTaskId] = useState<string | null>(null);
  const settledTimer = useRef(0);
  const sensors = useSensors(
    useSensor(TaskPointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  );
  const activeTask = props.tasks.find((task) => task.id === activeTaskId);
  const matrixLayoutRef = useFlipList<HTMLDivElement>(
    props.tasks
      .map((task) =>
        `${task.id}:${deriveQuadrant(task.isUrgent, task.isImportant)}`
      )
      .join("|"),
    reducedMotion,
    activeTaskId !== null,
  );

  useEffect(
    () => () => window.clearTimeout(settledTimer.current),
    [],
  );

  function handleDragStart(event: DragStartEvent): void {
    setActiveTaskId(String(event.active.data.current?.taskId ?? ""));
  }

  function clearDragState(): void {
    setActiveTaskId(null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const taskId = event.active.data.current?.taskId;
    const quadrant = event.over?.data.current?.quadrant;
    clearDragState();
    if (taskId && quadrant) {
      workspaceStore.setTaskQuadrant(String(taskId), quadrant as QuadrantKey);
      window.clearTimeout(settledTimer.current);
      setSettledTaskId(String(taskId));
      settledTimer.current = window.setTimeout(
        () => setSettledTaskId(null),
        reducedMotion ? 100 : TASK_SETTLE_WINDOW_MS,
      );
    }
  }

  return (
    <DndContext
      accessibility={{
        announcements: MATRIX_ANNOUNCEMENTS,
        screenReaderInstructions: MATRIX_INSTRUCTIONS,
      }}
      onDragCancel={clearDragState}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="matrix-header-axis" aria-hidden="true">
        <span>Important</span>
        <span>Not important</span>
      </div>
      <div className="matrix-shell" ref={matrixLayoutRef}>
        {[...props.quadrants].sort((left, right) =>
          MATRIX_ORDER.indexOf(left.key) - MATRIX_ORDER.indexOf(right.key)
        ).map((quadrant, index) => {
          const tasks = props.tasks.filter(
            (task) =>
              deriveQuadrant(task.isUrgent, task.isImportant) === quadrant.key,
          );
          return (
            <Fragment key={quadrant.key}>
              {index % 2 === 0 ? (
                <div className="matrix-row-axis">
                  {index === 0 ? "Urgent" : "Not urgent"}
                </div>
              ) : null}
              <Quadrant
                {...props}
                  quadrant={quadrant}
                settledTaskId={settledTaskId}
                tasks={tasks}
              />
            </Fragment>
          );
        })}
      </div>
      <FloatingDragOverlay reducedMotion={reducedMotion}>
        {activeTask ? (
          <div
            aria-hidden="true"
            className="matrix-task-drag-overlay"
            inert
          >
            <TaskCard
              cardFields={props.cardFields}
              dateFormat={props.dateFormat}
              dragHandleProps={{ tabIndex: -1 }}
              labels={props.labels.filter((label) =>
                activeTask.labelIds.includes(label.id),
              )}
              member={
                props.members.find(
                  (member) => member.id === activeTask.assigneeId,
                ) ?? null
              }
              onOpen={() => undefined}
              onPriorityChange={() => undefined}
              priorities={props.priorities}
              task={activeTask}
            />
          </div>
        ) : null}
      </FloatingDragOverlay>
    </DndContext>
  );
}
