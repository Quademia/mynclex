// mynclex/lib/practice/cat/report-derive.test.ts
//
// Unit tests for the CAT results-page derivations (§13).
//
// The trajectory shift is the one worth guarding hardest: the engine stores
// theta BEFORE each question, the graph plots it AFTER each answer, and an
// off-by-one there draws a plausible-looking graph that lags the truth by a
// question. Nothing else in the system would catch it.

import { describe, it, expect } from 'vitest';
import {
  CATEGORY_FOOTNOTE,
  trajectoryPoints,
  categoryRows,
  clinicalJudgment,
  itemsAdministeredLine,
  formatProbability,
  verdictSubline,
  verdictBody,
  isNearBoundary,
  type CatReportItem,
} from './report-derive';

const item = (over: Partial<CatReportItem> = {}): CatReportItem => ({
  position: 1,
  questionType: 'MCQ',
  category: 'Physiological Integrity',
  thetaBefore: 0,
  seBefore: 1,
  isCorrect: true,
  scoreAwarded: 1,
  marks: 1,
  isCaseChild: false,
  answered: true,
  ...over,
});

describe('trajectoryPoints — the before/after shift', () => {
  it('plots each answer against the NEXT item’s before-value', () => {
    const items = [
      item({ position: 1, thetaBefore: 0.0, seBefore: 1.0 }),
      item({ position: 2, thetaBefore: 0.3, seBefore: 0.9 }),
      item({ position: 3, thetaBefore: 0.5, seBefore: 0.8 }),
    ];
    const pts = trajectoryPoints(items, 0.62, 0.7);

    // Answer 1 moved the estimate to what Q2 saw, and so on.
    expect(pts.map((p) => p.theta)).toEqual([0.3, 0.5, 0.62]);
    expect(pts.map((p) => p.se)).toEqual([0.9, 0.8, 0.7]);
  });

  it('ends on the attempt’s final estimate, not the last before-value', () => {
    const pts = trajectoryPoints([item({ position: 1, thetaBefore: 0 })], 0.48, 0.23);
    expect(pts).toHaveLength(1);
    expect(pts[0].theta).toBe(0.48);
    expect(pts[0].se).toBe(0.23);
  });

  it('sorts by position before shifting, so unordered rows still trace correctly', () => {
    const items = [
      item({ position: 3, thetaBefore: 0.5 }),
      item({ position: 1, thetaBefore: 0.0 }),
      item({ position: 2, thetaBefore: 0.3 }),
    ];
    expect(trajectoryPoints(items, 0.6, 0.5).map((p) => p.theta)).toEqual([0.3, 0.5, 0.6]);
  });

  it('marks partial credit as neither correct nor wrong', () => {
    const pts = trajectoryPoints(
      [item({ isCorrect: false, scoreAwarded: 3, marks: 5 })],
      0.1,
      0.4,
    );
    expect(pts[0].isPartial).toBe(true);
    expect(pts[0].isCorrect).toBe(false);
  });

  it('does not call a zero-score answer partial', () => {
    const pts = trajectoryPoints(
      [item({ isCorrect: false, scoreAwarded: 0, marks: 5 })],
      0.1,
      0.4,
    );
    expect(pts[0].isPartial).toBe(false);
  });
});

