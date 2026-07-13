// mynclex/lib/payments/readiness-credits.test.ts
//
// Locks the stage derivation: every stage, and the ordering rule that a
// terminal ending wins over the earlier milestones it coexists with.

import { describe, it, expect } from 'vitest';
import { creditStage, claimIsLive, isLapsedLive, type CreditLifecycle } from './readiness-credits';

const T = '2026-07-08T12:00:00.000Z';

function credit(over: Partial<CreditLifecycle>): CreditLifecycle {
  return {
    claimed_at: null,
    activated_at: null,
    used_at: null,
    expired_at: null,
    revoked_at: null,
    ...over,
  };
}

// isLapsedLive reads expires_at on top of the lifecycle fields.
const PAST = '2026-07-01T12:00:00.000Z'; // deadline in the past
const FUTURE = '2026-07-31T12:00:00.000Z'; // deadline still ahead
const NOW = Date.parse('2026-07-15T12:00:00.000Z');
function activeCredit(over: Partial<CreditLifecycle & { expires_at: string | null }> = {}) {
  return {
    ...credit({ claimed_at: T, activated_at: T }),
    expires_at: FUTURE,
    ...over,
  };
}

describe('creditStage — one per milestone', () => {
  it('freshly minted → UNCLAIMED', () => {
    expect(creditStage(credit({}))).toBe('UNCLAIMED');
  });
  it('a pack chosen, window not started → CLAIMED', () => {
    expect(creditStage(credit({ claimed_at: T }))).toBe('CLAIMED');
  });
  it('window running → ACTIVE', () => {
    expect(creditStage(credit({ claimed_at: T, activated_at: T }))).toBe('ACTIVE');
  });
});

describe('creditStage — terminal endings win over earlier timestamps', () => {
  it('USED even though claimed + activated are also set', () => {
    expect(creditStage(credit({ claimed_at: T, activated_at: T, used_at: T }))).toBe('USED');
  });
  it('EXPIRED (lapsed unused) — claimed + activated set, no use', () => {
    expect(creditStage(credit({ claimed_at: T, activated_at: T, expired_at: T }))).toBe('EXPIRED');
  });
  it('REVOKED wins regardless of stage reached', () => {
    expect(creditStage(credit({ claimed_at: T, activated_at: T, revoked_at: T }))).toBe('REVOKED');
    // a credit revoked before ever being claimed still reads REVOKED
    expect(creditStage(credit({ revoked_at: T }))).toBe('REVOKED');
  });
});

describe('claimIsLive — the one-shot-per-pack lens (mirrors the DB index)', () => {
  it('a used claim is still live (a sat pack can never be re-claimed)', () => {
    expect(claimIsLive(credit({ claimed_at: T, activated_at: T, used_at: T }))).toBe(true);
  });
  it('an active claim is live', () => {
    expect(claimIsLive(credit({ claimed_at: T, activated_at: T }))).toBe(true);
  });
  it('an expired claim releases the pack', () => {
    expect(claimIsLive(credit({ claimed_at: T, activated_at: T, expired_at: T }))).toBe(false);
  });
  it('a revoked claim releases the pack', () => {
    expect(claimIsLive(credit({ claimed_at: T, revoked_at: T }))).toBe(false);
  });
});

describe('isLapsedLive — the lazy-sweep predicate (§7 Lapse mechanism)', () => {
  it('ACTIVE credit past its deadline → lapsed (needs stamping)', () => {
    expect(isLapsedLive(activeCredit({ expires_at: PAST }), NOW)).toBe(true);
  });
  it('ACTIVE credit still inside the window → not lapsed', () => {
    expect(isLapsedLive(activeCredit({ expires_at: FUTURE }), NOW)).toBe(false);
  });
  it('deadline exactly now → not yet lapsed (strictly past)', () => {
    expect(isLapsedLive(activeCredit({ expires_at: new Date(NOW).toISOString() }), NOW)).toBe(false);
  });
  it('unactivated credit never lapses (no window to run out)', () => {
    expect(isLapsedLive({ ...credit({ claimed_at: T }), expires_at: null }, NOW)).toBe(false);
  });
  it('already-stamped EXPIRED credit is not re-stamped', () => {
    expect(isLapsedLive(activeCredit({ expires_at: PAST, expired_at: T }), NOW)).toBe(false);
  });
  it('a USED credit past deadline never lapses (the shot was taken)', () => {
    expect(isLapsedLive(activeCredit({ expires_at: PAST, used_at: T }), NOW)).toBe(false);
  });
  it('a REVOKED credit past deadline never lapses', () => {
    expect(isLapsedLive(activeCredit({ expires_at: PAST, revoked_at: T }), NOW)).toBe(false);
  });
});
