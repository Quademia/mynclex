// mynclex/lib/practice/cat/turn-transition.ts
//
// The between-question transition for a CAT — pure state machine (§10.1 / §16,
// slice 6c). No timers, no React, no DOM: a function of "is a turn in flight"
// and "how long has it been", so the escalation thresholds are unit-testable
// in isolation. The thin hook that drives it with a real clock is
// use-turn-transition.ts.
//
// WHY IT ESCALATES. A CAT turn is a server round-trip (score → re-estimate →
// select next). On a fast connection it is imperceptible. On the audience's
// mobile data it can take seconds, or drop. The student must never be left
// staring at an answered question with no idea whether it worked — so the wait
// dims and, past thresholds, explains itself and finally offers a Retry.
//
// Retry is only safe because of the idempotency guard (CatTurnInput
// .expectedItemId, wired for real 2026-07-21): re-submitting a turn that had
// already landed replays instead of recording the answer against the next
// question.

/** How long a turn has been in flight, and whether it failed. */
export type TurnStatus =
  /** No turn running — the question is live and interactive. */
  | { kind: 'idle' }
  /** A turn is in flight; `elapsedMs` since it began. */
  | { kind: 'running'; elapsedMs: number }
  /** The turn failed (network or server). Retry is offered immediately. */
  | { kind: 'error' };

/**
 * What the overlay should show. A single flat phase the view switches on.
 *
 *  - `idle`     nothing; the question is interactive
 *  - `dim`      dimmed + inputs inert, no spinner (0–300ms — a fast turn shows
 *               ONLY this and never flickers a spinner)
 *  - `spinner`  dimmed + spinner (300ms–3s)
 *  - `slow`     + "Still loading…" (3s–10s)
 *  - `stuck`    + Retry, request may still be in flight (10s+)
 *  - `error`    the turn failed: message + Retry, nothing in flight
 */
export type TransitionPhase = 'idle' | 'dim' | 'spinner' | 'slow' | 'stuck' | 'error';

/**
 * Escalation thresholds in ms (§16, slice 6c). Exported so the hook's tick
 * cadence and the tests reference the same numbers, and so a future tuning
 * pass is one edit.
 *
 * 300ms before ANY spinner is deliberate: below it the turn is effectively
 * instant and a spinner would be a flicker. 10s before Retry errs toward
 * "let it finish" — most slow turns on mobile data do land in that window, and
 * offering Retry too eagerly invites a needless resubmit round-trip.
 */
export const SPINNER_MS = 300;
export const SLOW_MS = 3_000;
export const STUCK_MS = 10_000;

/** The next threshold strictly after `elapsedMs`, or null past the last one. */
export function nextThresholdMs(elapsedMs: number): number | null {
  if (elapsedMs < SPINNER_MS) return SPINNER_MS;
  if (elapsedMs < SLOW_MS) return SLOW_MS;
  if (elapsedMs < STUCK_MS) return STUCK_MS;
  return null;
}

/** Map status → the phase the overlay renders. */
export function transitionPhase(status: TurnStatus): TransitionPhase {
  if (status.kind === 'idle') return 'idle';
  if (status.kind === 'error') return 'error';

  const { elapsedMs } = status;
  if (elapsedMs >= STUCK_MS) return 'stuck';
  if (elapsedMs >= SLOW_MS) return 'slow';
  if (elapsedMs >= SPINNER_MS) return 'spinner';
  return 'dim';
}

/** Is a Retry control offered in this phase? */
export function canRetry(phase: TransitionPhase): boolean {
  return phase === 'stuck' || phase === 'error';
}

/** Should interaction be blocked (dim + inert)? Every non-idle phase. */
export function isBlocking(phase: TransitionPhase): boolean {
  return phase !== 'idle';
}
