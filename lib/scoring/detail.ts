// mynclex/lib/scoring/detail.ts
//
// Per-question POINTS DETAIL for the readiness results report (§11.5).
//
// The runner stores score_awarded (partial credit, floored at 0) + is_correct
// per question, but the report's Points card wants a finer split the stored
// score alone can't give:
//   found       — correct answer-slots the student actually got
//   missed      — correct answer-slots they didn't get (= max − found)
//   wrongPicked — wrong options they selected (the −1 picks); the SELECTION
//                 family only (SATA / Select-N / Highlight / Matrix-MR)
//
// Recomputed from the frozen snapshots (correct_answer_snapshot_json +
// answer_json), pure + deterministic, mirroring lib/scoring/dispatch.ts's
// per-type semantics. For single-answer / per-slot types `found` =
// score_awarded and `wrongPicked` = 0 (a wrong single pick isn't a −1
// penalty, just a non-match). Skipped questions (null answer) → found 0.
//
// NOT a re-score: score_awarded/is_correct still come from the DB. This
// only derives the found/missed/wrong split the Points reading renders, so
// it never contradicts the stored grade — found ≥ score_awarded always
// (score is found − wrongPicked, floored).

import type { QuestionType } from '@/lib/bank/classifications';
import type {
  McqCorrect,
  SataCorrect,
  SelectNCorrect,
  MatrixCorrect,
  MatrixMrCorrect,
  HighlightCorrect,
  ClozeCorrect,
  DragClozeCorrect,
  DragOrderCorrect,
  BowtieCorrect,
  BankItemCorrect,
} from '@/lib/bank/types';
import type { BankItemAnswer, BowtieAnswer } from './types';

export interface PointsDetail {
  /** Correct answer-slots the student got. */
  found: number;
  /** Correct answer-slots the student did not get (= max − found). */
  missed: number;
  /** Wrong options selected (−1 picks); selection family only, else 0. */
  wrongPicked: number;
  /** The question's max answer-points (= marks). */
  max: number;
}

/** +found per correct pick, +wrong per pick outside the key. */
function plusMinus(correctIds: string[], picked: string[] | null | undefined) {
  const correctSet = new Set(correctIds);
  let found = 0;
  let wrong = 0;
  for (const p of new Set(picked ?? [])) {
    if (correctSet.has(p)) found++;
    else wrong++;
  }
  return { found, wrong, max: correctIds.length };
}

/** 0/1 per keyed element (row / blank / slot); no wrong-pick penalty. */
function perElement(
  correctByKey: Record<string, string>,
  pickedByKey: Record<string, string> | null | undefined,
): number {
  const picked = pickedByKey ?? {};
  let found = 0;
  for (const [k, expected] of Object.entries(correctByKey)) {
    if (picked[k] === expected) found++;
  }
  return found;
}

/**
 * Derive the found / missed / wrong-picked split for one delivered
 * question from its frozen key + the student's frozen answer. Returns
 * null on a shape it can't read (caller falls back to score_awarded).
 */
export function pointsDetail(
  questionType: QuestionType,
  correct: BankItemCorrect,
  answer: BankItemAnswer | null,
): PointsDetail | null {
  try {
    switch (questionType) {
      case 'MCQ':
      case 'TF': {
        const c = correct as McqCorrect;
        const found = answer !== null && answer === c.answer ? 1 : 0;
        return { found, missed: 1 - found, wrongPicked: 0, max: 1 };
      }
      case 'SATA': {
        const c = correct as SataCorrect;
        const r = plusMinus(c.answers, answer as string[] | null);
        return { found: r.found, missed: r.max - r.found, wrongPicked: r.wrong, max: r.max };
      }
      case 'SELECT_N': {
        const c = correct as SelectNCorrect;
        const r = plusMinus(c.answers, answer as string[] | null);
        return { found: r.found, missed: r.max - r.found, wrongPicked: r.wrong, max: r.max };
      }
      case 'HIGHLIGHT': {
        const c = correct as HighlightCorrect;
        const r = plusMinus(c.correct_ids, answer as string[] | null);
        return { found: r.found, missed: r.max - r.found, wrongPicked: r.wrong, max: r.max };
      }
      case 'MATRIX': {
        const c = correct as MatrixCorrect;
        const max = Object.keys(c.cells).length;
        const found = perElement(c.cells, answer as Record<string, string> | null);
        return { found, missed: max - found, wrongPicked: 0, max };
      }
      case 'MATRIX_MR': {
        const c = correct as MatrixMrCorrect;
        const picked = (answer as Record<string, string[]> | null) ?? {};
        let found = 0;
        let wrong = 0;
        let max = 0;
        for (const [rowId, cols] of Object.entries(c.cells)) {
          const r = plusMinus(cols, picked[rowId]);
          found += r.found;
          wrong += r.wrong;
          max += r.max;
        }
        return { found, missed: max - found, wrongPicked: wrong, max };
      }
      case 'CLOZE': {
        const c = correct as ClozeCorrect;
        const max = Object.keys(c.answers).length;
        const found = perElement(c.answers, answer as Record<string, string> | null);
        return { found, missed: max - found, wrongPicked: 0, max };
      }
      case 'DRAG_CLOZE': {
        const c = correct as DragClozeCorrect;
        const max = Object.keys(c.slots).length;
        const found = perElement(c.slots, answer as Record<string, string> | null);
        return { found, missed: max - found, wrongPicked: 0, max };
      }
      case 'DRAG_ORDER': {
        const c = correct as DragOrderCorrect;
        const max = Object.keys(c.slots).length;
        const found = perElement(c.slots, answer as Record<string, string> | null);
        return { found, missed: max - found, wrongPicked: 0, max };
      }
      case 'BOWTIE': {
        const c = correct as BowtieCorrect;
        const a = (answer as BowtieAnswer | null) ?? { left: [], centre: null, right: [] };
        const leftSet = new Set(a.left ?? []);
        const rightSet = new Set(a.right ?? []);
        const found =
          c.left.filter((t) => leftSet.has(t)).length +
          (a.centre !== null && a.centre === c.centre ? 1 : 0) +
          c.right.filter((t) => rightSet.has(t)).length;
        return { found, missed: 5 - found, wrongPicked: 0, max: 5 };
      }
    }
  } catch {
    return null;
  }
}
