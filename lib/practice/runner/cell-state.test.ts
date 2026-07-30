// mynclex/lib/practice/runner/cell-state.test.ts
//
// deriveCellFill decides the colour of every cell in the question grid,
// and until the partial fill landed (2026-07-30) it had NO tests at all.
// These cover the two things worth being sure of:
//
//   1. The grid and the review scoring strip agree. They read the same
//      verdictFor(), so a cell can never say "wrong" while the strip
//      beside it says "Partial credit" — the defect this fill exists to
//      close.
//   2. revealCorrectness still hides the verdict in exam modes. A new
//      fill is a new way to leak correctness early, and 'partial' leaks
//      MORE than 'wrong' did (it says you got some of it right).

import { describe, it, expect } from 'vitest';
import { deriveCellFill, isVisibleUnderFilter, FILL_LABEL } from './cell-state';
import { verdictFor } from '@/lib/scoring';
import type { AnswerRow, CellFill } from './types';

function answer(over: Partial<AnswerRow> = {}): AnswerRow {
  return {
    attempt_item_id:   'ai-1',
    answer_json:       ['A'],
    submission_status: 'SUBMITTED',
    is_correct:        false,
    score_awarded:     1,
    time_spent_sec:    30,
    submitted_at:      '2026-07-30T10:00:00Z',
    ...over,
  };
}

describe('deriveCellFill', () => {
  it('no answer row is unanswered', () => {
    expect(deriveCellFill(undefined, 3)).toBe('unanswered');
  });

  it('SKIPPED and DRAFT ignore the score entirely', () => {
    expect(deriveCellFill(answer({ submission_status: 'SKIPPED' }), 3)).toBe('skipped');
    expect(deriveCellFill(answer({ submission_status: 'DRAFT' }), 3)).toBe('answered');
  });

  it('full marks is right, zero is wrong, between is partial', () => {
    expect(deriveCellFill(answer({ score_awarded: 3 }), 3)).toBe('right');
    expect(deriveCellFill(answer({ score_awarded: 0 }), 3)).toBe('wrong');
    expect(deriveCellFill(answer({ score_awarded: 1 }), 3)).toBe('partial');
    expect(deriveCellFill(answer({ score_awarded: 2 }), 3)).toBe('partial');
  });

  it('a single-mark question is only ever right or wrong', () => {
    expect(deriveCellFill(answer({ score_awarded: 1 }), 1)).toBe('right');
    expect(deriveCellFill(answer({ score_awarded: 0 }), 1)).toBe('wrong');
  });

  it('does NOT read is_correct — which is false on a partial answer', () => {
    // The old implementation was `answer.is_correct ? 'right' : 'wrong'`,
    // and is_correct is full-credit-only, so this exact row used to paint
    // dark-red "wrong" on a 2-of-3 score.
    const partial = answer({ score_awarded: 2, is_correct: false });
    expect(deriveCellFill(partial, 3)).toBe('partial');
  });

  it('an ungraded submitted row is answered, not wrong', () => {
    // Absence of a verdict is not a verdict of zero.
    const ungraded = answer({ score_awarded: null, is_correct: null });
    expect(deriveCellFill(ungraded, 3)).toBe('answered');
  });

  describe('revealCorrectness gating', () => {
    it('hides every verdict behind the neutral fill', () => {
      for (const score of [0, 1, 3]) {
        expect(deriveCellFill(answer({ score_awarded: score }), 3, false)).toBe('answered');
      }
    });

    it('partial does not leak when correctness is hidden', () => {
      // The one that matters most: 'partial' tells a student mid-exam
      // that they got PART of it right, which is more than 'wrong' ever
      // revealed.
      expect(deriveCellFill(answer({ score_awarded: 2 }), 3, false)).toBe('answered');
    });

    it('skipped still shows, since it carries no correctness signal', () => {
      expect(deriveCellFill(answer({ submission_status: 'SKIPPED' }), 3, false)).toBe('skipped');
    });
  });

  it('agrees with the scoring strip on every score', () => {
    // The two surfaces must not be able to disagree about one answer.
    const expected: Record<string, CellFill> = {
      CORRECT: 'right',
      PARTIAL: 'partial',
      WRONG:   'wrong',
    };
    for (let score = 0; score <= 4; score++) {
      const fill = deriveCellFill(answer({ score_awarded: score }), 4);
      expect(fill, `score ${score} of 4`).toBe(expected[verdictFor(score, 4)]);
    }
  });
});

describe('isVisibleUnderFilter', () => {
  it('the Wrong filter does not sweep in partial answers', () => {
    // Deliberate: a tab labelled "Wrong" listing partial answers would
    // reintroduce in the filter the exact conflation the three-state
    // verdict removed from the header.
    expect(isVisibleUnderFilter('wrong', false, 'wrong')).toBe(true);
    expect(isVisibleUnderFilter('partial', false, 'wrong')).toBe(false);
  });

  it('the Unanswered filter still covers skipped', () => {
    expect(isVisibleUnderFilter('skipped', false, 'unanswered')).toBe(true);
    expect(isVisibleUnderFilter('partial', false, 'unanswered')).toBe(false);
  });

  it('All shows every fill, including the new one', () => {
    const fills: CellFill[] = ['unanswered', 'answered', 'right', 'partial', 'wrong', 'skipped'];
    for (const f of fills) expect(isVisibleUnderFilter(f, false, 'all')).toBe(true);
  });
});

describe('FILL_LABEL', () => {
  it('speaks "partial credit", not the bare fill name', () => {
    // A screen reader saying "Question 10, partial" does not say
    // partial WHAT.
    expect(FILL_LABEL.partial).toBe('partial credit');
  });

  it('never speaks "wrong" for a partial answer', () => {
    expect(FILL_LABEL.partial).not.toContain('wrong');
  });

  it('has a word for every fill', () => {
    const fills: CellFill[] = ['unanswered', 'answered', 'right', 'partial', 'wrong', 'skipped'];
    for (const f of fills) expect(FILL_LABEL[f], `no label for ${f}`).toBeTruthy();
  });
});
