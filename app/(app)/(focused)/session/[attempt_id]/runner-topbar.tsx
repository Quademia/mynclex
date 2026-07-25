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
    </header>
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
        {clock.hidden ? '◌' : '◉'}
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
