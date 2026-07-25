// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-topbar.tsx
//
// Runner topbar (56px). Layout:
//   [Exit] | [Title + meta] [spacer] [Counter] [Clock + eye-icon] [Mark]
//
// Clock pill (slice 4.5a — runner.html §8):
//   • In review mode: clock prop is null and statusLabel renders the
//     final-score string ("Score · 67%") in the existing placeholder pill.
//   • In live mode: clock prop holds the tick state (stopwatch for untimed,
//     countdown for timed) + warning tier + hide-toggle state. Pill renders
//     the formatted display + tone class; eye-icon button next to it
//     toggles visibility (locks once first warning fires per §8.5).
//
// Mark button — visual only, disabled with tooltip; toggle wiring lands
// in slice 4.7 (mark-for-review).

'use client';

import type { WarningTier } from '@/lib/practice/runner/clock';

interface CaseMeta {
  caseIndex:    number;   // 1-indexed (e.g. 1st of 3 cases)
  caseTotal:    number;
  cjmmStep:     number;   // 1..6 (step index within the case)
  cjmmStepLabel: string;  // e.g. "Analyse cues"
}

export interface ClockProps {
  mode:         'stopwatch' | 'countdown';
  display:      string;          // "14:32" or "1:00:00"
  tier:         WarningTier | null;
  hidden:       boolean;         // true → pill collapses; eye-icon stays
  canHide:      boolean;         // false once any tier fires
  onToggleHide: () => void;
}

interface Props {
  // "Study session" / "Exam session" — the intent frame. Computed in
  // runner.tsx (which owns the copy) so the topbar stays presentational.
  sessionTitle: string;
  modeLabel:   string;
  current:     number;          // 1-indexed for display
  /**
   * NULL = length unknown, so show the current question only.
   * CAT passes null: the exam runs 85-150 questions and stops when it is
   * confident, so there is no total to show and a running "Q 12 / 12" would
   * be actively misleading (bank-consumption-cat.html §16.1).
   */
  total:       number | null;
  marked:      boolean;
  statusLabel: string;          // "Score · 67%" in review (live ignores)
  caseMeta?:   CaseMeta;
  // Live-mode clock state. Null in review mode (statusLabel renders
  // instead). Populated in live mode regardless of timed-vs-untimed.
  clock?:      ClockProps | null;
  // Slice 3a — handler for the ← Exit click. Runner decides whether to
  // navigate immediately (review mode) or open a confirmation modal
  // first (live mode, attempt in-progress). Topbar just calls it.
  onExit:      () => void;
  // Slice 3a — reopen the results popup from review mode. Non-null
  // only in review; null in live (the pill just shows the clock).
  // When non-null the status pill becomes a button.
  onPillClick?: (() => void) | null;
  // Topbar show/hide toggle for the question grid — mirrors the clock's
  // eye toggle so both panels have an obvious, always-visible control.
  // null in modes where the grid doesn't exist (live Sequential / CAT),
  // so the toggle comes and goes with the grid itself.
  gridToggle?: { open: boolean; onToggle: () => void } | null;
  // Topbar toggle for the on-screen calculator. Always present — the
  // calculator is a real NCLEX tool available in EVERY mode (study + exam,
  // live + review), so unlike the grid it never comes and goes.
  calcToggle: { open: boolean; onToggle: () => void };
}

