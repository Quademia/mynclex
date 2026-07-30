// mynclex/lib/scoring/verdict.test.ts
//
// Unit tests for the three-state display verdict.
//
// The load-bearing case is PARTIAL: before this function existed the
// rationale block read `is_correct`, which is full-credit-only, so every
// partial answer rendered as the flat word "wrong" beside a non-zero
// score. These tests pin the boundary in both directions.

import { describe, it, expect } from 'vitest';
import { verdictFor, VERDICT_LABEL } from './verdict';

describe('verdictFor', () => {
  it('full marks is CORRECT', () => {
    expect(verdictFor(3, 3)).toBe('CORRECT');
    expect(verdictFor(1, 1)).toBe('CORRECT');
  });

  it('zero is WRONG', () => {
    expect(verdictFor(0, 3)).toBe('WRONG');
    expect(verdictFor(0, 1)).toBe('WRONG');
  });

  it('anything between is PARTIAL', () => {
    expect(verdictFor(1, 3)).toBe('PARTIAL');
    expect(verdictFor(2, 3)).toBe('PARTIAL');
    expect(verdictFor(12, 13)).toBe('PARTIAL');
  });

  it('a single-mark question can never be PARTIAL', () => {
    // All-or-nothing types (MCQ / TF) have marksMax 1, so there is no
    // room between 0 and full. The strip relies on this to know when the
    // partial cohort share is structurally zero.
    expect(verdictFor(0, 1)).toBe('WRONG');
    expect(verdictFor(1, 1)).toBe('CORRECT');
  });

  it('an ungraded answer (null score) reads as WRONG', () => {
    // Preserves what the rationale block did before, which coalesced a
    // null is_correct to false.
    expect(verdictFor(null, 3)).toBe('WRONG');
  });

  it('disagrees with is_correct exactly where it should', () => {
    // is_correct is full-credit-only, so for a partial answer it is
    // false and this function says PARTIAL. That disagreement IS the
    // feature — if these ever agree everywhere, the fix has been undone.
    const isCorrect = false; // what the DB stores for 1 of 3
    const verdict = verdictFor(1, 3);
    expect(isCorrect).toBe(false);
    expect(verdict).not.toBe('WRONG');
    expect(verdict).toBe('PARTIAL');
  });

  describe('defensive edges', () => {
    it('treats a fractional full score as CORRECT despite float error', () => {
      // 0.1 * 3 is 0.30000000000000004, not 0.3. An exact === would call
      // this PARTIAL and show "Partial credit" on a fully correct answer.
      expect(verdictFor(0.1 + 0.2, 0.3)).toBe('CORRECT');
    });

    it('clamps an over-max score to CORRECT rather than PARTIAL', () => {
      expect(verdictFor(4, 3)).toBe('CORRECT');
    });

    it('never calls a zero-mark question CORRECT on an empty rubric', () => {
      // marks 0 is broken data; without a maximum the most that can be
      // said is whether anything was scored at all.
      expect(verdictFor(0, 0)).toBe('WRONG');
      expect(verdictFor(1, 0)).toBe('CORRECT');
    });

    it('a negative score reads as WRONG, never partial', () => {
      // score_awarded is floored at 0 by every scoring function, so this
      // is unreachable through the app — but a hand-written row must not
      // render as "Partial credit".
      expect(verdictFor(-1, 3)).toBe('WRONG');
    });
  });
});

describe('VERDICT_LABEL', () => {
  it('has a label for every state', () => {
    expect(VERDICT_LABEL.CORRECT).toBe('Correct');
    expect(VERDICT_LABEL.PARTIAL).toBe('Partial credit');
    expect(VERDICT_LABEL.WRONG).toBe('Wrong');
  });

  it('never says "mark" — that word means POINTS in this product', () => {
    // Same vocabulary rule the flag/bookmark arc settled: "marks" are
    // what a question is worth, so a verdict must not borrow the word.
    for (const label of Object.values(VERDICT_LABEL)) {
      expect(label.toLowerCase()).not.toContain('mark');
    }
  });
});
