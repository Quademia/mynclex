import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => mocks.createServiceRoleClient(),
}));

import {
  decide,
  formatRetry,
  checkLoginThreshold,
  checkResetThreshold,
} from './thresholds';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// A fixed clock. Every test states its event times as "n minutes before
// NOW", so nothing depends on when the suite runs.
const NOW = new Date('2026-08-06T20:00:00.000Z').getTime();
const minutesAgo = (n: number) => NOW - n * MIN;

const TEN_MIN_5 = [{ windowSec: 600, limit: 5, label: 'threshold_10min' }];
const LOGIN_RULES = [
  { windowSec: 600, limit: 5, label: 'threshold_10min' },
  { windowSec: 24 * 3600, limit: 10, label: 'threshold_24h' },
];

describe('decide', () => {
  it('allows an empty history', () => {
    expect(decide([], LOGIN_RULES, NOW)).toEqual({ blocked: false });
  });

  it('allows one under the limit', () => {
    const four = [1, 2, 3, 4].map(minutesAgo);
    expect(decide(four, TEN_MIN_5, NOW)).toEqual({ blocked: false });
  });

  it('blocks on reaching the limit exactly', () => {
    const five = [1, 2, 3, 4, 5].map(minutesAgo);
    const verdict = decide(five, TEN_MIN_5, NOW);

    expect(verdict.blocked).toBe(true);
    // The 5th-newest failure is 5 minutes old, so the 10-minute window
    // clears it in another 5.
    expect(verdict).toMatchObject({ retryAfterSeconds: 5 * 60 });
  });

  it('ignores events that have already aged out of the window', () => {
    // Five failures, but four are older than the 10-minute window.
    const stale = [11, 12, 13, 14].map(minutesAgo);
    expect(decide([...stale, minutesAgo(1)], TEN_MIN_5, NOW)).toEqual({
      blocked: false,
    });
  });

  it('does not care what order the rows arrive in', () => {
    const shuffled = [3, 1, 5, 2, 4].map(minutesAgo);
    expect(decide(shuffled, TEN_MIN_5, NOW)).toMatchObject({
      blocked: true,
      retryAfterSeconds: 5 * 60,
    });
  });

  // ⭐ The bug we declined to port. Gamma counts from the OLDEST event in
  // the window, which under-reports whenever the count has run past the
  // threshold — it would say 1 minute here, she would come back, and she
  // would still be blocked by the six failures behind it.
  it('counts from the Nth-newest, not the oldest, when over the limit', () => {
    const seven = [1, 2, 3, 4, 5, 6, 9].map(minutesAgo);
    const verdict = decide(seven, TEN_MIN_5, NOW);

    // 5th-newest is 5 minutes old → 5 minutes left.
    expect(verdict).toMatchObject({ retryAfterSeconds: 5 * 60 });
    // Gamma's answer would have been the 9-minute-old row → 60 seconds.
    expect(verdict).not.toMatchObject({ retryAfterSeconds: 60 });
  });

  it('when both rules trip, the one that lasts longer decides', () => {
    // 10 failures inside 10 minutes trips both rules at once. The 24-hour
    // rule holds her far longer, so it is the one she must be told about.
    const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 9.5].map(minutesAgo);
    const verdict = decide(ten, LOGIN_RULES, NOW);

    expect(verdict).toMatchObject({ rule: 'threshold_24h' });
    if (!verdict.blocked) throw new Error('expected blocked');
    expect(verdict.retryAfterSeconds).toBeGreaterThan(23 * 3600);
  });

  it('trips the long rule on slow, spaced-out attempts the short rule misses', () => {
    // One failure an hour: never 5 in any 10-minute window, but 10 in a day.
    const spaced = Array.from({ length: 10 }, (_, i) => NOW - (i + 1) * HOUR);
    const verdict = decide(spaced, LOGIN_RULES, NOW);

    expect(verdict).toMatchObject({ blocked: true, rule: 'threshold_24h' });
  });

  it('never reports a countdown under 30 seconds', () => {
    // The 5th-newest is 9 min 59 s old — 1 second left on the real clock.
    const five = [
      NOW - 1 * MIN,
      NOW - 2 * MIN,
      NOW - 3 * MIN,
      NOW - 4 * MIN,
      NOW - (10 * MIN - 1000),
    ];
    const verdict = decide(five, TEN_MIN_5, NOW);

    expect(verdict).toMatchObject({ blocked: true, retryAfterSeconds: 30 });
  });
});

describe('formatRetry', () => {
  it('reads like a person, not a unit conversion', () => {
    expect(formatRetry(30)).toBe('in a minute');
    expect(formatRetry(90)).toBe('in a minute');
    expect(formatRetry(300)).toBe('in 5 minutes');
    expect(formatRetry(3600)).toBe('in about an hour');
    expect(formatRetry(23 * 3600)).toBe('in about 23 hours');
  });

  it('rounds up, so she is never sent back early', () => {
    // 5 min 1 s must not become "5 minutes".
    expect(formatRetry(301)).toBe('in 6 minutes');
  });
});

describe('the queries', () => {
  /** Stands in for the PostgREST builder chain, which returns itself. */
  function stubRows(result: { data?: unknown; error?: unknown }) {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'gte', 'order']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.limit = mocks.limit.mockResolvedValue(result);
    mocks.createServiceRoleClient.mockReturnValue({ from: vi.fn(() => chain) });
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('counts LOGIN_FAIL only — a block must not feed the counter that made it', async () => {
    const chain = stubRows({ data: [], error: null });
    await checkLoginThreshold('nurse@example.com');

    expect(chain.in).toHaveBeenCalledWith('event_type', ['LOGIN_FAIL']);
  });

  it('counts RESET_REQUESTED only', async () => {
    const chain = stubRows({ data: [], error: null });
    await checkResetThreshold('nurse@example.com');

    expect(chain.in).toHaveBeenCalledWith('event_type', ['RESET_REQUESTED']);
  });

  it('lowercases the address, so case cannot be used to reset the count', async () => {
    const chain = stubRows({ data: [], error: null });
    await checkLoginThreshold('  Nurse@Example.COM  ');

    expect(chain.eq).toHaveBeenCalledWith('email', 'nurse@example.com');
  });

  // ⭐ The contract that matters most: a broken query must not take the
  // login form down with it.
  it('fails OPEN when the query errors', async () => {
    stubRows({ data: null, error: { message: 'connection refused' } });

    await expect(checkLoginThreshold('nurse@example.com')).resolves.toEqual({
      blocked: false,
    });
  });

  it('fails OPEN when the client throws outright', async () => {
    mocks.createServiceRoleClient.mockImplementation(() => {
      throw new Error('no service role key');
    });

    await expect(checkLoginThreshold('nurse@example.com')).resolves.toEqual({
      blocked: false,
    });
  });

  it('allows an empty address without touching the database', async () => {
    stubRows({ data: [], error: null });

    await expect(checkLoginThreshold('   ')).resolves.toEqual({ blocked: false });
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('blocks on real rows coming back from the table', async () => {
    const rows = [1, 2, 3, 4, 5].map((m) => ({
      occurred_at: new Date(Date.now() - m * MIN).toISOString(),
    }));
    stubRows({ data: rows, error: null });

    const verdict = await checkLoginThreshold('nurse@example.com');
    expect(verdict).toMatchObject({ blocked: true, rule: 'threshold_10min' });
  });
});
