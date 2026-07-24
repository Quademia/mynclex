// mynclex/app/(app)/(focused)/session/[attempt_id]/runner-footer.tsx
//
// Runner footer (64px). Layout: [Prev] [Status msg] [Submit / Next / Finish]
//
// Prev is disabled in two cases:
//   - At Q1 (atFirst) — no question to go back to.
//   - Sequential archetype (slice 4.5b — `prevDisabled` from caller) —
//     the mode prohibits backward navigation regardless of position.
//
// The primary button label/handler/disabled-state is fully driven by
// runner.tsx's archetype-aware footer logic; this component just renders.

'use client';

interface Props {
  current:    number;     // 1-indexed
  /** NULL = adaptive length (CAT) — there is no known last question. */
  total:      number | null;
  modeMsg:    string;     // mode-aware status message
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryHint?: string;
  prevDisabled?: boolean; // Sequential mode forces this true (slice 4.5b)
  prevHint?:     string;  // tooltip when prevDisabled && !atFirst
  onPrev: () => void;
  onPrimary?: () => void;
}

export function RunnerFooter({
  current,
  total,
  modeMsg,
  primaryLabel    = 'Submit answer',
  primaryDisabled = true,
  // Fallback tooltip only — runner.tsx passes a real per-gate hint on every
  // branch. Was "MCQ wiring lands in slice 4.1.4", internal jargon that would
  // have surfaced to a student on any branch that forgot to pass one.
  primaryHint     = 'Answer the question to continue',
  prevDisabled    = false,
  prevHint,
  onPrev,
  onPrimary,
}: Props) {
  const atFirst = current <= 1;
  const atLast  = total !== null && current >= total;

  // Combined disable: at-first OR mode forces it.
  const prevIsDisabled = atFirst || prevDisabled;
  const prevTitle = prevIsDisabled
    ? (prevDisabled
        ? (prevHint ?? 'Disabled in this mode')
        : (atFirst ? 'You\'re on the first question' : undefined))
    : undefined;

  return (
    <footer className="rn-foot">
      <div className="rn-foot-side">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onPrev}
          disabled={prevIsDisabled}
          title={prevTitle}
        >
          ← Previous
        </button>
      </div>

      <div className="rn-foot-msg">{modeMsg}</div>

      {/* THIS component owns the arrow — callers pass the bare label. Three
          of runner.tsx's five labels used to bake one in ("Next →",
          "Submit & continue →") and got a second appended here, so the most
          common button in the runner rendered "Next → →" on every question
          but the last, in every mode. */}
      <div className="rn-foot-side right">
        <button
          type="button"
          className="btn btn-accent btn-sm"
          disabled={primaryDisabled}
          title={primaryDisabled ? primaryHint : undefined}
          onClick={onPrimary}
        >
          {primaryLabel}{atLast && !primaryDisabled ? '' : ' →'}
        </button>
      </div>
    </footer>
  );
}
