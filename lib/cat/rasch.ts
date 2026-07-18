// mynclex/lib/cat/rasch.ts
//
// The Rasch (1PL) maths for the CAT engine. Pure — no DB, no clock, no
// randomness. Same inputs always give the same outputs.
//
// Canonical decision record: docs/product-plan/bank-consumption-cat.html
//   §4    — why Rasch (1PL) and not 2PL
//   §4.5  — partial credit feeds in as a fraction ("Option 2")
//   §7.4  — case children count at half weight
//   §9.1  — the passing standard is theta = 0.0
//   §9.5  — the readiness probability is P(true ability > 0)
//   §10.6 — this half runs in TypeScript; the RPC persists and selects

import type { AbilityEstimate, CatResponse } from './types';

// ── Constants ────────────────────────────────────────────────────────

/** The passing standard on the ability scale (§9.1). */
export const PASSING_THETA = 0;

/**
 * The prior: before any answers, assume the student is near average.
 *
 * This is not decoration — it is what keeps the estimate finite. The
 * textbook maximum-likelihood estimate has no answer when a student has got
 * everything right or everything wrong (it runs to infinity), and that is
 * not an edge case: it is the state after question 1 of every single CAT.
 * Anchoring to a mild prior keeps every estimate finite from the first
 * answer, and its spread IS the starting SE (§6 asked for "high SE" without
 * naming a number; this names it).
 *
 * The honest cost: a mild pull toward average. With 85 questions minimum it
 * is swamped by real evidence long before a verdict is issued.
 */
export const PRIOR_MEAN = 0;
export const PRIOR_SD = 1;

/**
 * The quadrature grid the posterior is evaluated on.
 *
 * ±4 logits covers far past any realistic ability (P(correct) against a
 * matched item is ~98% at theta 4), and 0.05 steps give an estimate
 * resolution well finer than the SE we ever act on.
 */
const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_STEP = 0.05;

// ── Core model ───────────────────────────────────────────────────────

/**
 * The Rasch curve: probability of a correct answer.
 *
 * When ability equals difficulty the answer is a 50/50 coin flip — which is
 * exactly the item the engine wants, because an unpredictable answer is the
 * most informative one. This is why selection hunts for difficulty ≈ theta
 * (§7.1).
 */
export function expectedScore(theta: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(theta - difficulty)));
}

/**
 * Fisher information — how much an item tells us about a student at `theta`.
 *
 * Peaks at 0.25 when difficulty matches ability, and collapses toward zero
 * for items far too easy or too hard. The formal reason difficulty-matching
 * is optimal: it maximises information, which shrinks the SE fastest.
 */
export function itemInformation(theta: number, difficulty: number): number {
  const p = expectedScore(theta, difficulty);
  return p * (1 - p);
}

// ── Ability estimation ───────────────────────────────────────────────

/**
 * Log-likelihood of one response at a candidate ability.
 *
 * For a fraction-scored item this is the natural continuous form of the
 * Bernoulli likelihood: score 1 contributes log(p), score 0 contributes
 * log(1-p), and 0.6 contributes 0.6·log(p) + 0.4·log(1-p).
 *
 * The WEIGHT is applied by multiplying the whole log-likelihood. That is
 * what makes §7.4's "counts as half a question, full stop" literally true:
 * scaling the log-likelihood by 0.5 halves how far the estimate moves AND
 * halves the information gained, together, with no separate fudge factor for
 * each. Halving one without the other is the mistake §7.4 warns about.
 */
function responseLogLikelihood(theta: number, r: CatResponse): number {
  const p = expectedScore(theta, r.difficulty);
  // Guard the logs: p can round to exactly 0 or 1 at the grid extremes.
  const EPS = 1e-12;
  const pc = Math.min(Math.max(p, EPS), 1 - EPS);
  return r.weight * (r.score * Math.log(pc) + (1 - r.score) * Math.log(1 - pc));
}

/**
 * Estimate ability and uncertainty from the full response history (EAP).
 *
 * Expected A Posteriori: build the posterior distribution over the ability
 * grid (prior × likelihood of every response), then report its mean as the
 * estimate and its standard deviation as the SE.
 *
 * Why recompute from the whole history rather than nudging a running value:
 * it is stateless and exact, so replaying an attempt always reproduces the
 * same trajectory. 150 responses over 161 grid points is trivial work.
 *
 * With no responses this returns the prior — theta 0.0, SE 1.0 — which is
 * precisely the §6 starting position.
 */
export function estimateAbility(responses: readonly CatResponse[]): AbilityEstimate {
  let sumW = 0;
  let sumWTheta = 0;
  let sumWTheta2 = 0;

  // Work in log space, then exponentiate against the running max, so a long
  // response history cannot underflow to all-zero weights.
  const nodes: number[] = [];
  const logWeights: number[] = [];
  let maxLogWeight = -Infinity;

  for (let theta = GRID_MIN; theta <= GRID_MAX + 1e-9; theta += GRID_STEP) {
    const z = (theta - PRIOR_MEAN) / PRIOR_SD;
    let logW = -0.5 * z * z; // log of the normal prior, up to a constant
    for (const r of responses) logW += responseLogLikelihood(theta, r);

    nodes.push(theta);
    logWeights.push(logW);
    if (logW > maxLogWeight) maxLogWeight = logW;
  }

  for (let i = 0; i < nodes.length; i++) {
    const w = Math.exp(logWeights[i] - maxLogWeight);
    const theta = nodes[i];
    sumW += w;
    sumWTheta += w * theta;
    sumWTheta2 += w * theta * theta;
  }

  const mean = sumWTheta / sumW;
  const variance = Math.max(sumWTheta2 / sumW - mean * mean, 0);

  return { theta: mean, se: Math.sqrt(variance) };
}

// ── Readiness probability ────────────────────────────────────────────

/**
 * Standard normal CDF, via the Abramowitz & Stegun 7.1.26 erf approximation.
 * Accurate to ~1.5e-7 — far beyond what a displayed percentage needs.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * P(true ability > the passing standard) — the readiness probability (§9.5).
 *
 * "How confident we are you're above OUR standard." Deliberately NOT framed
 * as a probability of passing the real NCLEX; that label waits for outcome
 * data (§3.5).
 *
 * Worked values from §9.5: 0.5 / 0.40 → ~89%, 0.1 / 0.40 → ~60%,
 * −0.3 / 0.40 → ~23%.
 */
export function readinessProbability(theta: number, se: number): number {
  if (se <= 0) return theta > PASSING_THETA ? 1 : 0;
  return normalCdf((theta - PASSING_THETA) / se);
}
