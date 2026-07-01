// mynclex/lib/scoring/dispatch.ts
//
// Per-type dispatchers wrapping the scoring functions.
//
//   computeMarksFromKey — editor side: derive max-possible score from the
//                         answer key alone. Called at save time and stored
//                         on nclex_bank_items.marks (see §5.2).
//   scoreAttempt        — runner side: produce { score_awarded, is_correct }
//                         from the curator's correct + the student's answer.

import type { QuestionType } from '@/lib/bank/classifications';
import type {
  McqCorrect,
  SataCorrect,
  SelectNCorrect,
  MatrixCorrect,
  MatrixMrCorrect,
  HighlightCorrect,
  ClozeCorrect,
  DragDropCorrect,
  DragClozeCorrect,
  DragOrderCorrect,
  BowtieCorrect,
  BankItemCorrect,
} from '@/lib/bank/types';
import {
  scoreAllOrNothing,
  scorePlusMinus,
  scorePerRow,
  scorePerRowMulti,
  scorePerBlank,
  scorePerSlot,
} from './functions';
import type { BankItemAnswer, BowtieAnswer, ScoreResult } from './types';

// ─────────────────────────────────────────────────────────────
// computeMarksFromKey — editor-side max derivation.
// Per bank-marks-and-scoring.html §5.2.
// ─────────────────────────────────────────────────────────────

export function computeMarksFromKey(
  questionType: QuestionType,
  correct: BankItemCorrect,
): number {
  switch (questionType) {
    case 'MCQ':
    case 'TF':
      return 1;
    case 'SATA':
      return (correct as SataCorrect).answers.length;
    case 'SELECT_N':
      // Editor enforces N == count(correct), so this equals N. (§4.1)
      return (correct as SelectNCorrect).answers.length;
    case 'MATRIX':
      return Object.keys((correct as MatrixCorrect).cells).length;
    case 'MATRIX_MR':
      // Max = total number of correct cells across all rows (each row is
      // scored SATA-style, so each correct column contributes 1).
      return Object.values((correct as MatrixMrCorrect).cells).reduce(
        (sum, cols) => sum + cols.length,
        0,
      );
    case 'HIGHLIGHT':
      return (correct as HighlightCorrect).correct_ids.length;
    case 'CLOZE':
      return Object.keys((correct as ClozeCorrect).answers).length;
    case 'DRAG_DROP':
      return Object.keys((correct as DragDropCorrect).slots).length;
    case 'DRAG_CLOZE':
      return Object.keys((correct as DragClozeCorrect).slots).length;
    case 'DRAG_ORDER':
      return Object.keys((correct as DragOrderCorrect).slots).length;
    case 'BOWTIE':
      // Fixed: 2 left + 1 centre + 2 right.
      return 5;
  }
}

// ─────────────────────────────────────────────────────────────
// scoreAttempt — runner-side per-question scoring.
// ─────────────────────────────────────────────────────────────

export function scoreAttempt(
  questionType: QuestionType,
  correct: BankItemCorrect,
  answer: BankItemAnswer,
): ScoreResult {
  switch (questionType) {
    case 'MCQ':
    case 'TF': {
      const c = correct as McqCorrect;
      const r = scoreAllOrNothing(c.answer, answer as string | null);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'SATA': {
      const c = correct as SataCorrect;
      const r = scorePlusMinus(c.answers, answer as string[]);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'SELECT_N': {
      const c = correct as SelectNCorrect;
      const r = scorePlusMinus(c.answers, answer as string[]);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'HIGHLIGHT': {
      const c = correct as HighlightCorrect;
      const r = scorePlusMinus(c.correct_ids, answer as string[]);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'MATRIX': {
      const c = correct as MatrixCorrect;
      const r = scorePerRow(c.cells, answer as Record<string, string>);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'MATRIX_MR': {
      const c = correct as MatrixMrCorrect;
      const r = scorePerRowMulti(c.cells, answer as Record<string, string[]>);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'CLOZE': {
      const c = correct as ClozeCorrect;
      const r = scorePerBlank(c.answers, answer as Record<string, string>);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'DRAG_DROP': {
      const c = correct as DragDropCorrect;
      const r = scorePerSlot(c.slots, answer as Record<string, string>);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'DRAG_CLOZE': {
      const c = correct as DragClozeCorrect;
      const r = scorePerSlot(c.slots, answer as Record<string, string>);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'DRAG_ORDER': {
      const c = correct as DragOrderCorrect;
      const r = scorePerSlot(c.slots, answer as Record<string, string>);
      return { score_awarded: r.score_awarded, is_correct: r.is_correct };
    }

    case 'BOWTIE': {
      // Per-wing 0/1 tally per §4.2 — for each correct token in a wing,
      // score 1 if the student picked it anywhere in that wing's pool,
      // else 0. Centre is a single token. No +/−, no floor (UI constrains
      // picks so gaming isn't possible).
      const c = correct as BowtieCorrect;
      const a = answer as BowtieAnswer;
      const leftSet = new Set(a.left);
      const rightSet = new Set(a.right);
      const leftScore = c.left.filter((t) => leftSet.has(t)).length;
      const centreScore = a.centre !== null && a.centre === c.centre ? 1 : 0;
      const rightScore = c.right.filter((t) => rightSet.has(t)).length;
      const score = leftScore + centreScore + rightScore;
      return { score_awarded: score, is_correct: score === 5 };
    }
  }
}
