// mynclex/lib/scoring/rules-copy.test.ts
//
// The anti-drift guard for the student-facing scoring rules.
//
// A sentence describing how marks are calculated is only worth showing if
// it is still true. Proximity to the scoring function is a habit; this is
// a guarantee. Every rule's `penalisesWrongPicks` claim is checked by
// running the REAL scoreAttempt for that type and watching whether an
// extra wrong pick actually costs the student anything.
//
// If someone changes the maths and not the wording, these fail.

import { describe, it, expect } from 'vitest';
import { QUESTION_TYPES, type QuestionType } from '@/lib/bank/classifications';
import type { BankItemCorrect } from '@/lib/bank/types';
import { SCORING_RULE, scoringRuleText } from './rules-copy';
import { scoreAttempt } from './dispatch';
import type { BankItemAnswer } from './types';

const ALL_TYPES = QUESTION_TYPES.map((t) => t.value);

/**
 * Per type: a key, an answer holding ONE correct element, and the same
 * answer with one extra WRONG element added. Whether the score drops
 * between them is the behaviour `penalisesWrongPicks` claims to describe.
 *
 * MCQ / TF are absent — a single-pick type cannot express "an extra wrong
 * pick", so their claim is checked separately below.
 */
const WRONG_PICK_PROBE: Partial<
  Record<QuestionType, { correct: unknown; baseline: unknown; plusWrong: unknown }>
> = {
  SATA: {
    correct:   { answers: ['A', 'B'] },
    baseline:  ['A'],
    plusWrong: ['A', 'Z'],
  },
  SELECT_N: {
    correct:   { answers: ['A', 'B'] },
    baseline:  ['A'],
    plusWrong: ['A', 'Z'],
  },
  HIGHLIGHT: {
    correct:   { correct_ids: ['c1', 'c2'] },
    baseline:  ['c1'],
    plusWrong: ['c1', 'zz'],
  },
  MATRIX: {
    // "Wrong pick" for a per-row type = filling a second row wrongly.
    correct:   { cells: { r1: 'yes', r2: 'yes' } },
    baseline:  { r1: 'yes' },
    plusWrong: { r1: 'yes', r2: 'no' },
  },
  MATRIX_MR: {
    correct:   { cells: { r1: ['a', 'b'] } },
    baseline:  { r1: ['a'] },
    plusWrong: { r1: ['a', 'z'] },
  },
  CLOZE: {
    correct:   { answers: { b1: 'x', b2: 'y' } },
    baseline:  { b1: 'x' },
    plusWrong: { b1: 'x', b2: 'WRONG' },
  },
  DRAG_CLOZE: {
    correct:   { slots: { s1: 't1', s2: 't2' } },
    baseline:  { s1: 't1' },
    plusWrong: { s1: 't1', s2: 'WRONG' },
  },
  DRAG_ORDER: {
    correct:   { slots: { s1: 't1', s2: 't2' } },
    baseline:  { s1: 't1' },
    plusWrong: { s1: 't1', s2: 'WRONG' },
  },
  BOWTIE: {
    correct:   { left: ['l1', 'l2'], centre: 'c1', right: ['r1', 'r2'] },
    baseline:  { left: ['l1'], centre: null, right: [] },
    plusWrong: { left: ['l1', 'ZZ'], centre: null, right: [] },
  },
};

function score(type: QuestionType, correct: unknown, answer: unknown): number {
  return scoreAttempt(
    type,
    correct as BankItemCorrect,
    answer as BankItemAnswer,
  ).score_awarded;
}

describe('SCORING_RULE coverage', () => {
  it('has a rule for every question type', () => {
    for (const type of ALL_TYPES) {
      expect(SCORING_RULE[type], `no scoring rule for ${type}`).toBeDefined();
      expect(SCORING_RULE[type].text.length).toBeGreaterThan(0);
    }
  });

  it('types scored by the same function share the same sentence', () => {
    // Mirrors dispatch.ts. Two types scored identically must not tell the
    // student two different stories.
    expect(SCORING_RULE.MCQ.text).toBe(SCORING_RULE.TF.text);
    expect(SCORING_RULE.SATA.text).toBe(SCORING_RULE.SELECT_N.text);
    expect(SCORING_RULE.SATA.text).toBe(SCORING_RULE.HIGHLIGHT.text);
    expect(SCORING_RULE.DRAG_CLOZE.text).toBe(SCORING_RULE.CLOZE.text);
  });

  it('MATRIX_MR does NOT borrow SATA\'s sentence', () => {
    // It is a stack of SATA rows: the floor applies per row, not per
    // question, so "never below 0" would be a different claim here.
    expect(SCORING_RULE.MATRIX_MR.text).not.toBe(SCORING_RULE.SATA.text);
  });

  it('reads as a rule, not a fragment', () => {
    for (const type of ALL_TYPES) {
      const text = scoringRuleText(type);
      expect(text.endsWith('.'), `${type} rule ends with a full stop`).toBe(false);
      expect(text.length, `${type} rule too long for the strip`).toBeLessThan(75);
    }
  });
});

describe('penalisesWrongPicks is true of the actual scoring', () => {
  for (const [type, probe] of Object.entries(WRONG_PICK_PROBE)) {
    const qt = type as QuestionType;

    it(`${type}: an extra wrong pick ${SCORING_RULE[qt].penalisesWrongPicks ? 'costs marks' : 'costs nothing'}`, () => {
      const before = score(qt, probe!.correct, probe!.baseline);
      const after  = score(qt, probe!.correct, probe!.plusWrong);

      if (SCORING_RULE[qt].penalisesWrongPicks) {
        expect(after, `${type} claims a penalty but the score did not drop`)
          .toBeLessThan(before);
      } else {
        expect(after, `${type} claims no penalty but the score dropped`)
          .toBe(before);
      }
    });
  }

  it('covers every type that can express an extra wrong pick', () => {
    // MCQ and TF are single-pick, so they are checked separately. Any
    // OTHER type missing from the probe table is an untested claim.
    const probed = new Set(Object.keys(WRONG_PICK_PROBE));
    const unprobed = ALL_TYPES.filter((t) => !probed.has(t));
    expect(unprobed.sort()).toEqual(['MCQ', 'TF']);
  });
});

describe('the all-or-nothing claim', () => {
  for (const type of ['MCQ', 'TF'] as const) {
    it(`${type}: the exact answer scores full, anything else scores 0`, () => {
      const correct = { answer: 'A' };
      expect(score(type, correct, 'A')).toBe(1);
      expect(score(type, correct, 'B')).toBe(0);
      expect(score(type, correct, null)).toBe(0);
    });
  }

  it('never goes negative on a wrong answer', () => {
    // "never below 0" is stated for the +/− family; make sure the
    // all-or-nothing family cannot undercut it either.
    expect(score('MCQ', { answer: 'A' }, 'B')).toBeGreaterThanOrEqual(0);
  });
});
