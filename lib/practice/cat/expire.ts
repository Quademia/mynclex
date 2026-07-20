// mynclex/lib/practice/cat/expire.ts
//
// Ending a CAT when the clock runs out and there is NO answer to score.
//
// Plan: bank-consumption-cat.html §9.3, §9.4, §19.4.6.
//
// WHY THIS EXISTS — the defect it fixes (found 2026-07-21, fixed 2026-07-22).
//
// checkTermination has always had a correct TIME_LIMIT_HIT branch, but it is
// reached only from playTurn, and playTurn needs an answer to score. A
// time-out is precisely the case where there is no answer: the clock ran out
// while the student was still reading. Meanwhile the runner's generic
// auto-expire (nclex_expire_attempt) fires the instant the countdown hits
// zero, knows nothing about `mode`, and writes NONE of the cat_* columns.
//
// The generic path therefore won every race, and TIME_LIMIT_HIT was dead
// code. A student who answered 149 questions and ran out of time on the last
// was shown "your exam ended early" with no verdict at all, while their
// ability estimate sat unread in cat_theta_before. Confirmed on dev attempt
// 4113c191: TIMED_OUT, 49 items, all three CAT columns NULL.
//
// This module is playTurn minus step 2 (score the answer):
//
//   1. load the attempt's clock + response history   ← DB read
//   2. -- nothing to score --
//   3. re-estimate ability from the history alone    ← @/lib/cat (pure)
//   4. apply the time-limit rule                     ← @/lib/cat (pure)
//   5. hand the verdict to nclex_expire_cat_attempt  ← DB write
//
// Like playTurn, steps 3-4 are pure: if either throws, nothing is written.
//
// THIS RUNS SERVER-SIDE ONLY, for the same reason playTurn does — a student
// must never be able to post their own ability estimate or verdict.

import 'server-only';

import { estimateAbility, checkTermination, readinessProbability } from '@/lib/cat';
import type { CatVerdict } from '@/lib/cat';
import { historyToResponses, type CatDb } from './turn';

/** What the caller hands in. */
export type CatExpireInput = {
  attemptId: string;
  /**
   * Seconds since the exam clock started, as measured by the caller.
   *
   * The caller derives this from the attempt row server-side (never from the
   * browser) — see expireCatAttempt in the session actions.
   */
  elapsedSeconds: number;
};

/** The write surface. Separate from CatDb.nextItem — that one requires an answer. */
export type CatExpireDb = Pick<CatDb, 'loadAttempt' | 'loadHistory'> & {
  expire(args: {
    attemptId: string;
    theta: number;
    se: number;
    verdict: CatVerdict;
    itemsAdministered: number;
  }): Promise<void>;
};

export type CatExpireResult = {
  theta: number;
  se: number;
  verdict: CatVerdict;
  itemsAdministered: number;
  readinessProbability: number;
};

/**
 * End a timed-out CAT with a proper verdict.
 *
 * ON THE ITEM COUNT. `loadHistory` drops the newest attempt_item, and that is
 * exactly right here: in an IN_PROGRESS CAT the newest item is ALWAYS the
 * live, unanswered question (cat_next_item records the answer and inserts the
 * next item in one transaction, so a served item is unanswered until the next
 * turn lands). So history.length is the number of questions the student
 * actually ANSWERED — which is both what §9.3's ">= 85 items" rule means by
 * "administered", and what the report's "You answered N questions" sentence
 * claims. Counting the abandoned question would inflate both by one.
 *
 * historyToResponses independently skips any row with no score, so even if
 * that invariant were ever broken the estimate could not be polluted by an
 * unanswered question.
 */
export async function expireCat(
  db: CatExpireDb,
  input: CatExpireInput,
): Promise<CatExpireResult> {
  const [attempt, history] = await Promise.all([
    db.loadAttempt(input.attemptId),
    db.loadHistory(input.attemptId),
  ]);

  // 3. Estimate from the answered history alone.
  const { theta, se } = estimateAbility(historyToResponses(history));

  // 4. The verdict.
  //
  // THE PRECONDITION IS THE CLOCK, and it is checked here rather than
  // inferred from the rule's answer. This function's whole premise is that
  // the exam ran out of time; writing a verdict for an exam still in play
  // would be a fabrication, so fail loudly instead.
  const timeLimitSeconds = attempt.duration_seconds ?? 0;
  if (input.elapsedSeconds < timeLimitSeconds) {
    throw new Error(
      `expireCat called on an attempt that has not timed out ` +
      `(elapsed ${input.elapsedSeconds}s of ${timeLimitSeconds}s)`,
    );
  }

  // The SAME checkTermination the engine uses, so a CAT that times out
  // mid-turn and one that times out between turns cannot resolve to
  // different verdicts. Reimplementing the rule here is what would let the
  // two drift.
  const itemsAdministered = history.length;
  const decision = checkTermination({
    theta,
    se,
    itemsAdministered,
    elapsedSeconds: input.elapsedSeconds,
    timeLimitSeconds,
  });

  // Past the limit the rule ALWAYS stops — case 3 is unconditional on
  // elapsed time — so this cannot fire. Kept as an assertion because the
  // alternative to a verdict here is the original defect: no verdict at all.
  if (!decision.stop) {
    throw new Error('expireCat: the stopping rule did not resolve a timed-out exam');
  }

  // WHY THE REASON IS ALWAYS TIME_LIMIT_HIT even when the rule names
  // CONFIDENCE_REACHED. checkTermination checks confidence first, because
  // among conditions true at the same DECISION POINT that is the most
  // informative reason (§9.4). But this is not a decision point the engine
  // reached — it is the clock expiring on an exam nobody stopped. What ended
  // this exam was time, and that is what the record should say.
  //
  // In a live CAT the confidence branch cannot be reachable here anyway: the
  // previous turn evaluated the same evidence and the same item count, and
  // chose to continue. It fires only on synthetic histories.
  //
  // The VERDICT is taken from the rule either way, so the student's result
  // is unaffected by which branch named it — and every branch resolves by
  // side except the sub-85 time case, which only the time branch can reach
  // (confidence is gated at 85 items, the ceiling at 150).

  // 5. Persist.
  await db.expire({
    attemptId: input.attemptId,
    theta,
    se,
    verdict: decision.verdict,
    itemsAdministered,
  });

  return {
    theta,
    se,
    verdict: decision.verdict,
    itemsAdministered,
    // Computed, never stored (§12.7.12) — same rule as playTurn.
    readinessProbability: readinessProbability(theta, se),
  };
}
