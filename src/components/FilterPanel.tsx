import type {
  FilterState,
  Label,
  PriorityLevel,
  QuadrantConfig,
  TeamMember,
  Terminology,
  WorkflowColumn,
} from "../domain/types";
import { activeFilterCount } from "../domain/filters";
import { usePanelFocus } from "../hooks/usePanelFocus";
import { Icon } from "./Icon";

interface FilterPanelProps {
  filter: FilterState;
  columns: WorkflowColumn[];
  labels: Label[];
  members: TeamMember[];
  priorities: PriorityLevel[];
  quadrants: QuadrantConfig[];
  onChange: (filter: FilterState) => void;
  onClose: () => void;
  terminology: Terminology;
}

function toggled<T>(items: T[], value: T): T[] {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

export function FilterPanel({
  filter,
  columns,
  labels,
  members,
  priorities,
  quadrants,
  onChange,
  onClose,
  terminology,
}: FilterPanelProps) {
  const panelRef = usePanelFocus();
  const activeCount = activeFilterCount(filter);
  return (
    <aside
      ref={panelRef}
      className="filter-panel"
      aria-label={`${terminology.taskSingular} filters`}
    >
      <header>
        <div>
          <h2>Filter this {terminology.projectSingular.toLowerCase()}</h2>
          <p>{activeCount} active conditions</p>
        </div>
        <button aria-label="Close filters" onClick={onClose} type="button">
          <Icon name="X" />
        </button>
      </header>
      <fieldset>
        <legend>Status</legend>
        <div className="filter-choice-grid">
          {columns.map((column) => (
            <label key={column.id}>
              <input
                checked={filter.columnIds.includes(column.id)}
                onChange={() =>
                  onChange({
                    ...filter,
                    columnIds: toggled(filter.columnIds, column.id),
                  })
                }
                type="checkbox"
              />
              <span>{column.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Priority</legend>
        <div className="filter-choice-grid">
          {priorities.map((priority) => (
            <label key={priority.rank}>
              <input
                checked={filter.priorities.includes(priority.rank)}
                onChange={() =>
                  onChange({
                    ...filter,
                    priorities: toggled(filter.priorities, priority.rank),
                  })
                }
                type="checkbox"
              />
              <Icon name={priority.icon} />
              <span>{priority.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Quadrant</legend>
        <div className="filter-choice-grid">
          {quadrants.map((quadrant) => (
            <label key={quadrant.key}>
              <input
                checked={filter.quadrants.includes(quadrant.key)}
                onChange={() =>
                  onChange({
                    ...filter,
                    quadrants: toggled(filter.quadrants, quadrant.key),
                  })
                }
                type="checkbox"
              />
              <Icon name={quadrant.icon} />
              <span>{quadrant.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Labels</legend>
        <div className="filter-choice-grid">
          {labels.map((label) => (
            <label key={label.id}>
              <input
                checked={filter.labelIds.includes(label.id)}
                onChange={() =>
                  onChange({
                    ...filter,
                    labelIds: toggled(filter.labelIds, label.id),
                  })
                }
                type="checkbox"
              />
              <span>{label.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Assignee</legend>
        <div className="filter-choice-grid">
          {members.map((member) => (
            <label key={member.id}>
              <input
                checked={filter.assigneeIds.includes(member.id)}
                onChange={() =>
                  onChange({
                    ...filter,
                    assigneeIds: toggled(filter.assigneeIds, member.id),
                  })
                }
                type="checkbox"
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Due date</legend>
        <div className="filter-date-row">
          <label>
            From
            <input
              onChange={(event) =>
                onChange({ ...filter, dueFrom: event.target.value || null })
              }
              type="date"
              value={filter.dueFrom ?? ""}
            />
          </label>
          <label>
            To
            <input
              onChange={(event) =>
                onChange({ ...filter, dueTo: event.target.value || null })
              }
              type="date"
              value={filter.dueTo ?? ""}
            />
          </label>
        </div>
      </fieldset>
      <label className="completed-toggle">
        <input
          checked={filter.includeCompleted}
          onChange={(event) =>
            onChange({ ...filter, includeCompleted: event.target.checked })
          }
          type="checkbox"
        />
        Show completed {terminology.taskPlural.toLowerCase()}
      </label>
      <footer>
        <button
          className="secondary-button"
          onClick={() =>
            onChange({
              query: "",
              columnIds: [],
              labelIds: [],
              priorities: [],
              quadrants: [],
              assigneeIds: [],
              dueFrom: null,
              dueTo: null,
              includeCompleted: true,
            })
          }
          type="button"
        >
          Clear filters
        </button>
      </footer>
    </aside>
  );
}
