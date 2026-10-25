import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Task, Terminology, WorkflowColumn } from "../domain/types";
import { flattenTaskHierarchy } from "../domain/hierarchy";
import {
  boundedTimelineDays,
  MAX_TIMELINE_DAYS,
  shiftTimelineFocus,
  shiftByTimelineDays,
  timelineDayEndIndex,
  timelineDayIndex,
  timelineDaySpan,
  visibleTimelineDays,
} from "../domain/timeline";
import { workspaceStore } from "../state/workspaceStore";
import {
  daysBetween,
  formatShortDate,
  parseLocalDate,
  todayIso,
} from "../utils/date";
import { Icon } from "./Icon";

type GanttZoom = "day" | "week" | "month" | "quarter";
type DragMode = "move" | "start" | "end";

const TASK_PANE_WIDTH = 320;
const ROW_HEIGHT = 52;
const ZOOM_PIXELS: Record<GanttZoom, number> = {
  day: 34,
  week: 18,
  month: 8,
  quarter: 4,
};

interface GanttViewProps {
  tasks: Task[];
  columns: WorkflowColumn[];
  showWeekends: boolean;
  workingDays: number[];
  firstDayOfWeek: number;
  dateFormat: string;
  terminology: Terminology;
}

interface DateRange {
  start: string;
  end: string;
  days: string[];
}

function dateRange(
  tasks: Task[],
  zoom: GanttZoom,
  focus: string,
): DateRange {
  const dates = tasks.flatMap((task) =>
    [task.startDate, task.dueDate].flatMap((value) => (value ? [value] : [])),
  );
  const padding = zoom === "quarter" ? 90 : zoom === "month" ? 35 : 14;
  const days = boundedTimelineDays(dates, padding, focus);
  return { start: days[0]!, end: days[days.length - 1]!, days };
}

function timelineLabel(date: string, zoom: GanttZoom): string {
  const parsed = parseLocalDate(date);
  if (zoom === "day") {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
    }).format(parsed);
  }
  if (zoom === "week") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(parsed);
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "2-digit",
  }).format(parsed);
}

function visibleTick(
  date: string,
  zoom: GanttZoom,
  firstDayOfWeek: number,
  previousDate?: string,
): boolean {
  const parsed = parseLocalDate(date);
  if (zoom === "day") return true;
  if (zoom === "week") return parsed.getDay() === firstDayOfWeek;
  if (!previousDate) return true;
  const previous = parseLocalDate(previousDate);
  const startsMonth = parsed.getMonth() !== previous.getMonth() ||
    parsed.getFullYear() !== previous.getFullYear();
  if (zoom === "month") return startsMonth;
  return startsMonth && parsed.getMonth() % 3 === 0;
}

function visibleWeekStart(
  firstDayOfWeek: number,
  showNonWorkingDays: boolean,
  workingDays: number[],
): number {
  if (showNonWorkingDays) {
    return firstDayOfWeek;
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const day = (firstDayOfWeek + offset) % 7;
    if (workingDays.includes(day)) {
      return day;
    }
  }
  return firstDayOfWeek;
}

function taskDateSummary(task: Task, dateFormat: string): string {
  if (!task.startDate || !task.dueDate) {
    return "Unscheduled";
  }
  const duration = daysBetween(task.startDate, task.dueDate) + 1;
  return `${formatShortDate(task.startDate, dateFormat)} to ` +
    `${formatShortDate(task.dueDate, dateFormat)} / ${duration}d`;
}