export function RunnerTopbar({
  sessionTitle,
  modeLabel,
  current,
  total,
  marked,
  statusLabel,
  caseMeta,
  clock,
  onExit,
  onPillClick,
  gridToggle,
  calcToggle,
}: Props) {
  return (
    <header className="rn-top">
      <button
        type="button"
        className="rn-top-exit"
        onClick={onExit}
      >
        ← Exit
      </button>

      <div className="rn-top-divider" />

      <div className="rn-top-title">
        <div className="name">{sessionTitle}</div>
        <div className="meta">
          <span>{modeLabel}</span>
          <span className="dot" />
          <span>{total === null ? 'Adaptive length' : `${total} questions`}</span>
          {caseMeta && (
            <>
              <span className="dot" />
              <span>Case {caseMeta.caseIndex} of {caseMeta.caseTotal}</span>
              <span className="dot" />
              <span>CJMM step {caseMeta.cjmmStep} of 6 · {caseMeta.cjmmStepLabel}</span>
            </>
          )}
        </div>
      </div>

      <div className="rn-top-spacer" />

      <div className="rn-counter">
        Q <strong>{current}</strong>
        {total !== null && (
          <>
            <span style={{ color: 'var(--text-faint)' }}>/</span>
            <strong>{total}</strong>
          </>
        )}
      </div>

      {clock ? (
        <ClockGroup clock={clock} />
      ) : onPillClick ? (
        <button
          type="button"
          className="rn-timer untimed rn-timer-btn"
          onClick={onPillClick}
          title="Show results"
        >
          {statusLabel}
        </button>
      ) : (
        <div className="rn-timer untimed">{statusLabel}</div>
      )}

      <button
        type="button"
        className={'rn-mark-btn' + (marked ? ' on' : '')}
        disabled
        // The button is a placeholder until the marking table is wired
        // (BUILD_LIST 4.7). The tooltip said "Mark-for-review · slice 4.7" —
        // our build vocabulary, shown to a student hovering a dead control.
        title="Marking questions for review isn’t available yet"
      >
        ⚑ {marked ? 'Marked' : 'Mark'}
      </button>

      <button
        type="button"
        className={'rn-calc-btn' + (calcToggle.open ? ' on' : '')}
        onClick={calcToggle.onToggle}
        aria-pressed={calcToggle.open}
        aria-label={calcToggle.open ? 'Hide calculator' : 'Show calculator'}
        title={calcToggle.open ? 'Hide calculator' : 'Calculator'}
      >
        <CalcIcon />
        <span className="rn-calc-btn-label">Calc</span>
      </button>

      {gridToggle && (
        <button
          type="button"
          className={'rn-grid-toggle-btn' + (gridToggle.open ? ' on' : '')}
          onClick={gridToggle.onToggle}
          aria-pressed={gridToggle.open}
          aria-label={gridToggle.open ? 'Hide question grid' : 'Show question grid'}
          title={gridToggle.open ? 'Hide grid' : 'Show grid'}
        >
          {gridToggle.open ? <GridIcon /> : <GridOffIcon />}
          <span className="rn-grid-toggle-label">Grid</span>
        </button>
      )}
    </header>
  );
}

// A compact calculator glyph for the topbar toggle — a rounded body, a
// display strip, and a 3×… key grid, drawn in the same stroke style as the
// grid/clock icons so the three topbar toggles read as one family.
function CalcIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="1.5" width="10" height="13" rx="1.6" />
      <rect x="5" y="3.5" width="6" height="2.5" rx="0.5" />
      <line x1="5.5" y1="9" x2="5.5" y2="9" />
      <line x1="8" y1="9" x2="8" y2="9" />
      <line x1="10.5" y1="9" x2="10.5" y2="9" />
      <line x1="5.5" y1="11.5" x2="5.5" y2="11.5" />
      <line x1="8" y1="11.5" x2="8" y2="11.5" />
      <line x1="10.5" y1="11.5" x2="10.5" y2="11.5" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

// Same grid with a diagonal slash — shown when the grid is hidden, mirroring
// the clock toggle's plain/slashed pair so both topbar toggles read the same.
function GridOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
      <line x1="1.5" y1="1.5" x2="14.5" y2="14.5" />
    </svg>
  );
}

// Clock visibility toggle — a clock face when the clock is showing, the
// same face with a slash when it's hidden. Names the subject (the clock),
// which a bare eye did not. Replaces the old ◉/◌ glyphs.
function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function ClockOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
      <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
    </svg>
  );
}


function ClockGroup({ clock }: { clock: ClockProps }) {
  const tierClass = clock.tier === null ? '' : ` tier-${clock.tier}`;

  return (
    <div className="rn-clock-wrap">
      <button
        type="button"
        className={'rn-clock-eye' + (clock.canHide ? '' : ' locked')}
        onClick={clock.onToggleHide}
        disabled={!clock.canHide}
        aria-label={clock.hidden ? 'Show clock' : 'Hide clock'}
        title={
          !clock.canHide
            ? 'Clock visibility locked — warning fired'
            : clock.hidden
              ? 'Show clock'
              : 'Hide clock'
        }
      >
        {clock.hidden ? <ClockOffIcon /> : <ClockIcon />}
      </button>

      {!clock.hidden && (
        <div
          className={'rn-clock-pill ' + clock.mode + tierClass}
          aria-label={
            clock.mode === 'countdown'
              ? `Time remaining ${clock.display}`
              : `Time elapsed ${clock.display}`
          }
        >
          <span className="time">{clock.display}</span>
          {clock.tier === 1 && <span className="label">1 min left</span>}
        </div>
      )}
    </div>
  );
}
