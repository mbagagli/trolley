import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import { activeFilterCount, taskMatchesFilter } from "./domain/filters";
import type { ViewMode } from "./domain/types";
import { PRODUCT } from "./config/product";
import { workspaceStore, useWorkspace } from "./state/workspaceStore";
import { BrandLogo } from "./components/BrandLogo";
import { Dashboard } from "./components/Dashboard";
import { FilterPanel } from "./components/FilterPanel";
import { GlobalSearch } from "./components/GlobalSearch";
import { WorkspaceRecovery } from "./components/WorkspaceRecovery";
import { Icon } from "./components/Icon";
import { KanbanBoard } from "./components/KanbanBoard";
import { Modal } from "./components/Modal";
import { Presence } from "./components/Presence";
import { ViewCrossfade } from "./components/ViewCrossfade";

const GanttView = lazy(() =>
  import("./components/GanttView").then((module) => ({
    default: module.GanttView,
  })),
);
const ListView = lazy(() =>
  import("./components/ListView").then((module) => ({
    default: module.ListView,
  })),
);
const MatrixView = lazy(() =>
  import("./components/MatrixView").then((module) => ({
    default: module.MatrixView,
  })),
);
const SettingsPanel = lazy(() =>
  import("./components/SettingsPanel").then((module) => ({
    default: module.SettingsPanel,
  })),
);
const TaskDrawer = lazy(() =>
  import("./components/TaskDrawer").then((module) => ({
    default: module.TaskDrawer,
  })),
);

const VIEW_ITEMS: Array<{
  value: Exclude<ViewMode, "dashboard">;
  label: string;
  icon: string;
  shortcut: string;
}> = [
  { value: "board", label: "Board", icon: "FolderKanban", shortcut: "1" },
  { value: "gantt", label: "Timeline", icon: "CalendarDays", shortcut: "2" },
  { value: "matrix", label: "Matrix", icon: "TableProperties", shortcut: "3" },
  { value: "list", label: "List", icon: "List", shortcut: "4" },
];

const THEME_COLORS = {
  light: "#f7f4ee",
  dark: "#151412",
} as const;