function GanttBar({
  task,
  visibleDays,
  pixelsPerDay,
  blocked,
  dateFormat,
  showNonWorkingDays,
  workingDays,
  onReveal,
}: {
  task: Task;
  visibleDays: string[];
  pixelsPerDay: number;
  blocked: boolean;
  dateFormat: string;
  showNonWorkingDays: boolean;
  workingDays: number[];
  onReveal: (date: string) => void;
}) {
  const [previewDays, setPreviewDays] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    pointerId: number;
    captureTarget: HTMLElement;
  } | null>(null);
  if (!task.startDate || !task.dueDate) {
    return (
      <button
        aria-label={`Schedule ${task.title}: set start and due dates`}
        title="Open task details to set start and due dates"
        className="gantt-unscheduled"
        onClick={() => workspaceStore.selectTask(task.id)}
        type="button"
      >
        Schedule
      </button>
    );
  }
  if (visibleDays.length === 0 ||
    task.dueDate < visibleDays[0]! ||
    task.startDate > visibleDays[visibleDays.length - 1]!) {
    return (
      <button
        className="gantt-unscheduled"
        onClick={() => onReveal(task.startDate!)}
        type="button"
      >
        Show scheduled dates
      </button>
    );
  }
  const startOffset = Math.max(
    0,
    timelineDayIndex(visibleDays, task.startDate),
  );
  const duration = timelineDaySpan(
    visibleDays,
    task.startDate,
    task.dueDate,
  );
  const mode = dragRef.current?.mode ?? "move";
  const leftDays = startOffset + (mode === "end" ? 0 : previewDays);
  const widthDays = Math.max(
    1,
    duration +
      (mode === "start" ? -previewDays : mode === "end" ? previewDays : 0),
  );
  const late = task.dueDate < todayIso() && !task.completed;
  const scheduleState = `${late ? ", late" : ""}${
    blocked ? ", blocked" : ""
  }`;
  const dateSummary = taskDateSummary(task, dateFormat);

  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    nextMode: DragMode,
  ): void {
    event.stopPropagation();
    dragRef.current = {
      mode: nextMode,
      startX: event.clientX,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setPreviewDays(Math.round((event.clientX - drag.startX) / pixelsPerDay));
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    drag.captureTarget.releasePointerCapture(event.pointerId);
    const delta = previewDays;
    dragRef.current = null;
    setDragging(false);
    setPreviewDays(0);
    if (delta === 0) {
      return;
    }
    if (drag.mode === "move") {
      workspaceStore.updateTask(task.id, {
        startDate: shiftByTimelineDays(
          task.startDate as string,
          delta,
          showNonWorkingDays,
          workingDays,
        ),
        dueDate: shiftByTimelineDays(
          task.dueDate as string,
          delta,
          showNonWorkingDays,
          workingDays,
        ),
      });
    } else if (drag.mode === "start") {
      const nextStart = shiftByTimelineDays(
        task.startDate as string,
        delta,
        showNonWorkingDays,
        workingDays,
      );
      if (nextStart <= (task.dueDate as string)) {
        workspaceStore.updateTask(task.id, { startDate: nextStart });
      }
    } else {
      const nextDue = shiftByTimelineDays(
        task.dueDate as string,
        delta,
        showNonWorkingDays,
        workingDays,
      );
      if (nextDue >= (task.startDate as string)) {
        workspaceStore.updateTask(task.id, { dueDate: nextDue });
      }
    }
  }

  function cancelDrag(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    setPreviewDays(0);
  }

  function shiftedDate(date: string, delta: number): string {
    return shiftByTimelineDays(
      date,
      delta,
      showNonWorkingDays,
      workingDays,
    );
  }

  function handleKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    if (event.shiftKey) {
      const dueDate = shiftedDate(task.dueDate as string, delta);
      if (dueDate >= (task.startDate as string)) {
        workspaceStore.updateTask(task.id, { dueDate });
      }
      return;
    }
    if (event.altKey) {
      const startDate = shiftedDate(task.startDate as string, delta);
      if (startDate <= (task.dueDate as string)) {
        workspaceStore.updateTask(task.id, { startDate });
      }
      return;
    }
    workspaceStore.updateTask(task.id, {
      startDate: shiftedDate(task.startDate as string, delta),
      dueDate: shiftedDate(task.dueDate as string, delta),
    });
  }

  function handleResizeKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    edge: "start" | "end",
  ): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    if (edge === "start") {
      const startDate = shiftedDate(task.startDate as string, delta);
      if (startDate <= (task.dueDate as string)) {
        workspaceStore.updateTask(task.id, { startDate });
      }
      return;
    }
    const dueDate = shiftedDate(task.dueDate as string, delta);
    if (dueDate >= (task.startDate as string)) {
      workspaceStore.updateTask(task.id, { dueDate });
    }
  }

  return (
    <div
      className={
        `gantt-bar${task.milestone ? " milestone" : ""}` +
        `${late ? " late" : ""}${blocked ? " blocked" : ""}` +
        `${dragging ? " is-dragging" : ""}`
      }
      onPointerCancel={cancelDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      style={
        {
          left: `${leftDays * pixelsPerDay}px`,
          width: task.milestone ? 22 : `${widthDays * pixelsPerDay}px`,
        } as CSSProperties
      }
      title={
        `${formatShortDate(task.startDate, dateFormat)} to ` +
        formatShortDate(task.dueDate, dateFormat)
      }
    >
      {task.milestone ? (
        <button
          aria-label={
            `${task.title}, milestone, ${dateSummary}${scheduleState}. ` +
            "Use arrow keys to move."
          }
          className="gantt-bar-open"
          onClick={() => workspaceStore.selectTask(task.id)}
          onKeyDown={handleKeyboard}
          onPointerDown={(event) => beginDrag(event, "move")}
          type="button"
        >
          <Icon name="Milestone" />
        </button>
      ) : (
        <>
          <span
            className="gantt-complete"
            style={{ transform: `scaleX(${task.progress / 100})` }}
          />
          <button
            aria-label={
              `${task.title}, ${dateSummary}${scheduleState}. ` +
              `${duration} visible days. Use arrow keys ` +
              "to move, Alt with arrows for the start, or Shift with " +
              "arrows for the end."
            }
            className="gantt-bar-open"
            onClick={() => workspaceStore.selectTask(task.id)}
            onKeyDown={handleKeyboard}
            onPointerDown={(event) => beginDrag(event, "move")}
            type="button"
          >
            <span className="gantt-label">{task.title}</span>
          </button>
          <button
            aria-label="Resize start date"
            className="gantt-resize start"
            onKeyDown={(event) => handleResizeKeyboard(event, "start")}
            onPointerDown={(event) => beginDrag(event, "start")}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            type="button"
          />
          <button
            aria-label="Resize due date"
            className="gantt-resize end"
            onKeyDown={(event) => handleResizeKeyboard(event, "end")}
            onPointerDown={(event) => beginDrag(event, "end")}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            type="button"
          />
        </>
      )}
    </div>
  );
}

