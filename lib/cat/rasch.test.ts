// mynclex/lib/cat/rasch.test.ts
//
// Unit tests for the Rasch maths. Where the plan doc states a number, the
// doc's number is the fixture — so a drift between code and plan fails here.

import { describe, it, expect } from 'vitest';
import {
  expectedScore,
  itemInformation,
  estimateAbility,
  readinessProbability,
  PRIOR_SD,
} from './rasch';
import type { CatResponse } from './types';

const item = (difficulty: number, score: number, weight = 1): CatResponse => ({
  difficulty,
  score,
  weight,
});

describe('expectedScore', () => {
  it('is a coin flip when ability matches difficulty', () => {
    expect(expectedScore(0, 0)).toBeCloseTo(0.5, 10);
    expect(expectedScore(1.3, 1.3)).toBeCloseTo(0.5, 10);
  });

  it('rises above 0.5 when the student outclasses the item', () => {
    expect(expectedScore(1, 0)).toBeGreaterThan(0.5);
    expect(expectedScore(1, 0)).toBeCloseTo(0.731, 3);
  });

  it('falls below 0.5 when the item outclasses the student', () => {
    expect(expectedScore(0, 1)).toBeCloseTo(0.269, 3);
  });

  it('is symmetric about the match point', () => {
    expect(expectedScore(2, 0) + expectedScore(0, 2)).toBeCloseTo(1, 10);
  });

  it('saturates but never reaches 0 or 1', () => {
    expect(expectedScore(10, -10)).toBeLessThan(1);
    expect(expectedScore(-10, 10)).toBeGreaterThan(0);
  });
});

describe('itemInformation', () => {
  it('peaks at 0.25 on a perfect difficulty match', () => {
    expect(itemInformation(0, 0)).toBeCloseTo(0.25, 10);
  });

  it('collapses for a badly mismatched item', () => {
    // The formal reason difficulty-matching is optimal (§7.1).
    expect(itemInformation(0, 3)).toBeLessThan(0.05);
    expect(itemInformation(0, 0)).toBeGreaterThan(itemInformation(0, 1.5));
  });
});

describe('estimateAbility — the starting position', () => {
  it('with no responses returns the prior: theta 0.0, SE 1.0 (§6)', () => {
    const { theta, se } = estimateAbility([]);
    expect(theta).toBeCloseTo(0, 6);
    expect(se).toBeCloseTo(PRIOR_SD, 2);
  });
});

describe('estimateAbility — the all-right / all-wrong case', () => {
  // This is the reason for the prior. Maximum likelihood has no answer here,
  // and it is the state after question 1 of EVERY CAT.
  it('stays finite after a single correct answer', () => {
    const { theta, se } = estimateAbility([item(0, 1)]);
    expect(Number.isFinite(theta)).toBe(true);
    expect(Number.isFinite(se)).toBe(true);
    expect(theta).toBeGreaterThan(0);
  });

  it('stays finite after a single wrong answer', () => {
    const { theta } = estimateAbility([item(0, 0)]);
    expect(Number.isFinite(theta)).toBe(true);
    expect(theta).toBeLessThan(0);
  });

  it('stays finite after twenty straight correct answers', () => {
    const all = Array.from({ length: 20 }, () => item(0, 1));
    const { theta, se } = estimateAbility(all);
    expect(Number.isFinite(theta)).toBe(true);
    expect(Number.isFinite(se)).toBe(true);
    expect(theta).toBeGreaterThan(1);
  });

  it('stays finite after twenty straight wrong answers', () => {
    const all = Array.from({ length: 20 }, () => item(0, 0));
    const { theta } = estimateAbility(all);
    expect(Number.isFinite(theta)).toBe(true);
    expect(theta).toBeLessThan(-1);
  });
});

