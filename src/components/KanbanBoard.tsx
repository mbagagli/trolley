import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
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

import {
  TASK_SETTLE_WINDOW_MS,
  sortableTransition,
} from "../config/motion";
import { nextItemIdAfterMove } from "../domain/ordering";
import {
  createTaskOrder,
  findTaskPlacement,
  moveTaskInOrder,
  type TaskOrder,
} from "../domain/taskDrag";
import type {
  CardField,
  Label,
  PriorityLevel,
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
import { TaskCard } from "./TaskCard";
import { TaskPointerSensor } from "./TaskPointerSensor";

interface KanbanBoardProps {
  projectId: string;
  columns: WorkflowColumn[];
  tasks: Task[];
  labels: Label[];
  members: TeamMember[];
  priorities: PriorityLevel[];
  cardFields: CardField[];
  dateFormat: string;
  terminology: Terminology;
}

interface ColumnLaneProps extends KanbanBoardProps {
  column: WorkflowColumn;
  reducedMotion: boolean;
  settledTaskId: string | null;
  targetColumnId: string | null;
}

interface ActiveDrag {
  id: string;
  type: "column" | "task";
}

interface TaskDragSession {
  previewOrder: TaskOrder;
  sourceColumnId: string;
  taskId: string;
}

const boardCollisionDetection: CollisionDetection = (args) => {
  const columns = args.droppableContainers.filter(
    (container) => container.data.current?.type === "column",
  );
  if (String(args.active.id).startsWith("column:")) {
    return closestCorners({ ...args, droppableContainers: columns });
  }
  if (!args.pointerCoordinates) {
    return closestCorners(args);
  }
  const columnHits = pointerWithin({
    ...args,
    droppableContainers: columns,
  });
  const columnId = columnHits[0]?.id;
  if (!columnId) {
    return [];
  }
  const column = columns.find((candidate) => candidate.id === columnId);
  const tasks = args.droppableContainers.filter((container) =>
    container.data.current?.type === "task" &&
    container.data.current.columnId === column?.data.current?.columnId,
  );
  const taskHits = pointerWithin({ ...args, droppableContainers: tasks });
  return taskHits.length > 0 ? taskHits : columnHits;
};

function taskDragId(taskId: string): string {
  return `task:${taskId}`;
}

function columnDragId(columnId: string): string {
  return `column:${columnId}`;
}

function tasksForPreview(tasks: Task[], order: TaskOrder | null): Task[] {
  if (!order) {
    return tasks;
  }
  const placement = new Map<string, { columnId: string; index: number }>();
  for (const [columnId, taskIds] of Object.entries(order)) {
    taskIds.forEach((taskId, index) => {
      placement.set(taskId, { columnId, index });
    });
  }
  return tasks.map((task) => {
    const preview = placement.get(task.id);
    return preview
      ? {
          ...task,
          columnId: preview.columnId,
          sortPosition: preview.index,
        }
      : task;
  });
}

function SortableTask({
  task,
  labels,
  members,
  priorities,
  cardFields,
  dateFormat,
  entering,
  reducedMotion,
  settled,
}: {
  task: Task;
  labels: Label[];
  members: TeamMember[];
  priorities: PriorityLevel[];
  cardFields: CardField[];
  dateFormat: string;
  entering: boolean;
  reducedMotion: boolean;
  settled: boolean;
}) {
  const sortable = useSortable({
    id: taskDragId(task.id),
    data: { type: "task", taskId: task.id, columnId: task.columnId },
    transition: sortableTransition(reducedMotion),
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.3 : 1,
  };
  return (
    <div
      className={
        `sortable-task${sortable.isDragging ? " is-dragging" : ""}` +
        `${settled ? " is-settled" : ""}` +
        `${entering ? " is-entering" : ""}`
      }
      data-motion-key={`task:${task.id}`}
      onPointerDown={(event) => sortable.listeners?.onPointerDown?.(event)}
      ref={sortable.setNodeRef}
      style={style}
    >
      <TaskCard
        cardFields={cardFields}
        dateFormat={dateFormat}
        dragging={sortable.isDragging}
        dragHandleProps={{
          ...sortable.attributes,
          ...sortable.listeners,
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

function ColumnLane({
  column,
  tasks,
  labels,
  members,
  priorities,
  cardFields,
  dateFormat,
  reducedMotion,
  settledTaskId,
  targetColumnId,
  terminology,
}: ColumnLaneProps) {
  const [title, setTitle] = useState("");
  const [enteringTaskId, setEnteringTaskId] = useState<string | null>(null);
  const entryTimer = useRef(0);
  const sortable = useSortable({
    id: columnDragId(column.id),
    data: { type: "column", columnId: column.id },
    transition: sortableTransition(reducedMotion),
  });
  const columnTasks = tasks
    .filter((task) => task.columnId === column.id)
    .sort((left, right) => left.sortPosition - right.sortPosition);
  const overLimit = column.limit !== null && columnTasks.length > column.limit;

  useEffect(
    () => () => window.clearTimeout(entryTimer.current),
    [],
  );
  const style = {
    "--column-color": column.color,
    transform: CSS.Transform.toString(sortable.transform),
    transition: [
      sortable.transition,
      "width var(--duration-layout) var(--ease-out)",
      "flex-basis var(--duration-layout) var(--ease-out)",
      "opacity var(--duration-fast) var(--ease-out)",
      "border-color var(--duration-fast) var(--ease-out)",
      "background var(--duration-fast) var(--ease-out)",
    ]
      .filter(Boolean)
      .join(", "),
    opacity: sortable.isDragging ? 0.55 : 1,
  } as CSSProperties;
  if (column.collapsed) {
    return (
      <section
        className={
          `kanban-column collapsed` +
          `${sortable.isDragging ? " is-dragging" : ""}` +
          `${targetColumnId === column.id ? " is-task-target" : ""}`
        }
        ref={sortable.setNodeRef}
        style={style}
      >
        <button
          aria-label={`Move ${column.name} column`}
          className="column-drag-handle collapsed-drag-handle"
          data-drag-handle="true"
          ref={sortable.setActivatorNodeRef}
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <Icon name="GripVertical" />
        </button>
        <button
          aria-label={`Expand ${column.name}`}
          className="column-expand"
          onClick={() => workspaceStore.toggleColumn(column.id)}
          type="button"
        >
          <Icon name={column.icon} />
          <span>{column.name}</span>
          <small>{columnTasks.length}</small>
        </button>
      </section>
    );
  }
  return (
    <section
      aria-label={`${column.name} column`}
      className={
        `kanban-column${overLimit ? " over-limit" : ""}` +
        `${sortable.isDragging ? " is-dragging" : ""}` +
        `${targetColumnId === column.id ? " is-task-target" : ""}`
      }
      ref={sortable.setNodeRef}
      style={style}
    >
      <header className="column-header">
        <button
          aria-label={`Move ${column.name} column`}
          className="column-drag-handle"
          data-drag-handle="true"
          ref={sortable.setActivatorNodeRef}
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <Icon name="GripVertical" />
        </button>
        <span className="column-icon"><Icon name={column.icon} /></span>
        <div>
          <h2>{column.name}</h2>
          <p>
            {columnTasks.length}
            {column.limit === null
              ? ` ${terminology.taskPlural.toLowerCase()}`
              : ` / ${column.limit}`}
          </p>
        </div>
        <button
          aria-label={`Collapse ${column.name}`}
          className="icon-button"
          onClick={() => workspaceStore.toggleColumn(column.id)}
          type="button"
        >
          <Icon name="PanelLeftClose" />
        </button>
      </header>
      {overLimit ? (
        <p className="limit-warning" role="status">
          <Icon name="Siren" /> Column limit exceeded
        </p>
      ) : null}
      <div className="column-ticket-stack">
        <SortableContext
          items={columnTasks.map((task) => taskDragId(task.id))}
          strategy={verticalListSortingStrategy}
        >
          {columnTasks.length > 0 ? (
            columnTasks.map((task) => (
              <SortableTask
                key={task.id}
                labels={labels}
                members={members}
                priorities={priorities}
                cardFields={cardFields}
                dateFormat={dateFormat}
                entering={enteringTaskId === task.id}
                reducedMotion={reducedMotion}
                settled={settledTaskId === task.id}
                task={task}
              />
            ))
          ) : (
            <div className="column-empty">
              <Icon name="ClipboardCheck" />
              <span>No {terminology.taskPlural.toLowerCase()} here</span>
            </div>
          )}
        </SortableContext>
      </div>
      <form
        className="quick-add-task"
        onSubmit={(event) => {
          event.preventDefault();
          const id = workspaceStore.createTask(column.id, title);
          if (id) {
            setTitle("");
            if (!reducedMotion) {
              window.clearTimeout(entryTimer.current);
              setEnteringTaskId(id);
              entryTimer.current = window.setTimeout(
                () => setEnteringTaskId(null),
                180,
              );
            }
          }
        }}
      >
        <label className="sr-only" htmlFor={`quick-task-${column.id}`}>
          Add a {terminology.taskSingular.toLowerCase()} to {column.name}
        </label>
        <input
          id={`quick-task-${column.id}`}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={`Add a ${terminology.taskSingular.toLowerCase()}`}
          value={title}
        />
        <button
          aria-label={`Add ${terminology.taskSingular.toLowerCase()}`}
          type="submit"
        >
          <Icon name="Plus" />
        </button>
      </form>
      <span className="column-foot" aria-hidden="true" />
    </section>
  );
}

export function KanbanBoard(props: KanbanBoardProps) {
  const reducedMotion = useReducedMotion();
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [previewOrder, setPreviewOrder] = useState<TaskOrder | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);
  const [settledTaskId, setSettledTaskId] = useState<string | null>(null);
  const settledTimer = useRef(0);
  const taskDragSession = useRef<TaskDragSession | null>(null);
  const sensors = useSensors(
    useSensor(TaskPointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const orderedColumns = [...props.columns].sort(
    (left, right) => left.sortPosition - right.sortPosition,
  );
  const renderedTasks = useMemo(
    () => tasksForPreview(props.tasks, previewOrder),
    [previewOrder, props.tasks],
  );
  const activeTask = activeDrag?.type === "task"
    ? props.tasks.find((task) => task.id === activeDrag.id)
    : undefined;
  const boardLayoutRef = useFlipList<HTMLDivElement>(
    renderedTasks
      .map((task) => `${task.id}:${task.columnId}:${task.sortPosition}`)
      .join("|"),
    reducedMotion,
    activeDrag !== null,
  );

  useEffect(
    () => () => window.clearTimeout(settledTimer.current),
    [],
  );
  const announcements: Announcements = {
    onDragStart({ active }) {
      const data = active.data.current;
      if (data?.type === "column") {
        const column = props.columns.find(
          (candidate) => candidate.id === data.columnId,
        );
        return `${column?.name ?? "Column"} picked up.`;
      }
      const task = props.tasks.find(
        (candidate) => candidate.id === data?.taskId,
      );
      return `${task?.title ?? props.terminology.taskSingular} picked up.`;
    },
    onDragOver({ active, over }) {
      if (!over) {
        return undefined;
      }
      const activeData = active.data.current;
      const overData = over.data.current;
      const task = props.tasks.find(
        (candidate) => candidate.id === activeData?.taskId,
      );
      const columnId = overData?.type === "task"
        ? overData.columnId
        : overData?.columnId;
      const column = props.columns.find(
        (candidate) => candidate.id === columnId,
      );
      return task && column
        ? `${task.title} is over ${column.name}.`
        : undefined;
    },
    onDragEnd({ active, over }) {
      const activeData = active.data.current;
      const name = activeData?.type === "column"
        ? props.columns.find(
            (candidate) => candidate.id === activeData.columnId,
          )?.name ?? "Column"
        : props.tasks.find(
            (candidate) => candidate.id === activeData?.taskId,
          )?.title ?? props.terminology.taskSingular;
      return over
        ? `${name} moved.`
        : `${name} returned to its original position.`;
    },
    onDragCancel({ active }) {
      const data = active.data.current;
      const name = data?.type === "column"
        ? "column"
        : props.terminology.taskSingular.toLowerCase();
      return `Moving the ${name} was cancelled.`;
    },
  };

  function clearDragState(): void {
    taskDragSession.current = null;
    setActiveDrag(null);
    setPreviewOrder(null);
    setTargetColumnId(null);
  }

  function handleDragStart(event: DragStartEvent): void {
    const data = event.active.data.current;
    if (data?.type === "task") {
      const taskId = String(data.taskId);
      const sourceColumnId = String(data.columnId);
      const initialOrder = createTaskOrder(orderedColumns, props.tasks);
      taskDragSession.current = {
        previewOrder: initialOrder,
        sourceColumnId,
        taskId,
      };
      setActiveDrag({ id: taskId, type: "task" });
      setPreviewOrder(initialOrder);
      setTargetColumnId(sourceColumnId);
      return;
    }
    if (data?.type === "column") {
      setActiveDrag({ id: String(data.columnId), type: "column" });
    }
  }

  function handleDragOver(event: DragOverEvent): void {
    const overData = event.over?.data.current;
    const session = taskDragSession.current;
    if (!overData || !session) {
      setTargetColumnId(null);
      return;
    }
    const destinationColumnId = String(overData.columnId ?? "");
    if (!destinationColumnId) {
      return;
    }
    setTargetColumnId(destinationColumnId);
    const placement = findTaskPlacement(session.previewOrder, session.taskId);
    if (placement?.columnId === destinationColumnId) {
      return;
    }
    const overTaskId = overData.type === "task"
      ? String(overData.taskId)
      : null;
    const nextOrder = moveTaskInOrder(
      session.previewOrder,
      session.taskId,
      destinationColumnId,
      overTaskId,
    );
    session.previewOrder = nextOrder;
    setPreviewOrder(nextOrder);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    const session = taskDragSession.current;
    const finalPreview = session?.previewOrder ?? previewOrder;
    clearDragState();
    if (!over) {
      return;
    }
    const activeData = active.data.current;
    const overData = over.data.current;
    if (activeData?.type === "column" && overData?.columnId) {
      const activeColumnId = String(activeData.columnId);
      const overColumnId = String(overData.columnId);
      workspaceStore.reorderColumn(
        activeColumnId,
        nextItemIdAfterMove(
          orderedColumns,
          activeColumnId,
          overColumnId,
        ),
      );
      return;
    }
    if (activeData?.type !== "task" && !session) {
      return;
    }
    const activeTaskId = session?.taskId ?? String(activeData?.taskId);
    const sourceColumnId = session?.sourceColumnId ??
      String(activeData?.columnId);
    const placement = finalPreview
      ? findTaskPlacement(finalPreview, activeTaskId)
      : null;
    // Release coordinates win if the last hover update has not rendered.
    const destinationColumn = overData?.columnId ?? placement?.columnId;
    if (!destinationColumn || (active.id === over.id && !placement)) {
      return;
    }
    const destinationColumnId = String(destinationColumn);
    let beforeTaskId: string | null = null;
    if (overData?.type === "task") {
      beforeTaskId = String(overData.taskId);
    }
    if (overData?.type === "task" &&
      placement?.columnId === destinationColumnId) {
      const columnTasks = finalPreview
        ? (finalPreview[destinationColumnId] ?? []).map((id) => ({ id }))
        : props.tasks
          .filter((task) => task.columnId === destinationColumnId)
          .sort((left, right) => left.sortPosition - right.sortPosition);
      beforeTaskId = nextItemIdAfterMove(
        columnTasks,
        activeTaskId,
        String(overData.taskId),
      );
    }
    const originalTaskIds = props.tasks
      .filter((task) => task.columnId === sourceColumnId)
      .sort((left, right) => left.sortPosition - right.sortPosition)
      .map((task) => task.id);
    const originalIndex = originalTaskIds.indexOf(activeTaskId);
    const originalBeforeTaskId = originalTaskIds[originalIndex + 1] ?? null;
    if (
      destinationColumnId === sourceColumnId &&
      beforeTaskId === originalBeforeTaskId
    ) {
      return;
    }
    workspaceStore.moveTask(
      activeTaskId,
      destinationColumnId,
      beforeTaskId,
    );
    window.clearTimeout(settledTimer.current);
    setSettledTaskId(activeTaskId);
    settledTimer.current = window.setTimeout(
      () => setSettledTaskId(null),
      reducedMotion ? 100 : TASK_SETTLE_WINDOW_MS,
    );
  }

  return (
    <DndContext
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Press Space to pick up. Use arrow keys to move, Space to " +
            "drop, or Escape to cancel.",
        },
      }}
      collisionDetection={boardCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragCancel={clearDragState}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div
        aria-label="Kanban board"
        className="kanban-scroll"
        ref={boardLayoutRef}
      >
        <SortableContext
          items={orderedColumns.map((column) => columnDragId(column.id))}
          strategy={horizontalListSortingStrategy}
        >
          {orderedColumns.map((column) => (
            <ColumnLane
              {...props}
              column={column}
              key={column.id}
              reducedMotion={reducedMotion}
              settledTaskId={settledTaskId}
              targetColumnId={
                activeDrag?.type === "task" ? targetColumnId : null
              }
              tasks={renderedTasks}
            />
          ))}
        </SortableContext>
        <button
          className="add-column-ticket"
          onClick={() => workspaceStore.createColumn(props.projectId)}
          type="button"
        >
          <Icon name="Plus" /> Add column
        </button>
      </div>
      <FloatingDragOverlay reducedMotion={reducedMotion}>
        {activeTask ? (
          <div
            aria-hidden="true"
            className="board-task-drag-overlay"
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
