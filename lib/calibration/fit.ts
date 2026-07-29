// mynclex/lib/calibration/fit.ts
//
// The joint fit: measure every question's difficulty from how students
// actually answered it. Pure — no database, no clock, no randomness.
//
// Canonical decision record: docs/product-plan/bank-consumption-cat.html
//   §4.5   — a partial answer is a FRACTION, not right/wrong
//   §5.3   — the 30-response threshold and the weekly cadence
//   §5.3.5 — scope is the WHOLE BANK, not only the CAT pool
//   §17.6  — why this runs outside the database
//
// ── Why this folder is not lib/cat/ ──────────────────────────────────
//
// Calibration measures every question in the bank, including practice
// questions CAT will never serve (§5.3.5). Filing it under cat/ would send
// anyone asking "why did this practice question's difficulty change" to the
// wrong place. It DEPENDS on lib/cat/ for the model — one way, never the
// reverse.
//
// ── The chicken and the egg ──────────────────────────────────────────
//
// A question's difficulty cannot be worked out on its own. 60% of people
// getting it right means something very different if they were strong
// candidates than if they were weak ones — so you need their abilities. But
// an ability is measured against the difficulty of the questions faced, so
// you need the difficulties. Neither comes first.
//
// The way out is to guess both and let them correct each other: estimate
// everyone's ability from the current difficulties, then re-estimate every
// difficulty from those abilities, and repeat until nothing moves.
//
// ── One model, two consumers ─────────────────────────────────────────
//
// The person half is `estimateAbility` from lib/cat — not a copy of it, the
// function the live exam runs. §4.5 requires that recalibration read a
// response exactly as the engine does, "otherwise the difficulty values
// drift against a different definition than the engine scores against".
// Sharing the implementation makes that drift impossible rather than merely
// forbidden.
//
// It also settles the scale for free. `estimateAbility` anchors ability
// against a fixed N(0,1) prior, and 0 on that scale IS the passing standard
// (§9.1). So the difficulties this produces are measured against pass/fail
// rather than floating on a scale of their own — and a student who answered
// everything correctly gets a finite ability instead of an infinite one.

// Relative, not the `@/` alias the rest of the repo uses. This module is run
// directly by a GitHub Action via tsx, outside Next's bundler and outside
// vitest, and neither of those is guaranteed to resolve the tsconfig path
// alias. A relative path resolves everywhere, and being unable to run the
// Action locally to find out is exactly the wrong way to discover otherwise.
import { estimateAbility, expectedScore } from '../cat';
import type { AbilityEstimate, CatResponse } from '../cat';

/** One answer, as calibration sees it. */
export type CalibrationResponse = {
  studentId: string;
  itemId: string;
  /**
   * Proportion of the marks earned — `score_awarded / marks`. 3-of-5 on a
   * SATA is 0.6, never "wrong" (§4.5 Option 2).
   */
  score: number;
  /**
   * How much this answer counts as evidence: 1.0 for a standalone question,
   * 0.5 for a case child (§7.4).
   *
   * ONE QUESTION COUNTS AS ONE, whether it carries 1 mark or 13. The
   * tempting alternative — treat a 5-mark question as five mini-questions —
   * uses the same fraction but weights big questions five times heavier than
   * the live engine does when it serves them, which is the very drift §4.5
   * exists to prevent, arriving by the back door.
   *
   * ⓘ The weight bites on the ABILITY estimate. In the item half it
   * multiplies every term of the Newton step, top and bottom, so it cancels
   * and a case child's own difficulty is measured from its answers at full
   * strength. That is not an accident to be corrected: §19.4 settled exactly
   * that split. Six children share one scenario and so are worth half a
   * question when judging the STUDENT, but when judging the CHILD ITSELF the
   * answers it received are simply the answers it received.
   *
   * The cancellation holds at a fixed set of abilities. The weight does move
   * the abilities, so a trace of it reaches the difficulty second-hand —
   * measured at ~0.006 of a logit in fit.test.ts, against bands spaced a
   * whole logit apart. Small enough to ignore, not zero, and worth saying so
   * rather than claiming an exactness the loop does not have.
   */
  weight: number;
};

export type FitOptions = {
  /** Answers an item needs before its difficulty may move (§5.3.1). */
  minResponses?: number;
  /** Safety cap on refinement rounds. */
  maxIterations?: number;
  /** Stop once the largest difficulty move in a round is below this. */
  tolerance?: number;
  /**
   * Difficulty is held within ±this. An item everyone gets right has, taken
   * literally, a difficulty of minus infinity; the clamp keeps that finite.
   * ±4 matches the ability grid in lib/cat/rasch.ts — past it the model says
   * ~98% either way, so further precision describes nothing real.
   */
  clamp?: number;
};

export const DEFAULT_MIN_RESPONSES = 30;
const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_TOLERANCE = 0.001;
const DEFAULT_CLAMP = 4;

/**
 * The largest a single item's difficulty may move in one round.
 *
 * Newton's method converges fast but can overshoot wildly when an item's
 * responses are nearly all one way — the curvature it divides by approaches
 * zero and the step explodes. Capping the step costs a few extra rounds and
 * removes the failure mode.
 */
const MAX_STEP = 1.0;

export type FitResult = {
  /** Fitted difficulty per item. Items below the threshold keep their seed. */
  difficulties: Map<string, number>;
  /** Ability per student, as the live engine would estimate it. */
  abilities: Map<string, AbilityEstimate>;
  /** How many answers each item had. */
  responseCounts: Map<string, number>;
  /** Items that met the threshold and were allowed to move. */
  measuredItemIds: string[];
  /** Rounds actually run. */
  iterations: number;
  /** False if it hit the iteration cap while still moving. */
  converged: boolean;
};

