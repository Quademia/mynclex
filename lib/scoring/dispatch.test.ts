// mynclex/lib/scoring/dispatch.test.ts
//
// Tests the per-type dispatchers — computeMarksFromKey (editor) and
// scoreAttempt (runner). One row per question_type for each, with
// edge cases from bank-marks-and-scoring.html §4 and §6.

import { describe, it, expect } from 'vitest';
import { computeMarksFromKey, scoreAttempt } from './dispatch';
import type {
  McqCorrect,
  SataCorrect,
  SelectNCorrect,
  MatrixCorrect,
  MatrixMrCorrect,
  HighlightCorrect,
  ClozeCorrect,
  DragDropCorrect,
  BowtieCorrect,
} from '@/lib/bank/types';

describe('computeMarksFromKey — per-type max derivation (§5.2)', () => {
  it('MCQ → 1', () => {
    const c: McqCorrect = { answer: 'A', feedback: {} };
    expect(computeMarksFromKey('MCQ', c)).toBe(1);
  });

  it('TF → 1', () => {
    const c: McqCorrect = { answer: 'A', feedback: {} };
    expect(computeMarksFromKey('TF', c)).toBe(1);
  });

  it('SATA → count of correct answers', () => {
    const c: SataCorrect = { answers: ['A', 'B', 'C'], feedback: {} };
    expect(computeMarksFromKey('SATA', c)).toBe(3);
  });

  it('SELECT_N → count of correct answers (== N)', () => {
    const c: SelectNCorrect = { answers: ['A', 'B'], feedback: {} };
    expect(computeMarksFromKey('SELECT_N', c)).toBe(2);
  });

  it('MATRIX → count of rows', () => {
    const c: MatrixCorrect = {
      cells: { r1: 'c1', r2: 'c2', r3: 'c3' },
      feedback: {},
    };
    expect(computeMarksFromKey('MATRIX', c)).toBe(3);
  });

  it('MATRIX_MR → total correct cells across rows', () => {
    const c: MatrixMrCorrect = {
      cells: { r1: ['c1', 'c2'], r2: ['c1'], r3: ['c1', 'c2', 'c3'] },
      feedback: {},
    };
    expect(computeMarksFromKey('MATRIX_MR', c)).toBe(6);
  });

  it('HIGHLIGHT → count of correct chunks', () => {
    const c: HighlightCorrect = {
      correct_ids: ['h1', 'h2'],
      feedback: {},
    };
    expect(computeMarksFromKey('HIGHLIGHT', c)).toBe(2);
  });

  it('CLOZE → count of blanks', () => {
    const c: ClozeCorrect = {
      answers: { b1: 'c1', b2: 'c1', b3: 'c1' },
      feedback: {},
    };
    expect(computeMarksFromKey('CLOZE', c)).toBe(3);
  });

  it('DRAG_DROP → count of slots', () => {
    const c: DragDropCorrect = {
      slots: { s1: 't1', s2: 't2', s3: 't3', s4: 't4' },
    };
    expect(computeMarksFromKey('DRAG_DROP', c)).toBe(4);
  });

  it('BOWTIE → 5 (fixed)', () => {
    const c: BowtieCorrect = {
      left: ['lt1', 'lt2'],
      centre: 'ct1',
      right: ['rt1', 'rt2'],
      feedback: {},
    };
    expect(computeMarksFromKey('BOWTIE', c)).toBe(5);
  });
});

