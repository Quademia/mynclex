// mynclex/lib/cat/termination.ts
//
// When does a CAT stop, and what verdict does it carry out?
// Pure — the caller supplies elapsed time, this module never reads a clock.
//
// Canonical decision record: docs/product-plan/bank-consumption-cat.html §9.

import { PASSING_THETA } from './rasch';
import type { CatVerdict, TerminationInput, TerminationResult } from './types';

// ── Thresholds (§9) ──────────────────────────────────────────────────

/** The engine cannot stop before this, however fast the SE converges (§9.2). */
export const MIN_ITEMS = 85;

/** Forced stop at this count regardless of SE (§9.2). */
export const MAX_ITEMS = 150;

/**
 * 5 hours (§9.3, moved from 4 on 2026-07-25). Matches the real NCLEX clock —
 * a ceiling only ever cuts off a slow candidate, so the longer limit is both
 * kinder and more faithful (§9.2's "match real NCLEX exactly" applied to the
 * time dimension).
 *
 * This is the CREATION default — it is what `create_cat_attempt` stamps into
 * the attempt's `duration_seconds`, and what the marketing/home surfaces
 * quote. It is NOT the runtime authority: `checkTermination` takes the limit
 * from the attempt row (see `TerminationInput.timeLimitSeconds`), so an exam
 * already in progress is judged against the limit it actually started under
 * (a CAT created under the old 4h keeps 4h).
 *
 * ⚠ Kept in step with C_DURATION_SECONDS in
 * `20260816120000_cat_time_limit_5h.sql` by the test in
 * `termination.test.ts` — the SQL side cannot import this.
 */
export const TIME_LIMIT_SECONDS = 5 * 60 * 60;

/** The precision floor: the estimate must be this sharp to stop early (§9.1). */
export const SE_THRESHOLD = 0.4;

/**
 * The 95% confidence multiplier (§9.1, settled 2026-07-19).
 *
 * The estimate's 95% interval — theta ± 1.96·SE — must lie entirely on one
 * side of the passing standard. This mirrors the real NCLEX's 95%
 * confidence-interval rule.
 *
 * Do not quietly lower this. An earlier draft of §9.1 illustrated the rule
 * with a ±1 SE band (~68% confidence), which would issue "you're ready"
 * verdicts at ~84% one-sided confidence — wrong roughly one time in six.
 */
export const CONFIDENCE_Z = 1.96;

// ── Helpers ──────────────────────────────────────────────────────────

/** Which side of the passing standard the estimate sits on (§9.5). */
function verdictBySide(theta: number): CatVerdict {
  return theta >= PASSING_THETA ? 'ABOVE_STANDARD' : 'BELOW_STANDARD';
}

/**
 * Does the 95% interval clear the passing standard entirely?
 *
 * Equivalent to readinessProbability(theta, se) >= 0.975 (above) or
 * <= 0.025 (below) — §9.5 records the equivalence, and the test suite
 * asserts the two agree.
 */
export function bandClearsStandard(theta: number, se: number): boolean {
  const margin = CONFIDENCE_Z * se;
  return theta - margin > PASSING_THETA || theta + margin < PASSING_THETA;
}

// ── The check ────────────────────────────────────────────────────────

/**
 * Decide whether the exam is over, and with what verdict.
 *
 * Called after each answer is scored and the estimate updated.
 *
 * PRECEDENCE (a build decision, 2026-07-19). Conditions can co-occur — a
 * student can reach question 150 at the same moment the estimate gets sure.
 * Confidence is checked FIRST because it is the most informative reason: it
 * says the engine actually measured the student, rather than running out of
 * room. The verdict is identical either way (both resolve by side), so this
 * only affects the reason recorded, never the result.
 *
 * ABANDONED is never returned here — it is a student action (browser close
 * or quit), not a state the engine detects (§9.4).
 */
export function checkTermination(input: TerminationInput): TerminationResult {
  const { theta, se, itemsAdministered, elapsedSeconds, timeLimitSeconds } = input;

  // 1. Confidence reached — the engine is sure (§9.1).
  //    All three must hold: enough items, a sharp enough estimate, and an
  //    interval that clears the standard. The first two are separate
  //    requirements, not one: a sharp estimate sitting at theta = 0.05 fails
  //    the band test, and a distant estimate with a huge SE fails the floor.
  if (
    itemsAdministered >= MIN_ITEMS &&
    se <= SE_THRESHOLD &&
    bandClearsStandard(theta, se)
  ) {
    return { stop: true, reason: 'CONFIDENCE_REACHED', verdict: verdictBySide(theta) };
  }

  // 2. Maximum length — 150 items without ever getting sure (§9.4).
  //    The confidence requirement is dropped and the verdict is decided by
  //    which side the final estimate landed on, mirroring the real NCLEX
  //    Maximum-Length rule. Never "inconclusive" (§9.5).
  if (itemsAdministered >= MAX_ITEMS) {
    return { stop: true, reason: 'MAX_ITEMS_HIT', verdict: verdictBySide(theta) };
  }

  // 3. Time-out (§9.3 / §9.4).
  //    At or past the minimum, resolve by side as above. Below the minimum
  //    there is not enough evidence to credit a pass, so it resolves BELOW —
  //    the real NCLEX Run-Out-Of-Time rule.
  if (elapsedSeconds >= timeLimitSeconds) {
    const verdict: CatVerdict =
      itemsAdministered >= MIN_ITEMS ? verdictBySide(theta) : 'BELOW_STANDARD';
    return { stop: true, reason: 'TIME_LIMIT_HIT', verdict };
  }

  return { stop: false };
}
