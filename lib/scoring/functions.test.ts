// mynclex/lib/scoring/functions.test.ts
//
// Unit tests for the five pure scoring functions. Each function is
// tested in isolation for: full credit, partial credit, edge cases
// flagged in bank-marks-and-scoring.html §6.

import { describe, it, expect } from 'vitest';
import {
  scoreAllOrNothing,
  scorePlusMinus,
  scorePerRow,
  scorePerBlank,
  scorePerSlot,
} from './functions';

describe('scoreAllOrNothing', () => {
  it('full credit when picked matches', () => {
    expect(scoreAllOrNothing('A', 'A')).toEqual({
      score_awarded: 1,
      is_correct: true,
      max: 1,
    });
  });

  it('zero when picked is wrong', () => {
    expect(scoreAllOrNothing('A', 'B')).toEqual({
      score_awarded: 0,
      is_correct: false,
      max: 1,
    });
  });

  it('zero when picked is null (skipped)', () => {
    expect(scoreAllOrNothing('A', null)).toEqual({
      score_awarded: 0,
      is_correct: false,
      max: 1,
    });
  });
});

describe('scorePlusMinus', () => {
  it('full credit when all correct picked, no wrongs', () => {
    expect(scorePlusMinus(['A', 'B', 'C'], ['A', 'B', 'C'])).toEqual({
      score_awarded: 3,
      is_correct: true,
      max: 3,
    });
  });

  it('partial: 2 correct + 1 wrong = 1', () => {
    expect(scorePlusMinus(['A', 'B', 'C'], ['A', 'B', 'X'])).toEqual({
      score_awarded: 1,
      is_correct: false,
      max: 3,
    });
  });

  it('floors at 0 when wrongs > correct picks', () => {
    expect(scorePlusMinus(['A', 'B', 'C'], ['A', 'X', 'Y', 'Z'])).toEqual({
      score_awarded: 0,
      is_correct: false,
      max: 3,
    });
  });

  it('every option selected — gaming defence (3 correct − 2 wrong = 1)', () => {
    expect(scorePlusMinus(['A', 'B', 'C'], ['A', 'B', 'C', 'X', 'Y'])).toEqual({
      score_awarded: 1,
      is_correct: false,
      max: 3,
    });
  });

  it('zero picks scores zero', () => {
    expect(scorePlusMinus(['A', 'B', 'C'], [])).toEqual({
      score_awarded: 0,
      is_correct: false,
      max: 3,
    });
  });

  it('§5.5 — 2 of 3 correct with no wrongs is NOT is_correct', () => {
    expect(scorePlusMinus(['A', 'B', 'C'], ['A', 'B'])).toEqual({
      score_awarded: 2,
      is_correct: false,
      max: 3,
    });
  });

  it('duplicate picks are de-duped', () => {
    // 'A' picked twice still scores once. Defensive — UI shouldn't allow it,
    // but if it leaks through, we shouldn't double-count.
    expect(scorePlusMinus(['A', 'B', 'C'], ['A', 'A', 'B'])).toEqual({
      score_awarded: 2,
      is_correct: false,
      max: 3,
    });
  });
});

describe('scorePerRow', () => {
  it('all rows right → full credit', () => {
    expect(scorePerRow({ r1: 'c1', r2: 'c2' }, { r1: 'c1', r2: 'c2' })).toEqual({
      score_awarded: 2,
      is_correct: true,
      max: 2,
    });
  });

  it('one row wrong → partial', () => {
    expect(scorePerRow({ r1: 'c1', r2: 'c2' }, { r1: 'c1', r2: 'c3' })).toEqual({
      score_awarded: 1,
      is_correct: false,
      max: 2,
    });
  });

  it('skipped row scores 0 for that row', () => {
    expect(scorePerRow({ r1: 'c1', r2: 'c2' }, { r1: 'c1' })).toEqual({
      score_awarded: 1,
      is_correct: false,
      max: 2,
    });
  });
});

describe('scorePerBlank', () => {
  it('all blanks right → full credit', () => {
    expect(scorePerBlank({ b1: 'c1', b2: 'c2' }, { b1: 'c1', b2: 'c2' })).toEqual({
      score_awarded: 2,
      is_correct: true,
      max: 2,
    });
  });

  it('partial: 1 of 3 right', () => {
    expect(
      scorePerBlank(
        { b1: 'c1', b2: 'c2', b3: 'c3' },
        { b1: 'c1', b2: 'wrong' },
      ),
    ).toEqual({ score_awarded: 1, is_correct: false, max: 3 });
  });
});

describe('scorePerSlot', () => {
  it('all slots right → full credit', () => {
    expect(
      scorePerSlot(
        { s1: 't1', s2: 't2', s3: 't3' },
        { s1: 't1', s2: 't2', s3: 't3' },
      ),
    ).toEqual({ score_awarded: 3, is_correct: true, max: 3 });
  });

  it('§6 — un-placed slot scores 0 for that slot, others unaffected', () => {
    expect(
      scorePerSlot(
        { s1: 't1', s2: 't2', s3: 't3' },
        { s1: 't1', s3: 't3' },
      ),
    ).toEqual({ score_awarded: 2, is_correct: false, max: 3 });
  });
});
