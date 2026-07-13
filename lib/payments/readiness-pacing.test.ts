// mynclex/lib/payments/readiness-pacing.test.ts
import { describe, it, expect } from 'vitest';
import {
  perQuestionBudgetSec,
  rushedThresholdSec,
  isRushed,
  formatSecsWords,
  summarizePacing,
} from './readiness-pacing';

describe('readiness-pacing — budget + rushed threshold', () => {
  it('budget is duration ÷ count; standard pack ≈ 120s', () => {
    expect(perQuestionBudgetSec(12000, 100)).toBe(120); // 3h20m over 100 Q
    expect(perQuestionBudgetSec(null, 100)).toBeNull();
    expect(perQuestionBudgetSec(12000, 0)).toBeNull();
  });

  it('rushed threshold is 0.6×budget (~72s at the 120s standard, near the design 70s)', () => {
    expect(rushedThresholdSec(120)).toBe(72);
    expect(rushedThresholdSec(null)).toBeNull();
  });

  it('isRushed only fires for an answered question under threshold', () => {
    expect(isRushed(40, true, 120)).toBe(true); // 40 < 72
    expect(isRushed(90, true, 120)).toBe(false); // 90 > 72
    expect(isRushed(40, false, 120)).toBe(false); // skipped → never rushed
    expect(isRushed(null, true, 120)).toBe(false); // no time → not rushed
    expect(isRushed(40, true, null)).toBe(false); // untimed pack → no threshold
  });
});

describe('readiness-pacing — formatSecsWords', () => {
  it('formats compactly', () => {
    expect(formatSecsWords(45)).toBe('45s');
    expect(formatSecsWords(108)).toBe('1m 48s');
    expect(formatSecsWords(1560)).toBe('26m'); // clean minutes → no "0s"
    expect(formatSecsWords(3660)).toBe('1h 1m');
    expect(formatSecsWords(-5)).toBe('0s'); // clamp
  });
});

describe('readiness-pacing — summarizePacing', () => {
  const items = [
    { timeSpentSec: 40, answered: true }, // rushed
    { timeSpentSec: 200, answered: true }, // lingered
    { timeSpentSec: 100, answered: true },
    { timeSpentSec: 31, answered: false }, // read-then-skip — not counted in avg/rushed
  ];

  it('averages over answered-with-time only; counts rushed; excludes skips', () => {
    const p = summarizePacing(items, { durationSec: 480, wallUsedSec: 300 });
    // budget = 480/4 = 120 → threshold 72
    expect(p.budgetSec).toBe(120);
    expect(p.totalCount).toBe(4);
    expect(p.answeredCount).toBe(3);
    expect(p.avgAnsweredSec).toBe(Math.round((40 + 200 + 100) / 3)); // 113
    expect(p.rushedCount).toBe(1); // only the 40s answered question
    expect(p.spareSec).toBe(180); // 480 − 300
    expect(p.hasTime).toBe(true);
  });

  it('degrades when the sitting predates the engine (no captured time)', () => {
    const none = [
      { timeSpentSec: null, answered: true },
      { timeSpentSec: null, answered: false },
    ];
    const p = summarizePacing(none, { durationSec: 240, wallUsedSec: null });
    expect(p.hasTime).toBe(false);
    expect(p.avgAnsweredSec).toBeNull();
    expect(p.rushedCount).toBe(0);
    expect(p.spareSec).toBeNull(); // wall time unknown
  });
});
