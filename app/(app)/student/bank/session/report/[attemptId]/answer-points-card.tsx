// Answer points — the finer reading behind "41 of 52".
//
// Counts MARKS rather than questions, which is why it differs from the
// percentage in the rail: a 13-mark bow-tie weighs thirteen times an MCQ here
// and exactly once in the item-equivalent average. Both readings belong on the
// page; the copy says which is which so neither looks like an error.
//
// The split comes from lib/scoring's pointsDetail(), shared with the readiness
// report. `unreadable` is surfaced rather than swallowed: if a question's
// frozen key can't be parsed it contributes its stored score instead of a
// split, and a partial reading must not be presented as a complete one.

import type { PointsSplit } from '@/lib/practice/report/derive';

export function AnswerPointsCard({
  split,
  totalQuestions,
}: {
  split: PointsSplit;
  totalQuestions: number;
}) {
  const pct = split.max > 0 ? Math.round((split.found / split.max) * 100) : 0;

  return (
    <section className="bsr-card">
      <h2 className="bsr-card-h">Answer points — what you caught</h2>
      <p className="bsr-card-sub">
        {split.max} scoreable points across {totalQuestions} questions
      </p>

      <div
        className="bsr-bar"
        role="img"
        aria-label={`${split.found} of ${split.max} answer points found`}
      >
        {split.found > 0 && (
          <span className="bsr-bar-seg bsr-bar-ok" style={{ flexGrow: split.found }} />
        )}
        {split.missed > 0 && (
          <span className="bsr-bar-seg bsr-bar-empty" style={{ flexGrow: split.missed }} />
        )}
      </div>

      <div className="bsr-trio">
        <div className="bsr-trio-cell">
          <p className="bsr-trio-n bsr-trio-ok">{split.found}</p>
          <p className="bsr-trio-label">correct answers found</p>
        </div>
        <div className="bsr-trio-cell">
          <p className="bsr-trio-n bsr-trio-warn">{split.missed}</p>
          <p className="bsr-trio-label">answers missed</p>
        </div>
        <div className="bsr-trio-cell">
          <p className="bsr-trio-n bsr-trio-bad">{split.wrongPicked}</p>
          <p className="bsr-trio-label">wrong picks</p>
        </div>
      </div>

      <p className="bsr-foot">
        Counts selection points, not questions — so this {pct}% and the
        percentage above it are two different readings of the same sitting.
        {split.unreadable > 0 && (
          <>
            {' '}
            {split.unreadable === 1
              ? 'One question'
              : `${split.unreadable} questions`}{' '}
            couldn&apos;t be split this way, so {split.unreadable === 1 ? 'it counts' : 'they count'}{' '}
            toward the total by score alone.
          </>
        )}
      </p>
    </section>
  );
}
