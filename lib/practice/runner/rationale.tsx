// mynclex/lib/bank/runner/rationale.tsx
//
// Shared rationale block. Rendered by the runner-question-area below
// the per-type component when an answer for the current item is
// available (UL post-submit hybrid in live mode, every item in review
// mode). Header carries the verdict pill + score; body carries the
// rationale text + image.
//
// Type-agnostic — every per-type runner shares it.
//
// ⚠ The header verdict does NOT come from `is_correct`. That column is
// full-credit-only (bank-marks-and-scoring.html §5.5), so a student who
// scored 1 of 3 was shown the word "wrong" beside the number "1 / 3" —
// two contradicting statements on one line, on 28% of submitted answers.
// It now derives all three states from the score, via the shared
// verdictFor(); see lib/scoring/verdict.ts for why that is derived
// rather than stored.

'use client';

import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc, isEmptyRichDoc } from '@/lib/authoring/rich-doc';
import { verdictFor, VERDICT_LABEL } from '@/lib/scoring';

interface Props {
  scoreAwarded: number;
  marksMax:     number;
  rationale:    string | null;
  rationaleImg: string | null;
  /**
   * Whether this block states the verdict and score itself.
   *
   * False in the runner, where the <ScoringStrip> directly above already
   * carries both (and more) — showing them twice, six pixels apart, is
   * how a screen stops being read. The tutor-library embeds, which have
   * no strip, leave it at the default and keep the header.
   */
  showVerdict?: boolean;
}

/** Verdict → the CSS modifier carrying its colour. */
const VERDICT_CLASS = {
  CORRECT: 'ok',
  PARTIAL: 'part',
  WRONG:   'no',
} as const;

export function RationaleBlock({
  scoreAwarded,
  marksMax,
  rationale,
  rationaleImg,
  showVerdict = true,
}: Props) {
  const verdict = verdictFor(scoreAwarded, marksMax);

  return (
    <div className="rn-rationale">
      <div className="rn-rationale-head">
        {showVerdict ? (
          <>
            <span className={'verdict ' + VERDICT_CLASS[verdict]}>
              Rationale · {VERDICT_LABEL[verdict].toLowerCase()}
            </span>
            <span className="score">
              {formatScore(scoreAwarded)} / {marksMax}
            </span>
          </>
        ) : (
          <span className="verdict">Rationale</span>
        )}
      </div>
      <div className="rn-rationale-body">
        {rationale && !isEmptyRichDoc(parseRichDoc(rationale)) ? (
          <RichRender doc={parseRichDoc(rationale)} />
        ) : (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No rationale was captured for this question.
          </p>
        )}
        {/* alt="" is a placeholder until a `rationale_img_alt` column +
            curator field land in a later slice. Acceptable for v1 dev;
            screen readers will skip the image entirely. */}
        {rationaleImg && (
          <img src={rationaleImg} alt="" className="rn-rationale-img" />
        )}
      </div>
    </div>
  );
}

// Strip trailing zeros so 1.0/1 reads as "1 / 1" rather than "1.0 / 1".
function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
