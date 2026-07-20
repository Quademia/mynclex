// mynclex/lib/practice/cat/turn-transition.test.ts
//
// The CAT between-question escalation state machine (slice 6c). Pure — the
// live-clock hook is exercised in the browser.

import { describe, it, expect } from 'vitest';
import {
  transitionPhase,
  nextThresholdMs,
  canRetry,
  isBlocking,
  SPINNER_MS,
  SLOW_MS,
  STUCK_MS,
} from './turn-transition';

const running = (elapsedMs: number) => transitionPhase({ kind: 'running', elapsedMs });

describe('transitionPhase — escalation by elapsed time', () => {
  it('is idle when no turn is running', () => {
    expect(transitionPhase({ kind: 'idle' })).toBe('idle');
  });

  it('dims first, WITHOUT a spinner, so a fast turn never flickers one', () => {
    expect(running(0)).toBe('dim');
    expect(running(SPINNER_MS - 1)).toBe('dim');
  });

  it('shows the spinner from 300ms', () => {
    expect(running(SPINNER_MS)).toBe('spinner');
    expect(running(SLOW_MS - 1)).toBe('spinner');
  });

  it('adds "still loading" from 3s', () => {
    expect(running(SLOW_MS)).toBe('slow');
    expect(running(STUCK_MS - 1)).toBe('slow');
  });

  it('offers Retry from 10s while the request may still be in flight', () => {
    expect(running(STUCK_MS)).toBe('stuck');
    expect(running(60_000)).toBe('stuck');
  });

  it('goes straight to error (with Retry) when the turn fails', () => {
    expect(transitionPhase({ kind: 'error' })).toBe('error');
  });
});

describe('a fast turn shows only the dim', () => {
  it('never reaches a spinner under 300ms', () => {
    for (const ms of [0, 50, 120, 299]) {
      expect(running(ms)).toBe('dim');
    }
  });
});

describe('nextThresholdMs — what the hook schedules toward', () => {
  it('points at the next boundary', () => {
    expect(nextThresholdMs(0)).toBe(SPINNER_MS);
    expect(nextThresholdMs(SPINNER_MS)).toBe(SLOW_MS);
    expect(nextThresholdMs(SLOW_MS)).toBe(STUCK_MS);
  });

  it('is null past the last threshold — nothing more to escalate to', () => {
    expect(nextThresholdMs(STUCK_MS)).toBeNull();
    expect(nextThresholdMs(STUCK_MS + 5_000)).toBeNull();
  });
});

describe('canRetry / isBlocking', () => {
  it('offers Retry only when stuck or errored', () => {
    expect(canRetry('idle')).toBe(false);
    expect(canRetry('dim')).toBe(false);
    expect(canRetry('spinner')).toBe(false);
    expect(canRetry('slow')).toBe(false);
    expect(canRetry('stuck')).toBe(true);
    expect(canRetry('error')).toBe(true);
  });

  it('blocks interaction on every phase but idle', () => {
    expect(isBlocking('idle')).toBe(false);
    for (const p of ['dim', 'spinner', 'slow', 'stuck', 'error'] as const) {
      expect(isBlocking(p)).toBe(true);
    }
  });
});
