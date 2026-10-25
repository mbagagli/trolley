import { useEffect, useRef, useState, type CSSProperties } from "react";

import { priorityLevel } from "../domain/priority";
import type { PriorityLevel, PriorityRank } from "../domain/types";
import { Icon } from "./Icon";

interface PriorityBadgeProps {
  value: PriorityRank;
  levels: PriorityLevel[];
  onChange: (value: PriorityRank) => void;
  compact?: boolean;
}

export function PriorityBadge({
  value,
  levels,
  onChange,
  compact = false,
}: PriorityBadgeProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const level = priorityLevel(levels, value);
  const style = { "--priority-color": level.color } as CSSProperties;

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="priority-control" ref={rootRef} style={style}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={compact ? "priority-badge compact" : "priority-badge"}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        title={`Priority: ${level.name}`}
        type="button"
      >
        <Icon name={level.icon} size={compact ? 13 : 15} />
        <span>{level.name}</span>
      </button>
      {open ? (
        <div className="priority-menu" role="listbox">
          {[...levels].sort((left, right) => left.rank - right.rank).map(
            (candidate) => (
              <button
                aria-selected={candidate.rank === value}
                className="priority-option"
                key={candidate.rank}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(candidate.rank);
                  setOpen(false);
                }}
                role="option"
                style={
                  { "--priority-color": candidate.color } as CSSProperties
                }
                type="button"
              >
                <Icon name={candidate.icon} size={14} />
                <span>{candidate.name}</span>
                {candidate.rank === value ? <Icon name="Check" /> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
