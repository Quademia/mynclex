// mynclex/app/(app)/student/bank/practice/axis.tsx
//
// One content-filter axis: chevron header + check-all link + checkbox
// grid. Used 7+ times in section-content (CNC, Subcategory, Subject,
// Body System, Question Type, Difficulty, Tags). Topic/Subtopic uses
// a different shape (search box + chip cloud) — not built on this.
//
// Smart-link behaviour: pass `linkedTo(id) => boolean` to dim+disable
// rows whose parent isn't selected. The Subcategory and Body System
// axes use this; the others don't pass it.

'use client';

import { useState, type ReactNode } from 'react';

interface AxisOption {
  id: string;
  label: string;
}

interface AxisProps {
  name: string;
  items: readonly AxisOption[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onCheckAll: (next: boolean) => void;
  /** Optional smart-link predicate. Returning false dims+disables the row. */
  linkedTo?: (id: string) => boolean;
  /** Optional pill text shown next to the axis name when linked. */
  hint?: ReactNode;
  defaultOpen?: boolean;
  /** Indented child axis (Subcategory under CNC, Body System under Subject). */
  indent?: boolean;
  /**
   * Per-row counts from nclex_filter_breakdown. If provided, each row
   * label gets a faint right-aligned count appended ("· 470"). Counts
   * are "what you'd get if you ticked this value, holding other
   * filters constant" — see the breakdown migration for semantics.
   * Pass `undefined` while the breakdown is loading.
   */
  counts?: Record<string, number>;
}

export function Axis({
  name,
  items,
  selected,
  onToggle,
  onCheckAll,
  linkedTo,
  hint,
  defaultOpen = true,
  indent = false,
  counts,
}: AxisProps) {
  const [open, setOpen] = useState(defaultOpen);

  // "Check all" considers smart-link: clicking it only checks the rows
  // currently un-dimmed (per design spec).
  const visibleItems = linkedTo ? items.filter((it) => linkedTo(it.id)) : items;
  const allOn = visibleItems.length > 0 && visibleItems.every((it) => selected.has(it.id));
  const anyOn = items.some((it) => selected.has(it.id));

  return (
    <div className={'bk-axis' + (indent ? ' indent' : '')}>
      <div className="bk-axis-head">
        <button
          type="button"
          className="bk-axis-head-l"
          onClick={() => setOpen((o) => !o)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
        >
          <Chevron open={open} />
          <span className="bk-axis-name">{name}</span>
          {hint && <span className="bk-axis-hint">{hint}</span>}
          <span className="bk-axis-meta">
            {anyOn
              ? `${[...selected].filter((id) => items.some((it) => it.id === id)).length} of ${items.length}`
              : `any of ${items.length}`}
          </span>
        </button>
        {open && (
          <button
            type="button"
            className="bk-checkall"
            onClick={() => onCheckAll(!allOn)}
          >
            {allOn ? 'Clear all' : 'Check all'}
          </button>
        )}
      </div>
      {open && (
        <div className="bk-checks">
          {items.map((it) => {
            const isOn = selected.has(it.id);
            const isLinked = linkedTo ? !linkedTo(it.id) : false;
            // Show count whenever the breakdown has loaded — including
            // 0, which is informative ("ticking this would yield zero").
            const cnt = counts ? (counts[it.id] ?? 0) : null;
            return (
              <label
                key={it.id}
                className={'bk-check' + (isLinked ? ' linked' : '')}
                title={isLinked ? 'Hidden by parent selection — clear parent or check parent first' : undefined}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={isLinked}
                  onChange={() => onToggle(it.id)}
                />
                <span className="lbl">{it.label}</span>
                {cnt !== null && (
                  <span className="bk-check-count">{cnt.toLocaleString()}</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={'bk-chev' + (open ? ' open' : '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
