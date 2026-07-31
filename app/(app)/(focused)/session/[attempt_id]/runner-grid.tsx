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

/** Every filter, so counts are derived from one list rather than by hand. */
const ALL_FILTERS = [
  'all', 'flagged', 'todo', 'dropped',
  'right', 'partial', 'wrong', 'skipped', 'unanswered', 'answered',
] as const satisfies readonly GridFilter[];

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
  // One count per filter, refreshed on every render; cheap for ≤75 cells.
  //
  // Derived from isVisibleUnderFilter rather than counted by hand, so a
  // count can never disagree with what clicking it actually shows. The
  // old version tallied each filter with its own `if`, which is how a
  // tab comes to say 7 and then reveal 3.
  const counts = {} as Record<GridFilter, number>;
  for (const f of ALL_FILTERS) counts[f] = 0;
  for (const item of items) {
    const fill = deriveCellFill(
      answers.get(item.attempt_item_id),
      item.marks_snapshot,
      revealCorrectness,
    );
    const isFlg = flagged.has(item.attempt_item_id);
    for (const f of ALL_FILTERS) {
      if (isVisibleUnderFilter(fill, isFlg, f)) counts[f] += 1;
    }
  }

  // Clicking the active filter again clears it — the only way back to
  // "All" without hunting for the All button, and what a pressed control
  // is expected to do.
  const pick = (f: GridFilter) => onFilterChange(filter === f ? 'all' : f);

  const showOutcome = revealCorrectness;

  /**
   * Spoken name for a key row.
   *
   * ⚠ Explicit rather than left to name-from-content. The label and the
   * count are two nested spans with no whitespace between them, so the
   * computed name would be "Correct3" — and whether a browser inserts a
   * separator there is exactly the kind of thing that differs between
   * them. Saying it outright also lets the count be a phrase ("3
   * questions") instead of a loose digit.
   */
  const rowLabel = (label: string, n: number) =>
    `${label} — ${n} ${n === 1 ? 'question' : 'questions'}`;

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
        {/* Progress rail. Three buttons that mean the same thing in every
         *  mode — no correctness here, so nothing needs gating. "Wrong"
         *  used to sit in this row and was the one exception; it moved to
         *  the key below, where outcome belongs. */}
        <div className="rn-grid-filters" data-coach="gridfilters">
          {([
            { id: 'all',     label: 'All' },
            // "Flagged", not "Marked" — this is the per-sitting flag, and
            // "marks" already means points elsewhere in the product (§4).
            { id: 'flagged', label: 'Flagged' },
            // Never-reached AND deliberately passed over. One question:
            // what do I still owe?
            { id: 'todo',    label: 'To do' },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              className={'rn-grid-filter' + (filter === f.id ? ' on' : '')}
              onClick={() => pick(f.id)}
            >
              {f.label} {counts[f.id]}
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

      {/* The colour key IS the outcome filter. It used to be decorative
       *  (aria-hidden) and sat beside a tab rail listing the same words —
       *  one vocabulary rendered twice, of which only some was clickable.
       *  Now each row explains a colour AND shows you those questions,
       *  which is what finally gives partial credit a filter of its own.
       *
       *  ⚠ Every row is a real <button> with aria-pressed. The old block
       *  was hidden from screen readers on purpose, being decoration; a
       *  control cannot be. */}
      <div className="rn-grid-legend" data-coach="legend">
        <div className="rn-grid-legend-head" id="rn-grid-legend-head">
          What the colours mean — tap one to filter
        </div>

        {showOutcome && (
          /* Two swatches, because it covers two states. Keeps the row a
           * colour key rather than a query bolted onto one — and says
           * what it means by showing it. */
          <button
            type="button"
            aria-pressed={filter === 'dropped'}
            aria-label={rowLabel('Dropped marks, wrong and partial together', counts.dropped)}
            className={'row act' + (filter === 'dropped' ? ' on' : '')}
            onClick={() => pick('dropped')}
          >
            <span className="swatch-pair" aria-hidden="true">
              <span className="swatch f-partial" />
              <span className="swatch f-wrong" />
            </span>
            <span className="lbl">Dropped marks</span>
            <span className="n">{counts.dropped}</span>
          </button>
        )}

        {([
          { id: 'unanswered', cls: '',           label: 'Unanswered', show: true },
          { id: 'answered',   cls: 'f-answered', label: 'Answered',   show: !showOutcome },
          { id: 'right',      cls: 'f-right',    label: 'Correct',        show: showOutcome },
          { id: 'partial',    cls: 'f-partial',  label: 'Partial credit', show: showOutcome },
          { id: 'wrong',      cls: 'f-wrong',    label: 'Wrong',          show: showOutcome },
          { id: 'skipped',    cls: 'f-skipped',  label: 'Skipped',        show: showOutcome },
          { id: 'flagged',    cls: 'marked',     label: 'Flagged for review', show: true },
        ] as const).filter((r) => r.show).map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={filter === r.id}
            aria-label={rowLabel(r.label, counts[r.id])}
            className={'row act' + (filter === r.id ? ' on' : '')}
            onClick={() => pick(r.id)}
          >
            <span className={'swatch ' + r.cls} aria-hidden="true" />
            <span className="lbl">{r.label}</span>
            <span className="n">{counts[r.id]}</span>
          </button>
        ))}

        {/* Not a button: "current" is a POSITION, not a result, so there
         *  is nothing to filter to. It stays because the teal ring is a
         *  real signal on screen and dropping the row would leave it
         *  unexplained — a plain line costs less than that. */}
        <div className="row inert">
          <span className="swatch current" aria-hidden="true" />
          <span className="lbl">Current</span>
        </div>
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
