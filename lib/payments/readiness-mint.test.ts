// mynclex/lib/payments/readiness-mint.test.ts
//
// Locks the mint DECISION against the readiness-credits trap. The four
// §7 worked examples are here, and the BANK_30D case exists specifically
// so a pack_type-keyed regression (which would drop bundled credits)
// cannot pass the suite: BANK_90D must mint 2, BANK_30D must mint 0, and
// no rewrite that keys the count on pack_type can satisfy both.

import { describe, it, expect } from 'vitest';
import { planActivationGrants } from './readiness-mint';

describe('planActivationGrants — §7 worked examples', () => {
  it('BANK_90D: a bank subscription AND 2 bundled credits', () => {
    expect(planActivationGrants({ pack_type: 'BANK_DURATION', readiness_credits: 2 })).toEqual({
      subscription: true,
      creditCount: 2,
      creditSource: 'BANK_BUNDLE',
    });
  });

  it('READINESS_SELECT3: 3 credits, NO subscription', () => {
    expect(planActivationGrants({ pack_type: 'READINESS', readiness_credits: 3 })).toEqual({
      subscription: false,
      creditCount: 3,
      creditSource: 'SELF_PURCHASE',
    });
  });

  it('BANK_30D: a subscription and ZERO credits (the count guard, not a type check)', () => {
    expect(planActivationGrants({ pack_type: 'BANK_DURATION', readiness_credits: 0 })).toEqual({
      subscription: true,
      creditCount: 0,
      creditSource: null,
    });
  });

  it('BANK_365D: a subscription AND 5 bundled credits', () => {
    expect(planActivationGrants({ pack_type: 'BANK_DURATION', readiness_credits: 5 })).toEqual({
      subscription: true,
      creditCount: 5,
      creditSource: 'BANK_BUNDLE',
    });
  });

  it('READINESS_SINGLE: 1 credit, NO subscription', () => {
    expect(planActivationGrants({ pack_type: 'READINESS', readiness_credits: 1 })).toEqual({
      subscription: false,
      creditCount: 1,
      creditSource: 'SELF_PURCHASE',
    });
  });
});

describe('planActivationGrants — the trap', () => {
  // The count is readiness_credits regardless of pack_type. These two
  // together are unsatisfiable by any implementation that branches the
  // count on pack_type.
  it('mints the credit count from readiness_credits, not from pack_type', () => {
    const bankBundle = planActivationGrants({ pack_type: 'BANK_DURATION', readiness_credits: 2 });
    const standalone = planActivationGrants({ pack_type: 'READINESS', readiness_credits: 2 });
    expect(bankBundle.creditCount).toBe(2);
    expect(standalone.creditCount).toBe(2);
    // Only the provenance tag differs by type.
    expect(bankBundle.creditSource).toBe('BANK_BUNDLE');
    expect(standalone.creditSource).toBe('SELF_PURCHASE');
  });

  it('never grants a subscription for a readiness product, at any credit count', () => {
    for (const c of [1, 2, 3, 5, 9]) {
      expect(planActivationGrants({ pack_type: 'READINESS', readiness_credits: c }).subscription).toBe(false);
    }
  });

  it('always grants a subscription for a bank pass, even with zero credits', () => {
    expect(planActivationGrants({ pack_type: 'BANK_DURATION', readiness_credits: 0 }).subscription).toBe(true);
  });
});

describe('planActivationGrants — defensive edges', () => {
  it('clamps a stray negative credit count to zero (no source)', () => {
    expect(planActivationGrants({ pack_type: 'BANK_DURATION', readiness_credits: -3 })).toEqual({
      subscription: true,
      creditCount: 0,
      creditSource: null,
    });
  });

  it('truncates a fractional count', () => {
    expect(planActivationGrants({ pack_type: 'READINESS', readiness_credits: 2.9 }).creditCount).toBe(2);
  });
});
