// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-grid.tsx
//
// Right-edge sticky question-grid panel (runner.html §16). Three-channel
// cell encoding (fill / marked border / current ring) per §16.4. Filter
// toggles use single-select per §16.6.
//
// Slice 4.3 added case-grouping bands — subtle tinted rectangles behind
// case-clustered cells. No labels (visual grouping only, per spec §16.4).
// Bands wrap across grid rows when a case straddles a 5-column boundary.
//
// Deferred:
//   • Auto-collapse / overlay-on-wrapper modes (slice 4.3 decision: no
//     auto-collapse — manual control only).
//   • Mobile bottom-sheet variant (covered with the mobile slice).
//
// Cells are clickable → onPick(index). Filter toggles reset the visible
// subset; the cell layout doesn't reflow (visibility:hidden keeps shape).

'use client';

import type { AnswerRow } from '@/lib/practice/runner';
import { deriveCellFill, FILL_LABEL, isVisibleUnderFilter } from '@/lib/practice/runner';
import type { GridFilter } from '@/lib/practice/runner';

interface CellSummary {
  attempt_item_id: string;
  position:        number;
  /** Needed to tell a PARTIAL score from a full one: the answer row
   *  carries the score, but the maximum lives on the item. */
  marks_snapshot:  number;
}

// One contiguous run of case-child cells. `from` / `to` are 0-indexed
// positions in the items array — i.e. cell column-major indices in the
// grid. Each run renders as one or more `.rn-case-band` rectangles
// (multiple if the run wraps grid rows).
export interface CaseGroup {
  caseId: string;
  from:   number;
  to:     number;
}

interface Props {
  items:       CellSummary[];
  answers:     Map<string, AnswerRow>;
  /** Flagged-for-review, keyed by ATTEMPT_ITEM_ID — per sitting, starts
   *  empty each time. Not bookmarks: those are keyed by item_id and
   *  persist across sittings (flag-and-bookmark.md §3.8). */
  flagged:     Set<string>;
  current:     number;          // 0-indexed
  filter:      GridFilter;
  caseGroups?: readonly CaseGroup[];
  // Slice 4.5c: gate per-cell correctness rendering. True for UL live
  // and any review-state mode; false for Free-batched + Sequential
  // mid-quiz (rationale + correctness deferred until Finish).
  revealCorrectness: boolean;
  onPick:           (index: number) => void;
  onFilterChange:   (filter: GridFilter) => void;
  onCollapse?:      () => void;
}

// Grid layout constants — kept in sync with --rn-cell / --rn-cell-gap
// in styles/runner.css. Hard-coded here so band geometry is computed
// without a layout-effect read-back. If those tokens change, update
// these too.
const CELL = 36;
const GAP  = 5;
const COLS = 5;
const PAD  = 4;   // visual breathing room around the band edge

interface BandRect {
  key:    string;
  left:   number;
  top:    number;
  width:  number;
  height: number;
}

// Split a contiguous case run into one rectangle per grid row it
// touches. A 6-cell case starting at column 3 of a 5-col grid spans
// row 0 (cols 3-4) + row 1 (cols 0-3) → two rects.
function bandsFor(group: CaseGroup): BandRect[] {
  const rects: BandRect[] = [];
  let i = group.from;
  let n = 0;
  while (i <= group.to) {
    const row     = Math.floor(i / COLS);
    const fromCol = i - row * COLS;
    const rowEnd  = Math.min(group.to, (row + 1) * COLS - 1);
    const toCol   = rowEnd - row * COLS;
    const span    = toCol - fromCol + 1;
    rects.push({
      key:    `${group.caseId}-${n}`,
      left:   fromCol * (CELL + GAP) - PAD,
      top:    row     * (CELL + GAP) - PAD,
      width:  span * CELL + (span - 1) * GAP + 2 * PAD,
      height: CELL + 2 * PAD,
    });
    i = rowEnd + 1;
    n += 1;
  }
  return rects;
}