describe('scoreAttempt — per-type runner scoring', () => {
  // ── MCQ ──
  it('MCQ — correct pick', () => {
    const c: McqCorrect = { answer: 'A', feedback: {} };
    expect(scoreAttempt('MCQ', c, 'A')).toEqual({
      score_awarded: 1,
      is_correct: true,
    });
  });

  it('MCQ — null pick', () => {
    const c: McqCorrect = { answer: 'A', feedback: {} };
    expect(scoreAttempt('MCQ', c, null)).toEqual({
      score_awarded: 0,
      is_correct: false,
    });
  });

  // ── SATA (+/−) ──
  it('SATA — full credit', () => {
    const c: SataCorrect = { answers: ['A', 'B', 'C'], feedback: {} };
    expect(scoreAttempt('SATA', c, ['A', 'B', 'C'])).toEqual({
      score_awarded: 3,
      is_correct: true,
    });
  });

  it('SATA — partial credit (2 right + 1 wrong = 1)', () => {
    const c: SataCorrect = { answers: ['A', 'B', 'C'], feedback: {} };
    expect(scoreAttempt('SATA', c, ['A', 'B', 'X'])).toEqual({
      score_awarded: 1,
      is_correct: false,
    });
  });

  it('SATA — §6: zero options selected scores 0, no negative', () => {
    const c: SataCorrect = { answers: ['A', 'B', 'C'], feedback: {} };
    expect(scoreAttempt('SATA', c, [])).toEqual({
      score_awarded: 0,
      is_correct: false,
    });
  });

  // ── SELECT_N (+/−) ──
  it('SELECT_N — 1 right + 1 wrong = 0 (floor)', () => {
    const c: SelectNCorrect = { answers: ['A', 'B'], feedback: {} };
    expect(scoreAttempt('SELECT_N', c, ['A', 'X'])).toEqual({
      score_awarded: 0,
      is_correct: false,
    });
  });

  // ── HIGHLIGHT (+/−) ──
  it('HIGHLIGHT — full credit', () => {
    const c: HighlightCorrect = { correct_ids: ['h1', 'h2'], feedback: {} };
    expect(scoreAttempt('HIGHLIGHT', c, ['h1', 'h2'])).toEqual({
      score_awarded: 2,
      is_correct: true,
    });
  });

  it('HIGHLIGHT — §6: no chunks selected scores 0', () => {
    const c: HighlightCorrect = { correct_ids: ['h1', 'h2'], feedback: {} };
    expect(scoreAttempt('HIGHLIGHT', c, [])).toEqual({
      score_awarded: 0,
      is_correct: false,
    });
  });

  // ── MATRIX (per-row) ──
  it('MATRIX — partial', () => {
    const c: MatrixCorrect = {
      cells: { r1: 'c1', r2: 'c2' },
      feedback: {},
    };
    expect(scoreAttempt('MATRIX', c, { r1: 'c1', r2: 'c3' })).toEqual({
      score_awarded: 1,
      is_correct: false,
    });
  });

  // ── MATRIX_MR (per-row SATA, +/− floored within each row) ──
  it('MATRIX_MR — full credit when every row exactly right', () => {
    const c: MatrixMrCorrect = {
      cells: { r1: ['c1', 'c2'], r2: ['c3'] },
      feedback: {},
    };
    expect(scoreAttempt('MATRIX_MR', c, { r1: ['c1', 'c2'], r2: ['c3'] })).toEqual({
      score_awarded: 3,
      is_correct: true,
    });
  });

  it('MATRIX_MR — partial: a wrong pick subtracts within its row, floored at 0', () => {
    const c: MatrixMrCorrect = {
      cells: { r1: ['c1', 'c2'], r2: ['c3'] },
      feedback: {},
    };
    // r1: picked c1 (+1) and c3 (−1) → 0; r2: picked c3 (+1) → 1. Total 1.
    expect(scoreAttempt('MATRIX_MR', c, { r1: ['c1', 'c3'], r2: ['c3'] })).toEqual({
      score_awarded: 1,
      is_correct: false,
    });
  });

  it('MATRIX_MR — a skipped row scores 0 for that row', () => {
    const c: MatrixMrCorrect = {
      cells: { r1: ['c1'], r2: ['c2', 'c3'] },
      feedback: {},
    };
    // r1 right (+1); r2 missing entirely → 0. Total 1 of max 3.
    expect(scoreAttempt('MATRIX_MR', c, { r1: ['c1'] })).toEqual({
      score_awarded: 1,
      is_correct: false,
    });
  });

  // ── CLOZE (per-blank) ──
  it('CLOZE — all blanks right', () => {
    const c: ClozeCorrect = {
      answers: { b1: 'c1', b2: 'c2' },
      feedback: {},
    };
    expect(scoreAttempt('CLOZE', c, { b1: 'c1', b2: 'c2' })).toEqual({
      score_awarded: 2,
      is_correct: true,
    });
  });

  // ── DRAG_DROP (per-slot) ──
  it('DRAG_DROP — §6: un-placed slot scores 0 for that slot', () => {
    const c: DragDropCorrect = {
      slots: { s1: 't1', s2: 't2', s3: 't3' },
    };
    expect(scoreAttempt('DRAG_DROP', c, { s1: 't1', s3: 't3' })).toEqual({
      score_awarded: 2,
      is_correct: false,
    });
  });

  // ── BOWTIE (per-wing tally summed; §4.2 + §6) ──
  it('BOWTIE — all 5 right (full credit)', () => {
    const c: BowtieCorrect = {
      left: ['lt1', 'lt2'],
      centre: 'ct1',
      right: ['rt1', 'rt2'],
      feedback: {},
    };
    expect(
      scoreAttempt('BOWTIE', c, {
        left: ['lt1', 'lt2'],
        centre: 'ct1',
        right: ['rt1', 'rt2'],
      }),
    ).toEqual({ score_awarded: 5, is_correct: true });
  });

  it('BOWTIE — §6: a wing fully blank scores 0; others unaffected', () => {
    const c: BowtieCorrect = {
      left: ['lt1', 'lt2'],
      centre: 'ct1',
      right: ['rt1', 'rt2'],
      feedback: {},
    };
    expect(
      scoreAttempt('BOWTIE', c, {
        left: [],
        centre: 'ct1',
        right: ['rt1', 'rt2'],
      }),
    ).toEqual({ score_awarded: 3, is_correct: false });
  });

  it('BOWTIE — §4.2 worked example: 1 of 2 in left + 1 wrong = 1 in that wing', () => {
    // The §4.2 motivating case: simple-count rewards partial competence.
    const c: BowtieCorrect = {
      left: ['lt1', 'lt2'],
      centre: 'ct1',
      right: ['rt1', 'rt2'],
      feedback: {},
    };
    expect(
      scoreAttempt('BOWTIE', c, {
        left: ['lt1', 'lt9'],
        centre: 'ct1',
        right: ['rt1', 'rt2'],
      }),
    ).toEqual({ score_awarded: 4, is_correct: false });
  });
});