export default function App() {
  const state = useWorkspace();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const snapshot = state.snapshot;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        if (editing || state.dataOperation) return;
        event.preventDefault();
        if (event.shiftKey) workspaceStore.redo();
        else workspaceStore.undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        if (editing || state.dataOperation) return;
        event.preventDefault();
        workspaceStore.redo();
        return;
      }
      if (event.key === "Escape") {
        if (editing && target instanceof HTMLElement) target.blur();
        setGlobalSearchOpen(false);
        setFilterOpen(false);
        setSettingsOpen(false);
        workspaceStore.selectTask(null);
        return;
      }
      if (editing) {
        return;
      }
      const view = VIEW_ITEMS.find((item) => item.shortcut === event.key);
      if (view && state.activeView !== "dashboard") {
        workspaceStore.setActiveView(view.value);
      }
      if (event.key.toLowerCase() === "n" && state.activeView === "board") {
        const input = document.querySelector<HTMLInputElement>(
          ".quick-add-task input",
        );
        input?.focus();
      }
      if (event.key === "/") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>("[data-project-search]")
          ?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.activeView, state.dataOperation]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const preference = snapshot.preferences.theme;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = preference === "system"
        ? media.matches ? "dark" : "light"
        : preference;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", THEME_COLORS[resolved]);
    };
    applyTheme();
    if (preference !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [snapshot?.preferences.theme]);

  useEffect(() => {
    if (!state.toast) {
      return;
    }
    const timer = window.setTimeout(() => workspaceStore.dismissToast(), 2600);
    return () => window.clearTimeout(timer);
  }, [state.toast]);

  const project = snapshot?.projects.find(
    (candidate) => candidate.id === state.activeProjectId,
  );
  const columns = useMemo(
    () =>
      snapshot?.columns
        .filter((column) => column.projectId === project?.id)
        .sort((left, right) => left.sortPosition - right.sortPosition) ?? [],
    [project?.id, snapshot?.columns],
  );
  const labels = useMemo(
    () =>
      snapshot?.labels.filter((label) => label.projectId === project?.id) ?? [],
    [project?.id, snapshot?.labels],
  );
  const members = useMemo(
    () =>
      snapshot?.members.filter((member) => member.projectId === project?.id) ??
      [],
    [project?.id, snapshot?.members],
  );
  const projectTasks = useMemo(
    () =>
      snapshot?.tasks.filter(
        (task) => task.projectId === project?.id && !task.archived,
      ) ?? [],
    [project?.id, snapshot?.tasks],
  );
  const visibleTasks = useMemo(
    () => projectTasks.filter((task) => taskMatchesFilter(task, state.filter)),
    [projectTasks, state.filter],
  );
  const matrixTasks = useMemo(
    () =>
      visibleTasks.filter(
        (task) => project?.settings.showCompletedInMatrix || !task.completed,
      ),
    [project?.settings.showCompletedInMatrix, visibleTasks],
  );
  const selectedTask = snapshot?.tasks.find(
    (task) => task.id === state.selectedTaskId,
  );
  const savedFilters =
    snapshot?.savedFilters.filter(
      (filter) => filter.projectId === project?.id,
    ) ?? [];
  const filterCount = activeFilterCount(state.filter);

  const createProjectTask = () => {
    const column = columns.find((item) => !item.completed) ?? columns[0];
    if (!column) return;
    const taskId = workspaceStore.createTask(
      column.id, `New ${project?.settings.terminology.taskSingular ?? "task"}`,
    );
    if (taskId) workspaceStore.selectTask(taskId);
  };

  if (state.loading) {
    return (
      <main className="loading-screen">
        <span className="loading-mark">
          <BrandLogo showWordmark={false} />
        </span>
        <h1>Opening the workbench</h1>
        <div className="loading-rail"><span /></div>
      </main>
    );
  }
  if (!snapshot || state.loadError) {
    return (
      <WorkspaceRecovery
        message={state.loadError ?? "No local workspace was returned."}
      />
    );
  }
  if (state.activeView === "dashboard" || !project) {
    return (
      <div className={`app-root density-${snapshot.preferences.density}`}>
        <Dashboard snapshot={snapshot} />
        <Presence value={globalSearchOpen ? snapshot : null}>
          {(searchSnapshot) => (
            <GlobalSearch
              onClose={() => setGlobalSearchOpen(false)}
              snapshot={searchSnapshot}
            />
          )}
        </Presence>
        <Presence value={state.onboardingOpen ? true : null}>
          {() => (
            <Onboarding onSearch={() => setGlobalSearchOpen(true)} />
          )}
        </Presence>
        <Toast />
      </div>
    );
  }

  return (
    <div className={`app-root density-${snapshot.preferences.density}`}>
      <aside
        className={`project-rail${sidebarCollapsed ? " collapsed" : ""}`}
        inert={state.dataOperation}
      >
        <header>
          <button
            aria-label="Open project dashboard"
            className="rail-brand"
            onClick={() => workspaceStore.openDashboard()}
            type="button"
          >
            <BrandLogo showWordmark={!sidebarCollapsed} />
          </button>
          <button
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            className="rail-collapse"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            <Icon
              name={sidebarCollapsed ? "PanelLeftOpen" : "PanelLeftClose"}
            />
          </button>
        </header>
        <button
          aria-label="Search all projects and tasks"
          className="global-search-trigger"
          onClick={() => setGlobalSearchOpen(true)}
          type="button"
        >
          <Icon name="Search" />
          {sidebarCollapsed ? null : (
            <><span>Search all</span><kbd>Ctrl K</kbd></>
          )}
        </button>
        <nav aria-label="Projects" className="rail-projects">
          {snapshot.projects
            .filter((item) => !item.archived)
            .sort((left, right) => left.sortPosition - right.sortPosition)
            .map((item) => (
              <button
                aria-current={item.id === project.id ? "page" : undefined}
                key={item.id}
                onClick={() => workspaceStore.selectProject(item.id)}
                style={{ "--project-color": item.color } as CSSProperties}
                title={item.name}
                type="button"
              >
                <span className="rail-project-mark">
                  {item.icon ? (
                    <Icon name={item.icon} />
                  ) : (
                    item.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                {sidebarCollapsed ? null : <span>{item.name}</span>}
              </button>
            ))}
        </nav>
        <footer>
          <button onClick={() => workspaceStore.openDashboard()} type="button">
            <Icon name="LayoutDashboard" />
            {sidebarCollapsed ? null : <span>All projects</span>}
          </button>
        </footer>
      </aside>
      <div className="project-workspace" inert={state.dataOperation}>
        <header className="project-header">
          <div className="project-title-lockup">
            <span
              className="project-title-mark"
              style={{ backgroundColor: project.color }}
            >
              {project.icon ? <Icon name={project.icon} /> : null}
            </span>
            <div>
              <h1>{project.name}</h1>
            </div>
          </div>
          <label className="project-search">
            <Icon name="Search" />
            <span className="sr-only">Search this project</span>
            <input
              aria-label="Search this project"
              data-project-search
              onChange={(event) =>
                workspaceStore.setFilter({
                  ...state.filter,
                  query: event.target.value,
                })
              }
              placeholder="Search this project"
              type="search"
              value={state.filter.query}
            />
            <kbd>/</kbd>
          </label>
          <div className="header-actions">
            <button
              className="primary-button new-task-button"
              disabled={columns.length === 0}
              onClick={createProjectTask}
              type="button"
            >
              <Icon name="Plus" />
              <span>New {project.settings.terminology.taskSingular.toLowerCase()}</span>
            </button>
            <button
              aria-label="Undo last change"
              disabled={!state.canUndo || state.dataOperation}
              onClick={() => workspaceStore.undo()}
              title="Undo (Ctrl+Z)"
              type="button"
            >
              <Icon name="Undo2" />
            </button>
            <button
              aria-label="Redo last change"
              disabled={!state.canRedo || state.dataOperation}
              onClick={() => workspaceStore.redo()}
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
              type="button"
            >
              <Icon name="Redo2" />
            </button>
            <button
              aria-label="Open project settings"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              <Icon name="Settings2" />
            </button>
          </div>
        </header>
        <div className="project-view-bar">
          <nav aria-label="Project views" className="view-switcher">
            {VIEW_ITEMS.map((item) => (
              <button
                aria-label={`${item.label} view`}
                aria-current={
                  state.activeView === item.value ? "page" : undefined
                }
                key={item.value}
                onClick={() => workspaceStore.setActiveView(item.value)}
                type="button"
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                <kbd>{item.shortcut}</kbd>
              </button>
            ))}
          </nav>
          <div className="filter-actions">
            {savedFilters.length > 0 ? (
              <label className="saved-filter-picker">
                <span className="sr-only">Saved filters</span>
                <select
                  aria-label="Saved filters"
                  value=""
                  onChange={(event) =>
                    workspaceStore.applySavedFilter(event.target.value)
                  }
                >
                  <option disabled value="">Saved filters</option>
                  {savedFilters.map((filter) => (
                    <option key={filter.id} value={filter.id}>{filter.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {savedFilters.map((filter) => (
              <div className="saved-filter-chip" key={filter.id}>
                <button
                  onClick={() => workspaceStore.applySavedFilter(filter.id)}
                  type="button"
                >
                  {filter.name}
                </button>
                <button
                  aria-label={`Delete saved filter ${filter.name}`}
                  onClick={() => workspaceStore.deleteSavedFilter(filter.id)}
                  type="button"
                >
                  <Icon name="X" size={12} />
                </button>
              </div>
            ))}
            <button
              aria-label={filterCount > 0
                ? `Filters (${filterCount} active)` : "Filters"}
              aria-expanded={filterOpen}
              className={
                filterCount > 0 ? "filter-button active" : "filter-button"
              }
              onClick={() => setFilterOpen((current) => !current)}
              type="button"
            >
              <Icon name="Filter" /> Filters
              {filterCount > 0 ? <span>{filterCount}</span> : null}
            </button>
          </div>
          <div className={`save-indicator ${state.saveState}`} role="status">
            <span />
            {state.saveState === "saving"
              ? "Saving"
              : state.saveState === "error"
                ? "Save failed"
                : "Saved locally"}
          </div>
        </div>
        {state.saveState === "error" ? (
          <div className="save-error" role="alert">
            <span>
              <Icon name="Siren" /> {state.saveError}
            </span>
            <button
              onClick={() => void workspaceStore.retrySave()}
              type="button"
            >
              Retry save
            </button>
          </div>
        ) : null}
        <main className={`view-stage view-${state.activeView}`}>
          {state.activeView === "matrix" ? (
            <div className="view-guidance">
              <Icon name="TableProperties" />
              <span>Move tasks to change urgency and importance.</span>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(project.settings.showCompletedInMatrix &&
                    state.filter.includeCompleted)}
                  onChange={(event) => {
                    workspaceStore.updateProjectSettings(project.id, {
                      showCompletedInMatrix: event.target.checked,
                    });
                    if (event.target.checked) {
                      workspaceStore.setFilter({
                        ...state.filter, includeCompleted: true,
                      });
                    }
                  }}
                />
                Show completed
              </label>
            </div>
          ) : null}
          <ViewCrossfade transitionKey={state.activeView}>
            <Suspense fallback={<ViewLoading />}>
              {state.activeView === "board" ? (
                <KanbanBoard
                  cardFields={project.settings.cardFields}
                  columns={columns}
                  dateFormat={project.settings.dateFormat}
                  labels={labels}
                  members={members}
                  priorities={project.settings.priorities}
                  projectId={project.id}
                  tasks={visibleTasks}
                  terminology={project.settings.terminology}
                />
              ) : null}
              {state.activeView === "gantt" ? (
                <GanttView
                  columns={columns}
                  dateFormat={project.settings.dateFormat}
                  firstDayOfWeek={project.settings.firstDayOfWeek}
                  showWeekends={project.settings.showWeekends}
                  tasks={visibleTasks}
                  terminology={project.settings.terminology}
                  workingDays={project.settings.workingDays}
                />
              ) : null}
              {state.activeView === "matrix" ? (
                <MatrixView
                  cardFields={project.settings.cardFields}
                  dateFormat={project.settings.dateFormat}
                  labels={labels}
                  members={members}
                  priorities={project.settings.priorities}
                  quadrants={project.settings.quadrants}
                  tasks={matrixTasks}
                  terminology={project.settings.terminology}
                />
              ) : null}
              {state.activeView === "list" ? (
                <ListView
                  columns={columns}
                  dateFormat={project.settings.dateFormat}
                  labels={labels}
                  members={members}
                  priorities={project.settings.priorities}
                  quadrants={project.settings.quadrants}
                  selectedTaskIds={state.selectedTaskIds}
                  tasks={visibleTasks}
                  terminology={project.settings.terminology}
                />
              ) : null}
            </Suspense>
          </ViewCrossfade>
        </main>
      </div>
      <Presence value={filterOpen ? true : null}>
        {() => (
          <div className="panel-stack filter-stack">
            <FilterPanel
              columns={columns}
              filter={state.filter}
              labels={labels}
              members={members}
              onChange={(filter) => workspaceStore.setFilter(filter)}
              onClose={() => setFilterOpen(false)}
              priorities={project.settings.priorities}
              quadrants={project.settings.quadrants}
              terminology={project.settings.terminology}
            />
            {savedFilters.length > 0 ? (
              <div className="panel-presets" aria-label="Saved filter presets">
                <h3>Saved filters</h3>
                {savedFilters.map((filter) => (
                  <div className="saved-filter-chip" key={filter.id}>
                    <button type="button" onClick={() =>
                      workspaceStore.applySavedFilter(filter.id)
                    }>{filter.name}</button>
                    <button
                      aria-label={`Delete saved filter ${filter.name}`}
                      type="button"
                      onClick={() => workspaceStore.deleteSavedFilter(filter.id)}
                    ><Icon name="X" size={14} /></button>
                  </div>
                ))}
              </div>
            ) : null}
            <form
              className="save-preset-form"
              onSubmit={(event) => {
                event.preventDefault();
                workspaceStore.saveCurrentFilter(presetName);
                setPresetName("");
              }}
            >
              <label>
                Save current filter
                <input
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Preset name"
                  value={presetName}
                />
              </label>
              <button type="submit">Save preset</button>
            </form>
          </div>
        )}
      </Presence>
      <Presence value={settingsOpen ? true : null}>
        {() => (
          <Suspense fallback={<PanelLoading />}>
            <SettingsPanel
              columns={columns}
              labels={labels}
              members={members}
              onClose={() => setSettingsOpen(false)}
              project={project}
              tasks={snapshot.tasks.filter(
                (task) => task.projectId === project.id,
              )}
            />
          </Suspense>
        )}
      </Presence>
      <Presence value={selectedTask ?? null}>
        {(drawerTask) => (
          <Suspense fallback={<PanelLoading />}>
            <TaskDrawer
              columns={columns}
              labels={labels}
              members={members}
              priorities={project.settings.priorities}
              task={drawerTask}
              tasks={projectTasks}
              terminology={project.settings.terminology}
            />
          </Suspense>
        )}
      </Presence>
      <Presence value={globalSearchOpen ? snapshot : null}>
        {(searchSnapshot) => (
          <GlobalSearch
            onClose={() => setGlobalSearchOpen(false)}
            snapshot={searchSnapshot}
          />
        )}
      </Presence>
      <Presence value={state.onboardingOpen ? true : null}>
        {() => (
          <Onboarding onSearch={() => setGlobalSearchOpen(true)} />
        )}
      </Presence>
      <Toast />
    </div>
  );
}

function ViewLoading() {
  return (
    <div className="view-loading" role="status">
      <span />
      Loading view
    </div>
  );
}

function PanelLoading() {
  return (
    <aside className="panel-loading" aria-label="Loading panel">
      <span />
    </aside>
  );
}

function Onboarding({ onSearch }: { onSearch: () => void }) {
  return (
    <Modal
      label="Welcome to Trolley"
      onClose={() => workspaceStore.completeOnboarding()}
    >
      <div className="dialog-scrim" role="presentation">
      <section className="onboarding-dialog">
        <div className="onboarding-mark">
          <BrandLogo showWordmark={false} />
        </div>
        <h1 id="onboarding-title">One project, four useful perspectives</h1>
        <p>
          {PRODUCT.name} keeps the same tasks in Board, Timeline, Matrix, and
          List.
          Move work anywhere and the other views follow immediately.
        </p>
        <div className="onboarding-stations" aria-label="Available views">
          {VIEW_ITEMS.map((item) => (
            <span key={item.value}>
              <Icon name={item.icon} /> {item.label}
            </span>
          ))}
        </div>
        <div className="onboarding-actions">
          <button
            className="primary-button"
            onClick={() => workspaceStore.completeOnboarding()}
            type="button"
          >
            Explore the demo
          </button>
          <button
            className="secondary-button"
            onClick={() => workspaceStore.startBlankWorkspace()}
            type="button"
          >
            Start empty
          </button>
        </div>
        <button className="onboarding-search" onClick={onSearch} type="button">
          <Icon name="Search" /> Search opens any project or task with Ctrl+K
        </button>
      </section>
      </div>
    </Modal>
  );
}

function Toast() {
  const { toast } = useWorkspace();
  return (
    <Presence className="toast-presence" value={toast}>
      {(visibleToast) => (
        <div className={`toast ${visibleToast.tone}`} role="status">
          <Icon
            name={
              visibleToast.tone === "error"
                ? "Siren"
                : visibleToast.tone === "warning"
                  ? "Flag"
                  : "BadgeCheck"
            }
          />
          {visibleToast.message}
          <button
            aria-label="Dismiss notification"
            onClick={() => workspaceStore.dismissToast()}
            type="button"
          >
            <Icon name="X" />
          </button>
        </div>
      )}
    </Presence>
  );
}
