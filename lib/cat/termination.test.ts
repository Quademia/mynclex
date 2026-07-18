// mynclex/lib/cat/termination.test.ts
//
// Unit tests for the stopping rules (§9). The §9.1 worked examples are
// fixtures, so if the confidence multiplier is ever quietly changed these
// fail loudly.

import { describe, it, expect } from 'vitest';
import {
  checkTermination,
  bandClearsStandard,
  MIN_ITEMS,
  MAX_ITEMS,
  TIME_LIMIT_SECONDS,
  CONFIDENCE_Z,
} from './termination';
import { readinessProbability } from './rasch';

const at = (over: Partial<Parameters<typeof checkTermination>[0]> = {}) =>
  checkTermination({
    theta: 0,
    se: 0.3,
    itemsAdministered: 100,
    elapsedSeconds: 3600,
    ...over,
  });

describe('the confidence multiplier is 95%', () => {
  it('is 1.96, not 1.0', () => {
    // An earlier §9.1 draft implied a +/-1 SE band (~68% confidence), which
    // would issue "you're ready" at ~84% one-sided confidence — wrong about
    // one time in six. Guard the value itself.
    expect(CONFIDENCE_Z).toBeCloseTo(1.96, 10);
  });
});

describe('bandClearsStandard — the §9.1 worked examples', () => {
  it('0.5 / SE 0.40 does NOT clear (band -0.28 to 1.28)', () => {
    expect(bandClearsStandard(0.5, 0.4)).toBe(false);
  });

  it('0.9 / SE 0.40 clears (band 0.12 to 1.68)', () => {
    expect(bandClearsStandard(0.9, 0.4)).toBe(true);
  });

  it('0.5 / SE 0.20 clears (band 0.11 to 0.89)', () => {
    expect(bandClearsStandard(0.5, 0.2)).toBe(true);
  });

  it('clears on the below side too', () => {
    expect(bandClearsStandard(-0.9, 0.4)).toBe(true);
  });

  it('never clears when the estimate sits on the standard', () => {
    expect(bandClearsStandard(0, 0.01)).toBe(false);
  });
});

describe('the band test and the readiness probability agree (§9.5)', () => {
  // A 95% band clearing zero is EXACTLY P(ability > 0) >= 0.975. The two are
  // the same statement, so a disagreement means a bug in one of them.
  it('agree across a sweep of estimates', () => {
    for (let theta = -2; theta <= 2; theta += 0.05) {
      for (const se of [0.15, 0.2, 0.3, 0.4, 0.6]) {
        const p = readinessProbability(theta, se);
        const byProbability = p >= 0.975 || p <= 0.025;
        expect(bandClearsStandard(theta, se)).toBe(byProbability);
      }
    }
  });
});

describe('checkTermination — confidence reached (§9.1)', () => {
  it('stops ABOVE when sharp, separated and past the minimum', () => {
    expect(at({ theta: 0.9, se: 0.3, itemsAdministered: 85 })).toEqual({
      stop: true,
      reason: 'CONFIDENCE_REACHED',
      verdict: 'ABOVE_STANDARD',
    });
  });

  it('stops BELOW on the other side', () => {
    expect(at({ theta: -0.9, se: 0.3, itemsAdministered: 90 })).toEqual({
      stop: true,
      reason: 'CONFIDENCE_REACHED',
      verdict: 'BELOW_STANDARD',
    });
  });

  it('does NOT stop before the 85-item minimum, however sharp', () => {
    expect(at({ theta: 1.5, se: 0.1, itemsAdministered: 84 })).toEqual({ stop: false });
  });

  it('does NOT stop when the estimate is sharp but sits near the line', () => {
    // Separation rule, not just precision.
    expect(at({ theta: 0.05, se: 0.2, itemsAdministered: 100 })).toEqual({ stop: false });
  });

  it('does NOT stop when separated but the SE floor is not met', () => {
    // Precision rule, not just separation. theta 3.0 / SE 0.9 clears the band
    // (3.0 - 1.76 > 0) but the estimate is still too blunt.
    expect(bandClearsStandard(3, 0.9)).toBe(true);
    expect(at({ theta: 3, se: 0.9, itemsAdministered: 100 })).toEqual({ stop: false });
  });

  it('the two conditions are genuinely independent', () => {
    // Precision without separation, and separation without precision, both
    // continue — only together do they stop.
    expect(at({ theta: 0.05, se: 0.1, itemsAdministered: 100 }).stop).toBe(false);
    expect(at({ theta: 3, se: 0.9, itemsAdministered: 100 }).stop).toBe(false);
    expect(at({ theta: 0.9, se: 0.3, itemsAdministered: 100 }).stop).toBe(true);
  });
});