describe('categoryRows', () => {
  it('counts FULL CREDIT only — a partial answer is not "correct" here', () => {
    const rows = categoryRows([
      item({ category: 'Psychosocial Integrity', isCorrect: true, scoreAwarded: 1, marks: 1 }),
      item({ category: 'Psychosocial Integrity', isCorrect: false, scoreAwarded: 4, marks: 5 }),
    ]);
    expect(rows[0]).toMatchObject({ seen: 2, correct: 1, frac: 0.5 });
  });

  it('orders weakest first, so the page points somewhere useful', () => {
    const rows = categoryRows([
      item({ category: 'Strong area', isCorrect: true }),
      item({ category: 'Weak area', isCorrect: false, scoreAwarded: 0 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Weak area', 'Strong area']);
  });

  it('omits categories the exam never reached rather than showing 0/0', () => {
    const rows = categoryRows([item({ category: 'Physiological Integrity' })]);
    expect(rows).toHaveLength(1);
  });

  it('ignores items with no category rather than bucketing them as null', () => {
    const rows = categoryRows([item({ category: null }), item({ category: 'Real' })]);
    expect(rows.map((r) => r.name)).toEqual(['Real']);
  });
});

describe('the category footnote explains BOTH effects', () => {
  // A page showing "19%" beside "Above standard — 98% confident" reads as
  // broken unless it says why. Partial credit is the smaller reason; the
  // adaptive difficulty is the bigger one, and §13 never anticipated it.
  it('names partial credit', () => {
    expect(CATEGORY_FOOTNOTE).toMatch(/partial credit/i);
  });

  it('names the adaptive-difficulty effect, not just partial credit', () => {
    expect(CATEGORY_FOOTNOTE).toMatch(/edge of what you can do/i);
    expect(CATEGORY_FOOTNOTE).toMatch(/near half/i);
  });

  it('tells the student how to read the numbers instead', () => {
    expect(CATEGORY_FOOTNOTE).toMatch(/against each other/i);
  });
});

describe('clinicalJudgment', () => {
  const caseItems = (n: number, correct: number) =>
    Array.from({ length: n }, (_, i) =>
      item({ position: i + 1, isCaseChild: true, isCorrect: i < correct }),
    );

  it('returns null when too few case questions were served to be honest', () => {
    expect(clinicalJudgment(caseItems(2, 2), 1)).toBeNull();
  });

  it('ignores standalone questions entirely', () => {
    const mixed = [...caseItems(4, 4), item({ position: 9, isCorrect: false, scoreAwarded: 0 })];
    expect(clinicalJudgment(mixed, 1)?.itemsSeen).toBe(4);
  });

  it('bands strong / mixed / developing', () => {
    expect(clinicalJudgment(caseItems(8, 7), 2)?.band).toBe('STRONG');
    expect(clinicalJudgment(caseItems(8, 5), 2)?.band).toBe('MIXED');
    expect(clinicalJudgment(caseItems(8, 2), 2)?.band).toBe('DEVELOPING');
  });
});

describe('itemsAdministeredLine', () => {
  it('says the engine reached confidence when it did', () => {
    expect(itemsAdministeredLine(85, 'CONFIDENCE_REACHED', 4)).toContain(
      'reached confidence at question 85',
    );
  });

  it('does NOT claim confidence when the exam hit the ceiling', () => {
    const line = itemsAdministeredLine(150, 'MAX_ITEMS_HIT', 4);
    expect(line).toContain('maximum length');
    expect(line).not.toContain('confidence');
  });

  it('names the clock when time ran out', () => {
    expect(itemsAdministeredLine(118, 'TIME_LIMIT_HIT', 4)).toContain('4-hour time limit');
  });

  it('reads the limit from its argument, so the copy tracks the engine constant', () => {
    expect(itemsAdministeredLine(118, 'TIME_LIMIT_HIT', 5)).toContain('5-hour');
  });
});

describe('formatProbability', () => {
  it('caps a saturated probability instead of printing false precision', () => {
    // Today's three-rung ladder (§7.7) produces exactly this.
    expect(formatProbability(0.99999)).toBe('>99%');
  });

  it('caps the bottom too', () => {
    expect(formatProbability(0.0001)).toBe('<1%');
  });

  it('rounds ordinary values', () => {
    expect(formatProbability(0.9806)).toBe('~98%');
  });
});

describe('verdict copy (§13.1)', () => {
  it('uses the near-boundary sub-line when the result is genuinely close', () => {
    expect(isNearBoundary(0.53)).toBe(true);
    expect(verdictSubline('ABOVE_STANDARD', 0.53)).toContain('This was close');
  });

  it('never claims a real-NCLEX pass chance', () => {
    for (const p of [0.04, 0.53, 0.98]) {
      for (const v of ['ABOVE_STANDARD', 'BELOW_STANDARD'] as const) {
        const text = verdictSubline(v, p) + verdictBody(v, p);
        expect(text).not.toMatch(/NCLEX/i);
        expect(text).toContain('our');
      }
    }
  });

  it('points a near-boundary pass at the breakdown rather than congratulating it', () => {
    expect(verdictBody('ABOVE_STANDARD', 0.53)).toContain('where to focus');
  });

  it('congratulates a clear pass', () => {
    expect(verdictBody('ABOVE_STANDARD', 0.98)).toContain('tracking ready');
  });
});
