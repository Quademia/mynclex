// mynclex/lib/bank/runner/rationale.tsx
//
// Shared rationale block. Rendered by the runner-question-area below
// the per-type component when an answer for the current item is
// available (UL post-submit hybrid in live mode, every item in review
// mode). Header carries the verdict pill + score; body carries the
// rationale text + image.
//
// Type-agnostic — every per-type runner shares it.

'use client';

interface Props {
  isCorrect:    boolean;
  scoreAwarded: number;
  marksMax:     number;
  rationale:    string | null;
  rationaleImg: string | null;
}

export function RationaleBlock({
  isCorrect,
  scoreAwarded,
  marksMax,
  rationale,
  rationaleImg,
}: Props) {
  return (
    <div className="rn-rationale">
      <div className="rn-rationale-head">
        <span className={'verdict ' + (isCorrect ? 'ok' : 'no')}>
          Rationale · {isCorrect ? 'correct' : 'wrong'}
        </span>
        <span className="score">
          {formatScore(scoreAwarded)} / {marksMax}
        </span>
      </div>
      <div className="rn-rationale-body">
        {rationale ? (
          <p>{rationale}</p>
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