describe('checkTermination — maximum length (§9.4)', () => {
  it('stops at 150 even with a blunt, borderline estimate', () => {
    expect(at({ theta: 0.05, se: 0.9, itemsAdministered: MAX_ITEMS })).toEqual({
      stop: true,
      reason: 'MAX_ITEMS_HIT',
      verdict: 'ABOVE_STANDARD',
    });
  });

  it('resolves by side, never inconclusive (§9.5)', () => {
    expect(at({ theta: -0.01, se: 0.9, itemsAdministered: MAX_ITEMS }).stop).toBe(true);
    expect(
      at({ theta: -0.01, se: 0.9, itemsAdministered: MAX_ITEMS })
    ).toMatchObject({ verdict: 'BELOW_STANDARD' });
  });

  it('treats exactly 0.0 as above the standard', () => {
    expect(at({ theta: 0, se: 0.9, itemsAdministered: MAX_ITEMS })).toMatchObject({
      verdict: 'ABOVE_STANDARD',
    });
  });
});

describe('checkTermination — time limit (§9.3)', () => {
  it('stops at 4 hours, resolving by side when past the minimum', () => {
    expect(
      at({ theta: 0.4, se: 0.6, itemsAdministered: 100, elapsedSeconds: TIME_LIMIT_SECONDS })
    ).toEqual({ stop: true, reason: 'TIME_LIMIT_HIT', verdict: 'ABOVE_STANDARD' });
  });

  it('resolves BELOW when fewer than 85 answered, whatever the estimate', () => {
    // The real NCLEX Run-Out-Of-Time rule: too little evidence to credit.
    expect(
      at({ theta: 1.8, se: 0.5, itemsAdministered: 40, elapsedSeconds: TIME_LIMIT_SECONDS })
    ).toEqual({ stop: true, reason: 'TIME_LIMIT_HIT', verdict: 'BELOW_STANDARD' });
  });

  it('does not stop a second before the limit', () => {
    expect(
      at({ theta: 0.2, se: 0.6, itemsAdministered: 100, elapsedSeconds: TIME_LIMIT_SECONDS - 1 })
    ).toEqual({ stop: false });
  });
});

describe('checkTermination — precedence when conditions collide', () => {
  it('confidence wins over max-items at question 150', () => {
    // Both true. Confidence is the more informative reason: the engine
    // measured the student rather than running out of room.
    expect(
      at({ theta: 0.9, se: 0.3, itemsAdministered: MAX_ITEMS })
    ).toMatchObject({ reason: 'CONFIDENCE_REACHED' });
  });

  it('confidence wins over a time-out', () => {
    expect(
      at({ theta: 0.9, se: 0.3, itemsAdministered: 100, elapsedSeconds: TIME_LIMIT_SECONDS })
    ).toMatchObject({ reason: 'CONFIDENCE_REACHED' });
  });

  it('the verdict is the same whichever reason wins', () => {
    const a = at({ theta: 0.9, se: 0.3, itemsAdministered: MAX_ITEMS });
    const b = at({ theta: 0.9, se: 0.9, itemsAdministered: MAX_ITEMS });
    expect(a).toMatchObject({ verdict: 'ABOVE_STANDARD' });
    expect(b).toMatchObject({ verdict: 'ABOVE_STANDARD' });
  });
});

describe('checkTermination — the ordinary case', () => {
  it('continues mid-exam', () => {
    expect(at({ theta: 0.2, se: 0.5, itemsAdministered: 40 })).toEqual({ stop: false });
  });

  it('never returns ABANDONED — that is a student action, not a state (§9.4)', () => {
    const results = [
      at({ itemsAdministered: 0, elapsedSeconds: 0 }),
      at({ itemsAdministered: MAX_ITEMS }),
      at({ elapsedSeconds: TIME_LIMIT_SECONDS, itemsAdministered: 10 }),
    ];
    for (const r of results) {
      if (r.stop) expect(r.reason).not.toBe('ABANDONED');
    }
  });

  it('the minimum is 85 and the maximum 150 (§9.2, NGN not pre-NGN)', () => {
    expect(MIN_ITEMS).toBe(85);
    expect(MAX_ITEMS).toBe(150);
  });
});
