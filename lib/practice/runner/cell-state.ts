// mynclex/lib/bank/runner/cell-state.ts
//
// Pure helpers for the question-grid cell state (runner.html §16.4).
// Three orthogonal channels:
//
//   • Fill   — 5 states encoded by (submission_status, is_correct).
//   • Border — marked-for-review (resolved against nclex_question_marks
//              elsewhere; this module accepts a Set<attempt_item_id>).
//   • Ring   — current cell (the index the student is on now).
//
// Kept side-effect-free so tests can call it directly without mocking.

import type { AnswerRow, CellFill } from './types';

export function deriveCellFill(answer: AnswerRow | undefined): CellFill {
  if (!answer) return 'unanswered';
  if (answer.submission_status === 'SKIPPED') return 'skipped';
  if (answer.submission_status === 'DRAFT')   return 'answered';
  // SUBMITTED or AUTO_SUBMITTED: verdict known.
  if (answer.is_correct === null) return 'answered';
  return answer.is_correct ? 'right' : 'wrong';
}

export interface GridCounts {
  total:       number;
  answered:    number;
  unanswered:  number;
  marked:      number;
  wrong:       number;
}

export function gridCounts(
  itemIds: string[],
  answers: Map<string, AnswerRow>,
  marked:  Set<string>,
): GridCounts {
  const c: GridCounts = { total: itemIds.length, answered: 0, unanswered: 0, marked: 0, wrong: 0 };
  for (const id of itemIds) {
    const fill = deriveCellFill(answers.get(id));
    if (fill === 'unanswered' || fill === 'skipped') c.unanswered += 1;
    else c.answered += 1;
    if (fill === 'wrong') c.wrong += 1;
    if (marked.has(id))   c.marked += 1;
  }
  return c;
}

export type GridFilter = 'all' | 'marked' | 'unanswered' | 'wrong';

export function isVisibleUnderFilter(
  fill:     CellFill,
  isMarked: boolean,
  filter:   GridFilter,
): boolean {
  switch (filter) {
    case 'all':        return true;
    case 'marked':     return isMarked;
    case 'unanswered': return fill === 'unanswered' || fill === 'skipped';
    case 'wrong':      return fill === 'wrong';
  }
}
