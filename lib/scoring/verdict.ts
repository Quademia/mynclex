// mynclex/lib/scoring/verdict.ts
//
// The three-state verdict on one answered question: CORRECT / PARTIAL /
// WRONG. The single place the product decides which of the three a
// student's answer landed in.
//
// ⚠ DERIVED, NOT STORED — and deliberately so.
//
// The obvious alternative is a three-state column beside score_awarded.
// It was considered and rejected (2026-07-30, with Sam): score_awarded
// and marks_snapshot ALREADY determine the answer completely, so a
// stored verdict would be a third fact restating the first two, free to
// drift from them. That is the exact shape of the difficulty word stored
// beside the difficulty number, which did drift and cost a whole slice
// (CAT §5.5.2 / slice 10d) to unwind.
//
// It also leaves `is_correct` alone, which matters: that column is
// full-credit-only by design (bank-marks-and-scoring.html §5.5) and is
// read by 57 TS files and 24 SQL files — accuracy percentages, the
// progress engine, tutor cohort analytics, the CAT ability estimate.
// Those readers want the strict flag they have. Only the DISPLAY needed
// a third state, so only the display gained one.
//
// Why the display needed it: `is_correct` false + score_awarded 1 of 3
// rendered as the single word "wrong" next to the number "1 / 3" — the
// header and the score contradicting each other on one line, on 28% of
// submitted answers (199 of 715 on dev, 2026-07-30).

export type Verdict = 'CORRECT' | 'PARTIAL' | 'WRONG';

// score_awarded and marks_snapshot are both `numeric` in Postgres, so
// they arrive as JS numbers and an exact === on the full-marks boundary
// is a float comparison. Scores are whole numbers in practice (every
// scoring function sums 0/1 steps), but a tolerance costs one constant
// and removes a failure that would show a student "Partial credit" on a
// question they got completely right.
const EPSILON = 1e-9;

/**
 * Which of the three states one answered question landed in.
 *
 * @param scoreAwarded  the stored score; null (never graded) reads as WRONG,
 *                      preserving what the rationale block did before.
 * @param marksMax      the question's max marks (marks_snapshot).
 */
export function verdictFor(scoreAwarded: number | null, marksMax: number): Verdict {
  const score = scoreAwarded ?? 0;

  // A question with no marks is broken data, not a verdict — never call
  // it CORRECT on the strength of an empty rubric. Falls back to
  // "scored something / scored nothing", which is the most that can
  // honestly be said without a maximum to compare against.
  if (!(marksMax > 0)) return score > 0 ? 'CORRECT' : 'WRONG';

  if (score <= 0)                    return 'WRONG';
  if (score >= marksMax - EPSILON)   return 'CORRECT';
  return 'PARTIAL';
}

/** Student-facing label for each state. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  CORRECT: 'Correct',
  PARTIAL: 'Partial credit',
  WRONG:   'Wrong',
};