/**
 * Fit item difficulties and student abilities to a set of responses.
 *
 * `seeds` supplies each item's current difficulty — its curator seed or its
 * last measurement. Starting from what we already believe converges faster
 * than starting from zero, and it is what an item below the threshold keeps.
 *
 * Items with fewer than `minResponses` answers still take part: they are held
 * FIXED at their seed while contributing to the abilities of the students who
 * answered them. Their own estimate would be noise — one strong student having
 * a bad day swings it — but the evidence they carry about people is real, and
 * discarding it would weaken every difficulty those students help measure.
 */
export function fitDifficulties(
  responses: readonly CalibrationResponse[],
  seeds: ReadonlyMap<string, number>,
  options: FitOptions = {},
): FitResult {
  const minResponses = options.minResponses ?? DEFAULT_MIN_RESPONSES;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const clamp = options.clamp ?? DEFAULT_CLAMP;

  // ── index the responses both ways ──────────────────────────────────
  const byStudent = new Map<string, CalibrationResponse[]>();
  const byItem = new Map<string, CalibrationResponse[]>();
  for (const r of responses) {
    let s = byStudent.get(r.studentId);
    if (!s) byStudent.set(r.studentId, (s = []));
    s.push(r);

    let i = byItem.get(r.itemId);
    if (!i) byItem.set(r.itemId, (i = []));
    i.push(r);
  }

  const responseCounts = new Map<string, number>();
  for (const [itemId, rs] of byItem) responseCounts.set(itemId, rs.length);

  // Current difficulty per item: its seed, or 0 if we have none. A missing
  // seed should not happen — the trigger in 20260824120000 gives every banded
  // item a number — but an item with no band at all can reach here, and 0
  // (average) is the only neutral thing to say about it.
  const difficulties = new Map<string, number>();
  for (const itemId of byItem.keys()) {
    difficulties.set(itemId, seeds.get(itemId) ?? 0);
  }

  const measuredItemIds = [...byItem.keys()]
    .filter((id) => (responseCounts.get(id) ?? 0) >= minResponses)
    .sort();

  const abilities = new Map<string, AbilityEstimate>();

  // Nothing has enough evidence to move — which is the normal state of a
  // young bank. Estimate abilities once so the caller gets a coherent
  // result, and stop.
  if (measuredItemIds.length === 0) {
    estimateAllAbilities(byStudent, difficulties, abilities);
    return {
      difficulties,
      abilities,
      responseCounts,
      measuredItemIds,
      iterations: 0,
      converged: true,
    };
  }

  let iterations = 0;
  let converged = false;

  for (let round = 1; round <= maxIterations; round++) {
    iterations = round;

    // ── the person half: the live engine's own estimator ─────────────
    estimateAllAbilities(byStudent, difficulties, abilities);

    // ── the item half: move each measurable difficulty toward its data ─
    let largestMove = 0;
    for (const itemId of measuredItemIds) {
      const rs = byItem.get(itemId)!;
      const before = difficulties.get(itemId)!;
      const after = newtonStep(before, rs, abilities, clamp);
      difficulties.set(itemId, after);
      const moved = Math.abs(after - before);
      if (moved > largestMove) largestMove = moved;
    }

    if (largestMove < tolerance) {
      converged = true;
      break;
    }
  }

  // The abilities returned should be the ones implied by the difficulties
  // returned, not the ones from the round before the last difficulty move.
  estimateAllAbilities(byStudent, difficulties, abilities);

  return { difficulties, abilities, responseCounts, measuredItemIds, iterations, converged };
}

/** Re-estimate every student against the current difficulties. */
function estimateAllAbilities(
  byStudent: ReadonlyMap<string, CalibrationResponse[]>,
  difficulties: ReadonlyMap<string, number>,
  out: Map<string, AbilityEstimate>,
): void {
  for (const [studentId, rs] of byStudent) {
    const asCat: CatResponse[] = rs.map((r) => ({
      difficulty: difficulties.get(r.itemId) ?? 0,
      score: r.score,
      weight: r.weight,
    }));
    out.set(studentId, estimateAbility(asCat));
  }
}

/**
 * One Newton step toward the difficulty that best explains an item's answers.
 *
 * The model says a student of ability θ scores `p = expectedScore(θ, b)` on an
 * item of difficulty `b`. Comparing that prediction with what actually
 * happened gives the direction to move:
 *
 *   • students scored LOWER than predicted → the item is harder than we
 *     thought → b increases;
 *   • students scored HIGHER → b decreases.
 *
 * The size of the move is that gap divided by how sharply the prediction
 * responds to a change in b. Answers from students whose ability sits far from
 * the item's difficulty barely respond at all, and contribute correspondingly
 * little — which is right: a question far too easy for someone tells you
 * almost nothing about exactly how easy it is.
 */
function newtonStep(
  current: number,
  itemResponses: readonly CalibrationResponse[],
  abilities: ReadonlyMap<string, AbilityEstimate>,
  clamp: number,
): number {
  let gap = 0;
  let curvature = 0;

  for (const r of itemResponses) {
    const theta = abilities.get(r.studentId)?.theta;
    if (theta === undefined) continue;
    const p = expectedScore(theta, current);
    gap += r.weight * (p - r.score);
    curvature += r.weight * p * (1 - p);
  }

  // Every responder is pinned at a prediction of 0 or 1 — there is no slope
  // to follow, so any step would be invented. Leave it where it is.
  if (curvature < 1e-9) return current;

  let step = gap / curvature;
  if (step > MAX_STEP) step = MAX_STEP;
  if (step < -MAX_STEP) step = -MAX_STEP;

  const next = current + step;
  if (next > clamp) return clamp;
  if (next < -clamp) return -clamp;
  return next;
}
