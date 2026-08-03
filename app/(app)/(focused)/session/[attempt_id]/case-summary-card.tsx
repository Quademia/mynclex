// mynclex/app/(app)/(focused)/session/[attempt_id]/case-summary-card.tsx
//
// The phone stand-in for the case / trend panel (slice 4 of
// docs/product-plan/runner-mobile.md).
//
// On desktop the scenario and its chart tabs sit permanently beside the
// question in a `.rn-split`. That split needs 924px before it can lay out
// honestly, so on a phone the panel moves into a bottom sheet — and
// something has to stay in the question column saying what the question
// belongs to and how to get the chart back. This is that something.
//
// It is deliberately NOT a summary of the scenario. It carries the case's
// title, how far through its questions you are, and a way back to the
// chart — never the clinical detail itself, because a student must read
// that in the panel where the tabs and their reveal rules live, not from
// a paraphrase in the margin.
//
// ⚠ The title is SEALED during a live sitting (page.tsx, Pillar 2) — it
// names the diagnosis, which is the answer to the opening question. So
// `title` is optional here and the card must read correctly without it:
// the eyebrow ("Case study" / "Trend dataset"), the progress count and
// the View-chart button all still do their jobs. This card is the ONLY
// thing identifying the wrapper on a phone, which is why it is a fallback
// rather than a blank.

'use client';

interface Props {
  kind: 'case' | 'trend';
  /** Absent while the sitting is live — see the seal note above. */
  title?: string;
  /** Chart tabs in the panel — the button says how much is behind it. */
  tabCount: number;
  /** Cases only: position within the case block, e.g. 2 of 6 answered. */
  answered?: number;
  total?: number;
  /**
   * Cases only: the clinical-judgment step this question is testing, in
   * words. The desktop CJMM strip names all six across the top; six step
   * names cannot fit a phone row, so the strip collapses to dots (CSS) and
   * the current one is named here instead — once, in full.
   */
  cjmmStepLabel?: string;
  onOpen: () => void;
}

export function CaseSummaryCard({
  kind,
  title,
  tabCount,
  answered,
  total,
  cjmmStepLabel,
  onOpen,
}: Props) {
  const showProgress = kind === 'case' && answered != null && total != null;

  return (
    <div className="rn-case-summary">
      <div className="head">
        <span className="eyebrow">{kind === 'case' ? 'Case study' : 'Trend dataset'}</span>
        {showProgress && (
          <span className="count">{answered} of {total} answered</span>
        )}
      </div>

      {title ? <div className="title">{title}</div> : null}

      {cjmmStepLabel && <div className="step">{cjmmStepLabel}</div>}

      <div className="actions">
        <button type="button" className="open" onClick={onOpen}>
          View chart
        </button>
        <span className="tabs">
          {tabCount} {tabCount === 1 ? 'tab' : 'tabs'}
        </span>
      </div>
    </div>
  );
}
