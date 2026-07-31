// mynclex/lib/practice/runner/cell-state.ts
//
// Pure helpers for the question-grid cell state (runner.html §16.4).
// Three orthogonal channels:
//
//   • Fill   — 6 states encoded by (submission_status, score, marks).
//   • Border — FLAGGED for review. Per-sitting, so this module takes a
//              Set<attempt_item_id>. ⚠ The old comment here said it
//              resolved against nclex_question_marks; that was never
//              true and would have been the wrong table anyway — marks
//              are (student, question) and outlive the sitting. The
//              flag lives on nclex_attempt_items.is_flagged. See
//              docs/product-plan/flag-and-bookmark.md §3.8.
//   • Ring   — current cell (the index the student is on now).
//
// Slice 4.5c: `revealCorrectness` gates the right/wrong fills. Set it
// `true` for UL live mode (per-Q feedback) and any review-state mode
// (data.mode === 'review'); set it `false` for Free-batched and
// Sequential live mode where rationale + correctness are deferred to
// the end-of-quiz review per runner.html §15. When false, SUBMITTED /
// AUTO_SUBMITTED rows render as 'answered' (neutral blue) regardless
// of the score — the data is still on the row, just not surfaced.
// SKIPPED stays 'skipped' since it carries no correctness signal anyway.
//
// ⚠ The fill needs the question's MAX marks, not just the answer row.
// score_awarded alone distinguishes zero from non-zero; it takes
// marks_snapshot (which lives on the ITEM, not the answer) to tell a
// partial score from a full one. The verdict itself is not decided
// here — it comes from the shared verdictFor(), so the cell and the
// review scoring strip cannot disagree about the same answer.
//
// Kept side-effect-free so tests can call it directly without mocking.

import { verdictFor } from '@/lib/scoring';
import type { AnswerRow, CellFill } from './types';

export function deriveCellFill(
  answer:            AnswerRow | undefined,
  marksMax:          number,
  revealCorrectness: boolean = true,
): CellFill {
  if (!answer) return 'unanswered';
  if (answer.submission_status === 'SKIPPED') return 'skipped';
  if (answer.submission_status === 'DRAFT')   return 'answered';
  // SUBMITTED or AUTO_SUBMITTED: verdict known on the row, but only
  // surfaced when the runner state allows it.
  if (!revealCorrectness)         return 'answered';
  // An ungraded row has no verdict to show — not a zero, an absence.
  if (answer.score_awarded === null && answer.is_correct === null) return 'answered';

  switch (verdictFor(answer.score_awarded, marksMax)) {
    case 'CORRECT': return 'right';
    case 'PARTIAL': return 'partial';
    case 'WRONG':   return 'wrong';
  }
}

/** The word a screen reader hears for each fill. */
export const FILL_LABEL: Record<CellFill, string> = {
  unanswered: 'unanswered',
  answered:   'answered',
  right:      'correct',
  // Not the bare fill name: "partial" alone does not say partial WHAT.
  partial:    'partial credit',
  wrong:      'wrong',
  skipped:    'skipped',
};

/**
 * Everything the grid can be narrowed to.
 *
 * Two groups, and the split is the point:
 *
 *   • PROGRESS — `all`, `flagged`, `todo`. What the student still has to
 *     deal with. True in every mode, which is why none of them needs a
 *     correctness condition.
 *   • OUTCOME — `dropped` plus one per fill. Only offered once results
 *     are visible.
 *
 * `wrong` used to live in the progress rail, and was the single
 * correctness idea in a control about progress — which is exactly why it
 * alone needed gating. Moving it out let the rail become three buttons
 * that mean the same thing everywhere.
 */
export type GridFilter =
  // progress
  | 'all'
  | 'flagged'
  | 'todo'
  // outcome
  | 'dropped'
  | 'right'
  | 'partial'
  | 'wrong'
  | 'skipped'
  | 'unanswered'
  | 'answered';

export function isVisibleUnderFilter(
  fill:      CellFill,
  isFlagged: boolean,
  filter:    GridFilter,
): boolean {
  switch (filter) {
    case 'all':     return true;
    case 'flagged': return isFlagged;

    // "Still to do" covers never-reached AND deliberately passed over.
    // Two different states, one question: what do I still owe? Kept
    // together because that is how a student asks it mid-sitting.
    case 'todo':    return fill === 'unanswered' || fill === 'skipped';

    // "Dropped marks" — wrong AND partial. The most common thing a
    // student wants after a sitting, and unreachable without it: the two
    // are separate states now, and single-select cannot union them.
    // ⚠ NOT a way to call partial answers wrong again. The two keep
    // their own rows, their own colours and their own counts; this is a
    // third question asked over both, named for what it actually means.
    case 'dropped': return fill === 'wrong' || fill === 'partial';

    // One per fill. `wrong` means WRONG, not "less than full marks" —
    // calling a partial answer wrong is the conflation the three-state
    // verdict exists to remove.
    case 'right':      return fill === 'right';
    case 'partial':    return fill === 'partial';
    case 'wrong':      return fill === 'wrong';
    case 'skipped':    return fill === 'skipped';
    case 'unanswered': return fill === 'unanswered';
    case 'answered':   return fill === 'answered';
  }
}

/** Filters that describe an OUTCOME, so are hidden until results show. */
export const OUTCOME_FILTERS: ReadonlySet<GridFilter> = new Set<GridFilter>([
  'dropped', 'right', 'partial', 'wrong', 'skipped',
]);
