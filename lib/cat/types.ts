// mynclex/lib/cat/types.ts
//
// Shared types for the CAT engine's pure maths layer.
// Canonical decision record: docs/product-plan/bank-consumption-cat.html

/**
 * One answered item, as the ability estimator sees it.
 *
 * Deliberately minimal: the estimator does not care what question type this
 * was, who answered it, or when. It needs the item's difficulty, how much of
 * it the student got right, and how much that answer should count.
 */
export type CatResponse = {
  /**
   * The item's difficulty on the Rasch logit scale (`difficulty_irt`).
   * Snapshotted at selection time — see §12.7.4 on why it is copied rather
   * than joined.
   */
  difficulty: number;

  /**
   * Proportion of the item answered correctly: `score_awarded / marks`.
   * 1 = fully correct, 0 = fully wrong, 0.6 = 3-of-5 on a SATA.
   *
   * §4.5 "Option 2" — partial credit feeds the estimate as a fraction rather
   * than being flattened to right/wrong, which would bias every estimate
   * downward because NGN items are hard to ace.
   */
  score: number;

  /**
   * How much this answer counts as evidence. 1.0 for a standalone question,
   * 0.5 for a case child (§7.4 hybrid — a 6-child case is worth ~3 questions,
   * not 6, because the children share one scenario).
   */
  weight: number;
};

/** An ability estimate and how uncertain it is. */
export type AbilityEstimate = {
  /** Ability on the Rasch logit scale. 0.0 is the passing standard (§9.1). */
  theta: number;
  /** Standard error — the margin of error around `theta`. */
  se: number;
};

/**
 * The four values `nclex_attempts.cat_termination_reason` accepts (§9.4).
 *
 * The reason records WHY the exam stopped and deliberately does not carry
 * which way the verdict went — that lives in `cat_verdict`. ABANDONED is
 * produced by the student closing the browser or quitting, never by
 * `checkTermination`.
 */
export type CatTerminationReason =
  | 'CONFIDENCE_REACHED'
  | 'MAX_ITEMS_HIT'
  | 'TIME_LIMIT_HIT'
  | 'ABANDONED';

/** The two verdicts a completed CAT can produce (§9.5). */
export type CatVerdict = 'ABOVE_STANDARD' | 'BELOW_STANDARD';

/** Everything `checkTermination` needs to decide whether the exam is over. */
export type TerminationInput = {
  theta: number;
  se: number;
  /** Items administered AND answered so far. */
  itemsAdministered: number;
  /** Seconds since the exam clock started. */
  elapsedSeconds: number;
  /**
   * The exam's own time limit, in seconds — read from the attempt row's
   * `duration_seconds`, NOT from a module constant.
   *
   * REQUIRED, deliberately undefaulted (2026-07-22). TIME_LIMIT_SECONDS is
   * what STAMPS `duration_seconds` at creation; it is not the authority at
   * runtime. Two reasons the row wins:
   *
   *   1. There were two independent copies of "4 hours" — this constant and
   *      C_DURATION_SECONDS in the creation migration — with nothing keeping
   *      them in step. The runner expires on the row's copy, so a drift
   *      between them means the clock and the engine disagree about when the
   *      exam is over.
   *   2. §9.3 is reopened (4 hours vs the real NCLEX's 5). Reading the row
   *      means a change applies to NEW exams while an exam already in
   *      progress keeps the limit it started under. Reading the constant
   *      would retroactively rewrite the rules for someone mid-sitting.
   *
   * A default here would let a call site silently fall back to the constant,
   * which is exactly the bug this removes.
   */
  timeLimitSeconds: number;
};

/**
 * Continue, or stop with a reason and a verdict.
 *
 * A stop always carries a verdict: every completed CAT resolves to a side
 * (§9.5 — INCONCLUSIVE was retired 2026-07-15).
 */
export type TerminationResult =
  | { stop: false }
  | { stop: true; reason: Exclude<CatTerminationReason, 'ABANDONED'>; verdict: CatVerdict };