export function RunnerGrid({
  items,
  answers,
  flagged,
  current,
  filter,
  caseGroups,
  revealCorrectness,
  onPick,
  onFilterChange,
  onCollapse,
}: Props) {
  // Filter row counts — refreshed on every render; cheap for ≤75 cells.
  const filterCounts = {
    all:        items.length,
    flagged:    0,
    unanswered: 0,
    wrong:      0,
  };
  for (const item of items) {
    const fill = deriveCellFill(
      answers.get(item.attempt_item_id),
      item.marks_snapshot,
      revealCorrectness,
    );
    if (flagged.has(item.attempt_item_id)) filterCounts.flagged += 1;
    if (fill === 'unanswered' || fill === 'skipped') filterCounts.unanswered += 1;
    // Counts WRONG only — a partial answer is not swept in here. See
    // isVisibleUnderFilter for why.
    if (fill === 'wrong') filterCounts.wrong += 1;
  }

  return (
    <aside className="rn-grid" aria-label="Question grid" data-coach="grid">
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
        <div className="rn-grid-filters" role="tablist" data-coach="gridfilters">
          {(
            [
              { id: 'all',        label: 'All',    n: filterCounts.all,        show: true },
              // "Flagged", not "Marked" — this is the per-sitting flag, and
              // "marks" already means points elsewhere in the product (§4).
              { id: 'flagged',    label: 'Flagged', n: filterCounts.flagged,   show: true },
              { id: 'unanswered', label: 'Unans',  n: filterCounts.unanswered, show: true },
              // Wrong filter only meaningful when correctness is revealed
              // (UL live, or any review state). In batched live modes the
              // count would always be 0 and clicking it would empty the grid.
              { id: 'wrong',      label: 'Wrong',  n: filterCounts.wrong,      show: revealCorrectness },
            ] as const
          ).filter((f) => f.show).map((f) => (
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
          {/* Case bands — absolute-positioned rectangles behind the
              cells. Render before the cells so they sit underneath in
              source order; .rn-cell { z-index: 1 } keeps them above. */}
          {caseGroups?.flatMap((g) => bandsFor(g)).map((b) => (
            <div
              key={b.key}
              className="rn-case-band"
              style={{
                left:   b.left,
                top:    b.top,
                width:  b.width,
                height: b.height,
              }}
              aria-hidden="true"
            />
          ))}

          {items.map((item, idx) => {
            const fill   = deriveCellFill(
              answers.get(item.attempt_item_id),
              item.marks_snapshot,
              revealCorrectness,
            );
            const isFlg  = flagged.has(item.attempt_item_id);
            const hidden = !isVisibleUnderFilter(fill, isFlg, filter);
            const cls = [
              'rn-cell',
              `f-${fill}`,
              // CSS class stays `.marked` — it is the border channel's
              // long-standing selector and renaming it would touch the
              // legend, the tutorial's copied stylesheet and the cell
              // rules for no user-visible gain. The DATA is the flag.
              isFlg          && 'marked',
              idx === current && 'current',
              hidden          && 'hidden',
            ].filter(Boolean).join(' ');
            // Spoken words, not the raw fill token: a screen reader
            // would otherwise say "partial", which does not say partial
            // WHAT. The colour and the word have to move together.
            const label =
              `Question ${item.position}` +
              (fill !== 'unanswered' ? `, ${FILL_LABEL[fill]}` : '') +
              (isFlg ? ', flagged for review' : '') +
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

      <div className="rn-grid-legend" aria-hidden="true" data-coach="legend">
        <div className="row"><span className="swatch" /> Unanswered</div>
        <div className="row"><span className="swatch f-answered" /> Answered</div>
        {revealCorrectness && (
          <>
            <div className="row"><span className="swatch f-right" /> Correct</div>
            <div className="row"><span className="swatch f-partial" /> Partial credit</div>
            <div className="row"><span className="swatch f-wrong" /> Wrong</div>
            <div className="row"><span className="swatch f-skipped" /> Skipped</div>
          </>
        )}
        <div className="row"><span className="swatch marked" /> Flagged for review</div>
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
  /** NULL = adaptive length (CAT). */
  total:   number | null;
  onExpand: () => void;
}) {
  return (
    <aside className="rn-grid-handle">
      <button type="button" onClick={onExpand} aria-label="Expand grid">‹</button>
      <button type="button" onClick={onExpand} aria-label="Open grid">⊞</button>
      <div className="vertical-counter">
        Q <strong>{current}</strong>{total === null ? null : <>/{total}</>}
      </div>
    </aside>
  );
}