export function GanttView({
  tasks,
  columns,
  showWeekends,
  workingDays,
  firstDayOfWeek,
  dateFormat,
  terminology,
}: GanttViewProps) {
  const [zoom, setZoom] = useState<GanttZoom>("week");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusDate, setFocusDate] = useState(todayIso);
  const range = useMemo(
    () => dateRange(tasks, zoom, focusDate), [tasks, zoom, focusDate],
  );
  const visibleDays = useMemo(
    () => visibleTimelineDays(range.days, showWeekends, workingDays),
    [range.days, showWeekends, workingDays],
  );
  const pixelsPerDay = ZOOM_PIXELS[zoom];
  const weekStart = visibleWeekStart(
    firstDayOfWeek,
    showWeekends,
    workingDays,
  );
  const timelineWidth = visibleDays.length * pixelsPerDay;
  const focusX = Math.max(0, timelineDayIndex(visibleDays, focusDate)) *
    pixelsPerDay;
  useEffect(() => {
    scrollRef.current?.scrollTo?.({
      left: Math.max(0, TASK_PANE_WIDTH + focusX - 420),
      behavior: "auto",
    });
  }, [focusDate, range.start, focusX]);
  const taskMap = useMemo(
    () => new Map(tasks.map((task) => [task.id, task] as const)),
    [tasks],
  );
  const parentIds = useMemo(
    () => new Set(tasks.flatMap((task) => task.parentId ?? [])),
    [tasks],
  );
  const orderedTasks = useMemo(
    () => flattenTaskHierarchy(tasks, collapsed),
    [collapsed, tasks],
  );
  const rowByTask = useMemo(
    () =>
      new Map(
        orderedTasks.map(({ task }, index) => [task.id, index] as const),
      ),
    [orderedTasks],
  );
  const todayX = Math.max(
    0,
    timelineDayIndex(visibleDays, todayIso()),
  ) * pixelsPerDay;
  const connectors = orderedTasks.flatMap(({ task }) =>
    task.dependencyIds.flatMap((dependencyId) => {
      const dependency = taskMap.get(dependencyId);
      const fromRow = rowByTask.get(dependencyId);
      const toRow = rowByTask.get(task.id);
      if (
        !dependency?.dueDate ||
        !task.startDate ||
        dependency.dueDate < range.start || dependency.dueDate > range.end ||
        task.startDate < range.start || task.startDate > range.end ||
        fromRow === undefined ||
        toRow === undefined
      ) {
        return [];
      }
      const x1 = timelineDayEndIndex(
        visibleDays,
        dependency.dueDate,
      ) * pixelsPerDay;
      const x2 = Math.max(
        0,
        timelineDayIndex(visibleDays, task.startDate),
      ) * pixelsPerDay;
      const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const midpoint = Math.max(x1 + 10, x1 + (x2 - x1) / 2);
      return [{ id: `${dependencyId}:${task.id}`, x1, x2, y1, y2, midpoint }];
    }),
  );

  function scrollToToday(): void {
    setFocusDate(todayIso());
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTo({
      left: Math.max(0, TASK_PANE_WIDTH + todayX - 420),
      behavior: "smooth",
    });
  }

  return (
    <div className="gantt-view">
      <div className="gantt-toolbar">
        <div className="segmented-control" aria-label="Timeline zoom">
          {(["day", "week", "month", "quarter"] as const).map((value) => (
            <button
              aria-pressed={zoom === value}
              key={value}
              onClick={() => setZoom(value)}
              type="button"
            >
              {value[0]?.toUpperCase()}{value.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="secondary-button"
          onClick={scrollToToday}
          type="button"
        >
          <Icon name="CalendarClock" /> Today
        </button>
        <button
          className="secondary-button"
          onClick={() => setFocusDate(shiftTimelineFocus(
            focusDate, -MAX_TIMELINE_DAYS / 2,
          ))}
          type="button"
          aria-label="Earlier timeline dates"
        >
          <Icon name="ChevronLeft" />
        </button>
        <label>
          <span className="sr-only">Timeline date</span>
          <input
            aria-label="Timeline date"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={focusDate}
            onChange={(event) => {
              if (event.target.value && event.target.validity.valid) {
                setFocusDate(event.target.value);
              }
            }}
          />
        </label>
        <button
          className="secondary-button"
          onClick={() => setFocusDate(shiftTimelineFocus(
            focusDate, MAX_TIMELINE_DAYS / 2,
          ))}
          type="button"
          aria-label="Later timeline dates"
        >
          <Icon name="ChevronRight" />
        </button>
        <span className="weekend-state">
          {range.start} to {range.end}
        </span>
        <span className="weekend-state">
          Non-working days {showWeekends ? "shown" : "hidden"}
        </span>
      </div>
      <div className="gantt-scroll" ref={scrollRef}>
        <div
          className="gantt-canvas"
          style={{ width: TASK_PANE_WIDTH + timelineWidth }}
        >
          <div
            className="gantt-header-row"
            style={{
              gridTemplateColumns: `${TASK_PANE_WIDTH}px ${timelineWidth}px`,
            }}
          >
            <div className="gantt-task-heading">
              <strong>{terminology.taskSingular} hierarchy</strong>
              <span>Schedule and progress</span>
            </div>
            <div className="gantt-date-heading">
              {visibleDays.map((date, index) =>
                visibleTick(date, zoom, weekStart, visibleDays[index - 1]) ? (
                  <span
                    className="gantt-date-tick"
                    key={date}
                    style={{ left: index * pixelsPerDay }}
                  >
                    {timelineLabel(date, zoom)}
                  </span>
                ) : null,
              )}
            </div>
          </div>
          <div className="gantt-body">
            {showWeekends ? (
              <div
                aria-hidden="true"
                className="gantt-nonworking-days"
                style={{ left: TASK_PANE_WIDTH }}
              >
                {range.days.map((date, index) =>
                  workingDays.includes(
                    parseLocalDate(date).getDay(),
                  ) ? null : (
                    <span
                      className="gantt-nonworking-day"
                      key={date}
                      style={{
                        left: index * pixelsPerDay,
                        width: pixelsPerDay,
                      }}
                    />
                  ),
                )}
              </div>
            ) : null}
            <svg
              aria-hidden="true"
              className="dependency-lines"
              height={orderedTasks.length * ROW_HEIGHT}
              style={{ left: TASK_PANE_WIDTH }}
              width={timelineWidth}
            >
              {connectors.map((connector) => (
                <path
                  d={
                    `M ${connector.x1} ${connector.y1} ` +
                    `H ${connector.midpoint} V ${connector.y2} ` +
                    `H ${connector.x2}`
                  }
                  key={connector.id}
                />
              ))}
            </svg>
            {todayIso() >= range.start && todayIso() <= range.end ? (
              <span
                aria-label="Today"
                className="today-marker"
                style={{ left: TASK_PANE_WIDTH + todayX }}
              />
            ) : null}
            {orderedTasks.length === 0 ? (
              <div className="gantt-empty-state">
                <Icon name="CalendarClock" />
                <strong>No {terminology.taskPlural.toLowerCase()}</strong>
                <span>
                  Clear filters or create work on the Board to fill this
                  timeline.
                </span>
              </div>
            ) : null}
            {orderedTasks.map(({ task, depth }, index) => {
              const column = columns.find((item) => item.id === task.columnId);
              const blocked = task.dependencyIds.some(
                (id) => !taskMap.get(id)?.completed,
              );
              const late = Boolean(
                task.dueDate &&
                task.dueDate < todayIso() &&
                !task.completed,
              );
              return (
                <div
                  className="gantt-row"
                  key={task.id}
                  style={{
                    gridTemplateColumns:
                      `${TASK_PANE_WIDTH}px ${timelineWidth}px`,
                    top: index * ROW_HEIGHT,
                  }}
                >
                  <div
                    className="gantt-task-cell"
                    style={{ paddingLeft: 16 + depth * 24 }}
                  >
                    {parentIds.has(task.id) ? (
                      <button
                        aria-label={
                          collapsed.has(task.id)
                            ? "Expand group"
                            : "Collapse group"
                        }
                        onClick={() => {
                          const next = new Set(collapsed);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          setCollapsed(next);
                        }}
                        className="gantt-group-toggle"
                        type="button"
                      >
                        <Icon
                          name={
                            collapsed.has(task.id)
                              ? "ChevronRight"
                              : "ChevronDown"
                          }
                        />
                      </button>
                    ) : (
                      <span className="gantt-task-spacer" />
                    )}
                    <button
                      className="gantt-task-open"
                      onClick={() => workspaceStore.selectTask(task.id)}
                      type="button"
                    >
                      <span className="gantt-task-copy">
                      <strong>{task.title}</strong>
                      <small>
                        {column?.name ?? "No status"} / {task.progress}%
                        {blocked ? " / Blocked" : ""}
                        {late ? " / Late" : ""}
                      </small>
                      <small>{taskDateSummary(task, dateFormat)}</small>
                      </span>
                    </button>
                  </div>
                  <div
                    className="gantt-track"
                    style={
                      {
                        "--day-size": `${pixelsPerDay}px`,
                        backgroundSize: `${pixelsPerDay}px 100%`,
                      } as CSSProperties
                    }
                  >
                    <GanttBar
                      onReveal={setFocusDate}
                      blocked={blocked}
                      dateFormat={dateFormat}
                      pixelsPerDay={pixelsPerDay}
                      showNonWorkingDays={showWeekends}
                      task={task}
                      visibleDays={visibleDays}
                      workingDays={workingDays}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
