// mynclex/lib/bank/cat-pool/constants.ts
//
// Sizing constants for the CAT pool (bank-consumption-cat.html §20.4).
//
// The targets are the "15-CAT floor": enough reserved stock that fifteen
// students can each sit a full-length adaptive exam without any two of them
// meeting the same question. They are GUIDANCE, not a gate — nothing in the
// product refuses to run because the pool is under target. The admin page
// exists to make the distance visible, not to enforce it.

/**
 * Reserved-stock targets, per slice of the bank. §20.4.
 *
 * Note what `trendDatasets` counts, because it is NOT the same kind of number
 * as the other two. A case is a selection unit: reserving 60 cases reserves 60
 * blocks the exam can draw. A trend dataset is not a selection unit anywhere —
 * trend questions are picked individually, one per dataset per exam — so
 * reserving stock there means reserving QUESTIONS, and the dataset count says
 * how many distinct scenarios those questions span.
 *
 * So this target is a VARIETY goal, not a supply floor: 2,400 and 60-cases
 * fall out of the 15-sitting arithmetic, whereas 60 datasets is the editorial
 * position that the pool should not lean on a handful of charts.
 */
export const POOL_TARGETS = {
  standalone: 2400,
  cases: 60,
  trendDatasets: 60,
} as const;

/** What one full-length sitting consumes. §20.4. */
export const PER_SITTING = {
  cases: 3,
  trends: 2,
} as const;

/** The floor the targets are derived from — 15 non-overlapping sittings. */
export const SITTINGS_FLOOR = 15;

// Nominal questions per wrapper, used ONLY to express the whole-pool target as
// a question count. Real counts are read from the database — a case is six
// children by rule, and a dataset carries a variable number of questions, so
// the nominal 2 is a planning figure and never a measurement.
export const NOMINAL_CHILDREN_PER_CASE = 6;
export const NOMINAL_QUESTIONS_PER_TREND = 2;

/**
 * Whole-pool target in questions. The three slices are disjoint — a question
 * is standalone, or a case child, or trend-linked, never two of them — so they
 * add rather than overlap.
 */
export const WHOLE_POOL_TARGET =
  POOL_TARGETS.standalone +
  POOL_TARGETS.cases * NOMINAL_CHILDREN_PER_CASE +
  POOL_TARGETS.trendDatasets * NOMINAL_QUESTIONS_PER_TREND;

// A band is called "thin" when it sits this far below an even fifth of the
// target. The calibrated view uses a tighter threshold because only a subset
// of the pool has an empirical number, so its counts are smaller throughout.
export const THIN_THRESHOLD_SET = 40;
export const THIN_THRESHOLD_CALIBRATED = 20;

/** Blueprint bars are drawn on a 0–25% axis; every NCLEX range fits inside it. */
export const BLUEPRINT_AXIS_MAX = 25;
