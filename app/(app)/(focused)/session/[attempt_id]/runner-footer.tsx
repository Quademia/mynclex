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
  /**
   * Live Sequential + CAT: there is no Previous and no grid, ever. On a
   * PHONE the primary then takes the whole bar rather than sitting beside a
   * permanently dead 48px box (Sam, 2026-07-31 — a student is only in one
   * mode per sitting, so nothing ever "shifts" in front of them, and a
   * bigger Submit target matters most in exactly these modes).
   *
   * Desktop is untouched: it keeps the disabled button and the tooltip that
   * explains why. See docs/product-plan/runner-mobile.md.
   */
  forwardOnly?: boolean;
  /**
   * Opens the question grid sheet on compact. Omitted → no grid button,
   * which is both the desktop case and the forward-only case. Wired in
   * SLICE 2; until then nothing passes it and the button never renders,
   * so there is no dead control on the bar.
   */
  onOpenGrid?: () => void;
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
  forwardOnly     = false,
  onOpenGrid,
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
    <footer
      className={'rn-foot' + (forwardOnly ? ' rn-foot-fwd' : '')}
      data-coach="footer"
    >
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

      {/* Compact only — CSS hides it ≥900px, and it is rendered at all only
          where a grid exists. Lands wired in SLICE 2. */}
      {onOpenGrid && (
        <button
          type="button"
          className="rn-foot-grid"
          onClick={onOpenGrid}
          aria-label="Question grid"
        >
          <GridGlyph />
          <span className="n">{current}/{total ?? '–'}</span>
        </button>
      )}
    </footer>
  );
}

// Same four-square grid as the topbar's GridIcon, redrawn here rather than
// exported across files — the topbar's is one of a family of 14px stroke
// glyphs sized for that bar; this one sits above a counter in a 48px
// button. Keep them visually identical if either changes.
function GridGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}
