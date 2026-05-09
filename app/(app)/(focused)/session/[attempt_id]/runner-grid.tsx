// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-grid.tsx
//
// Right-edge sticky question-grid panel (runner.html §16). Three-channel
// cell encoding (fill / marked border / current ring) per §16.4. Filter
// toggles use single-select per §16.6.
//
// Deferred for 4.1.2b:
//   • Case-grouping bands (slice 4.3) — band geometry math omitted; the
//     `caseGroups` data isn't surfaced yet.
//   • Auto-collapse / overlay-on-wrapper modes (slice 4.3 alongside cases).
//   • Mobile bottom-sheet variant (covered with the mobile slice).
//
// Cells are clickable → onPick(index). Filter toggles reset the visible
// subset; the cell layout doesn't reflow (visibility:hidden keeps shape).

'use client';

import type { AnswerRow } from '@/lib/practice/runner';
import { deriveCellFill, isVisibleUnderFilter } from '@/lib/practice/runner';
import type { GridFilter } from '@/lib/practice/runner';

interface CellSummary {
  attempt_item_id: string;
  position:        number;
}

interface Props {
  items:    CellSummary[];
  answers:  Map<string, AnswerRow>;
  marked:   Set<string>;
  current:  number;          // 0-indexed
  filter:   GridFilter;
  onPick:           (index: number) => void;
  onFilterChange:   (filter: GridFilter) => void;
  onCollapse?:      () => void;
}

export function RunnerGrid({
  items,
  answers,
  marked,
  current,
  filter,
  onPick,
  onFilterChange,
  onCollapse,
}: Props) {
  // Filter row counts — refreshed on every render; cheap for ≤75 cells.
  const filterCounts = {
    all:        items.length,
    marked:     0,
    unanswered: 0,
    wrong:      0,
  };
  for (const item of items) {
    const fill = deriveCellFill(answers.get(item.attempt_item_id));
    if (marked.has(item.attempt_item_id)) filterCounts.marked += 1;
    if (fill === 'unanswered' || fill === 'skipped') filterCounts.unanswered += 1;
    if (fill === 'wrong') filterCounts.wrong += 1;
  }

  return (
    <aside className="rn-grid" aria-label="Question grid">
      <div className="rn-grid-head">
        <div className="rn-grid-title-row">
          <div className="rn-grid-title">Question grid</div>
          {onCollapse && (
            <button
              type="button"
              className="rn-grid-collapse"
              onClick={onCollapse}
              aria-label="Collapse grid"
            >
              ›
            </button>
          )}
        </div>
        <div className="rn-grid-filters" role="tablist">
          {(
            [
              { id: 'all',        label: 'All',    n: filterCounts.all },
              { id: 'marked',     label: 'Marked', n: filterCounts.marked },
              { id: 'unanswered', label: 'Unans',  n: filterCounts.unanswered },
              { id: 'wrong',      label: 'Wrong',  n: filterCounts.wrong },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={'rn-grid-filter' + (filter === f.id ? ' on' : '')}
              onClick={() => onFilterChange(f.id)}
            >
              {f.label} {f.n}
            </button>
          ))}
        </div>
      </div>

      <div className="rn-grid-scroll">
        <div className="rn-cells">
          {items.map((item, idx) => {
            const fill   = deriveCellFill(answers.get(item.attempt_item_id));
            const isMrk  = marked.has(item.attempt_item_id);
            const hidden = !isVisibleUnderFilter(fill, isMrk, filter);
            const cls = [
              'rn-cell',
              `f-${fill}`,
              isMrk          && 'marked',
              idx === current && 'current',
              hidden          && 'hidden',
            ].filter(Boolean).join(' ');
            const label =
              `Question ${item.position}` +
              (fill !== 'unanswered' ? `, ${fill}` : '') +
              (isMrk ? ', marked' : '') +
              (idx === current ? ', current' : '');
            return (
              <button
                key={item.attempt_item_id}
                type="button"
                className={cls}
                onClick={() => onPick(idx)}
                aria-label={label}
              >
                {item.position}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rn-grid-legend" aria-hidden="true">
        <div className="row"><span className="swatch" /> Unanswered</div>
        <div className="row"><span className="swatch f-answered" /> Answered (pre-submit)</div>
        <div className="row"><span className="swatch f-right" /> Correct</div>
        <div className="row"><span className="swatch f-wrong" /> Wrong</div>
        <div className="row"><span className="swatch f-skipped" /> Skipped</div>
        <div className="row"><span className="swatch marked" /> Marked for review</div>
        <div className="row"><span className="swatch current" /> Current</div>
      </div>
    </aside>
  );
}


// Collapsed handle — shown in place of <RunnerGrid /> when the grid
// is closed. 4.1.2b ships this as a thin column with an expand button +
// vertical Q-counter (no auto-collapse logic; user-toggled only).
export function RunnerGridHandle({
  current,
  total,
  onExpand,
}: {
  current: number;        // 1-indexed
  total:   number;
  onExpand: () => void;
}) {
  return (
    <aside className="rn-grid-handle">
      <button type="button" onClick={onExpand} aria-label="Expand grid">‹</button>
      <button type="button" onClick={onExpand} aria-label="Open grid">⊞</button>
      <div className="vertical-counter">
        Q <strong>{current}</strong>/{total}
      </div>
    </aside>
  );
}
