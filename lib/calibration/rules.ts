// mynclex/lib/calibration/rules.ts
//
// What a measurement is allowed to do to the stored difficulty. Pure — the
// fit produces numbers, this decides which of them survive contact with the
// bank and what gets recorded about the change.
//
// Canonical decision record: docs/product-plan/bank-consumption-cat.html
//   §5.3.1 — 30 responses before anything may move
//   §5.3.3 — the 70/30 dampened blend
//   §5.3.4 — the first crossover, CURATOR_LABEL → EMPIRICAL
//   §5.2   — the job never writes back to CURATOR_LABEL
//   §17.2  — one history row per change

import { DEFAULT_MIN_RESPONSES } from './fit';

export { DEFAULT_MIN_RESPONSES };

/**
 * §5.3.3 — how much of the fresh measurement lands, and how much of the old
 * value is kept.
 *
 * Without dampening a question's difficulty can lurch between weekly runs.
 * A student who met an item at 0.0 in one sitting and 0.7 in the next has
 * been exposed to a shift that says nothing about their own ability. The
 * blend still converges on the truth over a few weeks — fast enough to
 * matter within a month or two, slow enough that no single week's noise
 * decides anything.
 */
export const BLEND_NEW = 0.7;
export const BLEND_PREVIOUS = 0.3;

/**
 * Stored difficulty is rounded to four decimals.
 *
 * Two reasons, both practical. It makes "did this actually change?" a
 * question with an answer, so a run that reproduces last week's numbers
 * writes nothing instead of a full set of no-op history rows. And four
 * decimals is already far finer than anything the model can distinguish —
 * the display bands are a whole logit apart.
 */
export const STORED_PRECISION = 4;

export type DifficultySource = 'CURATOR_LABEL' | 'EMPIRICAL';

/** One item's fresh measurement, alongside what the bank currently holds. */
export type CalibrationCandidate = {
  itemId: string;
  /** What `difficulty_irt` holds now — the curator's seed or last week's blend. */
  previousValue: number | null;
  /** What `difficulty_source` holds now. */
  previousSource: string;
  /** The unblended estimate the fit produced. */
  rawEmpirical: number;
  /** How many answers it was computed from. */
  responseCount: number;
};

export type CalibrationDecision =
  | {
      itemId: string;
      write: false;
      /** Why nothing happens. Reported so a run can be explained, not guessed at. */
      reason: 'BELOW_THRESHOLD' | 'UNCHANGED' | 'NOT_A_NUMBER';
    }
  | {
      itemId: string;
      write: true;
      newValue: number;
      newSource: 'EMPIRICAL';
      rawEmpirical: number;
      previousValue: number | null;
      previousSource: string;
      responseCount: number;
    };

function round(n: number): number {
  const f = 10 ** STORED_PRECISION;
  return Math.round(n * f) / f;
}

/**
 * Decide what one item's measurement is allowed to do.
 *
 * The source only ever moves one way — to EMPIRICAL, never back (§5.2). A
 * curator who changes the difficulty label reclaims the number and the source
 * on the save path instead, so the two can both act without either locking
 * the other out.
 */
export function decideCalibration(
  candidate: CalibrationCandidate,
  minResponses: number = DEFAULT_MIN_RESPONSES,
): CalibrationDecision {
  const { itemId, previousValue, previousSource, rawEmpirical, responseCount } = candidate;

  if (!Number.isFinite(rawEmpirical)) {
    // Defensive: the fit clamps its output, so this should be unreachable.
    // Writing a non-number into difficulty_irt would break every selection
    // query that compares against it, so it is worth refusing explicitly
    // rather than trusting the layer above.
    return { itemId, write: false, reason: 'NOT_A_NUMBER' };
  }

  if (responseCount < minResponses) {
    return { itemId, write: false, reason: 'BELOW_THRESHOLD' };
  }

  // §5.3.4 — on the first crossover the "previous value" is the curator's
  // seed, and the blend applies to it exactly as it will to every later run.
  // With no previous value at all there is nothing to dampen against, so the
  // measurement stands alone.
  const blended =
    previousValue === null
      ? rawEmpirical
      : BLEND_NEW * rawEmpirical + BLEND_PREVIOUS * previousValue;

  const newValue = round(blended);

  // A run that reproduces the stored number changes nothing and should leave
  // no trace. But a first crossover is a real change even when the number
  // happens to land where it already was — the item has stopped being an
  // opinion and started being a measurement, and that is the fact §5.3.4
  // cares about.
  const sourceUnchanged = previousSource === 'EMPIRICAL';
  if (sourceUnchanged && previousValue !== null && newValue === round(previousValue)) {
    return { itemId, write: false, reason: 'UNCHANGED' };
  }

  return {
    itemId,
    write: true,
    newValue,
    newSource: 'EMPIRICAL',
    rawEmpirical: round(rawEmpirical),
    previousValue,
    previousSource,
    responseCount,
  };
}

export type CalibrationPlan = {
  writes: Extract<CalibrationDecision, { write: true }>[];
  skipped: Extract<CalibrationDecision, { write: false }>[];
};

/** Decide for a whole run, keeping both halves so the outcome can be reported. */
export function planCalibration(
  candidates: readonly CalibrationCandidate[],
  minResponses: number = DEFAULT_MIN_RESPONSES,
): CalibrationPlan {
  const writes: CalibrationPlan['writes'] = [];
  const skipped: CalibrationPlan['skipped'] = [];

  for (const c of candidates) {
    const d = decideCalibration(c, minResponses);
    if (d.write) writes.push(d);
    else skipped.push(d);
  }

  return { writes, skipped };
}