describe('estimateAbility — direction and symmetry', () => {
  it('moves up on a correct answer and down on a wrong one', () => {
    expect(estimateAbility([item(0, 1)]).theta).toBeGreaterThan(
      estimateAbility([item(0, 0)]).theta
    );
  });

  it('a balanced history lands back at the passing standard', () => {
    const mixed = [item(0, 1), item(0, 0), item(0, 1), item(0, 0)];
    expect(estimateAbility(mixed).theta).toBeCloseTo(0, 6);
  });

  it('is order-independent — evidence is evidence', () => {
    const a = [item(-1, 1), item(0, 0), item(1, 1)];
    const b = [item(1, 1), item(-1, 1), item(0, 0)];
    expect(estimateAbility(a).theta).toBeCloseTo(estimateAbility(b).theta, 10);
  });

  it('getting a HARD item right moves the estimate further than an easy one', () => {
    const hard = estimateAbility([item(1, 1)]).theta;
    const easy = estimateAbility([item(-1, 1)]).theta;
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('estimateAbility — uncertainty shrinks with evidence', () => {
  it('SE falls as answers accumulate', () => {
    const one = estimateAbility([item(0, 1)]).se;
    const ten = estimateAbility(Array.from({ length: 10 }, (_, i) => item(0, i % 2))).se;
    const eighty = estimateAbility(Array.from({ length: 80 }, (_, i) => item(0, i % 2))).se;

    expect(one).toBeLessThan(PRIOR_SD);
    expect(ten).toBeLessThan(one);
    expect(eighty).toBeLessThan(ten);
  });

  it('reaches the SE <= 0.40 floor at roughly 25 matched items (§9.1 sizing)', () => {
    // Best case: every item perfectly matched, so information is 0.25 each.
    const twentyFive = estimateAbility(
      Array.from({ length: 25 }, (_, i) => item(0, i % 2))
    ).se;
    expect(twentyFive).toBeLessThanOrEqual(0.4);
  });
});

describe('estimateAbility — partial credit (§4.5 Option 2)', () => {
  it('a 3-of-5 SATA lands between fully wrong and fully right', () => {
    const wrong = estimateAbility([item(0, 0)]).theta;
    const partial = estimateAbility([item(0, 0.6)]).theta;
    const right = estimateAbility([item(0, 1)]).theta;

    expect(partial).toBeGreaterThan(wrong);
    expect(partial).toBeLessThan(right);
  });

  it('a half-right answer is neutral on a matched item', () => {
    expect(estimateAbility([item(0, 0.5)]).theta).toBeCloseTo(0, 6);
  });

  it('is NOT all-or-nothing — 4-of-5 differs from 0-of-5', () => {
    // The bias §4.5 Option 1 was rejected for.
    expect(estimateAbility([item(0, 0.8)]).theta).not.toBeCloseTo(
      estimateAbility([item(0, 0)]).theta,
      2
    );
  });
});

describe('estimateAbility — case children at half weight (§7.4)', () => {
  it('a half-weight answer moves the estimate less than a full-weight one', () => {
    const full = estimateAbility([item(0, 1, 1)]).theta;
    const half = estimateAbility([item(0, 1, 0.5)]).theta;

    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
  });

  it('a half-weight answer also tightens certainty less', () => {
    // §7.4 insists BOTH jobs halve together. Applying the weight to the
    // log-likelihood is what makes that automatic.
    const full = estimateAbility([item(0, 1, 1)]).se;
    const half = estimateAbility([item(0, 1, 0.5)]).se;

    expect(half).toBeGreaterThan(full);
  });

  it('two half-weight answers equal one full-weight answer, exactly', () => {
    const one = estimateAbility([item(0.3, 1, 1)]);
    const two = estimateAbility([item(0.3, 1, 0.5), item(0.3, 1, 0.5)]);

    expect(two.theta).toBeCloseTo(one.theta, 10);
    expect(two.se).toBeCloseTo(one.se, 10);
  });

  it('a 6-child case is worth about 3 standalone questions (§7.4)', () => {
    const caseBlock = Array.from({ length: 6 }, () => item(0.2, 1, 0.5));
    const threeStandalone = Array.from({ length: 3 }, () => item(0.2, 1, 1));

    const c = estimateAbility(caseBlock);
    const s = estimateAbility(threeStandalone);

    expect(c.theta).toBeCloseTo(s.theta, 10);
    expect(c.se).toBeCloseTo(s.se, 10);
  });
});

describe('readinessProbability — the §9.5 worked examples', () => {
  it('0.5 / SE 0.40 → ~89%', () => {
    expect(readinessProbability(0.5, 0.4)).toBeCloseTo(0.89, 2);
  });

  it('0.1 / SE 0.40 → ~60%', () => {
    expect(readinessProbability(0.1, 0.4)).toBeCloseTo(0.6, 2);
  });

  it('-0.3 / SE 0.40 → ~23%', () => {
    expect(readinessProbability(-0.3, 0.4)).toBeCloseTo(0.23, 2);
  });

  it('sitting exactly on the standard is a coin flip', () => {
    // 7 places, not more: the erf approximation is documented to ~1.5e-7,
    // which is far beyond what a displayed percentage needs.
    expect(readinessProbability(0, 0.4)).toBeCloseTo(0.5, 7);
  });

  it('is monotonic in ability and bounded to [0, 1]', () => {
    expect(readinessProbability(-5, 0.4)).toBeGreaterThanOrEqual(0);
    expect(readinessProbability(5, 0.4)).toBeLessThanOrEqual(1);
    expect(readinessProbability(0.6, 0.4)).toBeGreaterThan(readinessProbability(0.5, 0.4));
  });

  it('a wider error bar pulls a confident reading back toward 50%', () => {
    expect(readinessProbability(0.5, 0.8)).toBeLessThan(readinessProbability(0.5, 0.4));
  });
});
