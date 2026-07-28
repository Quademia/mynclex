// mynclex/lib/bank/cat-pool/coverage.ts
//
// Pure shaping for the CAT-pool Coverage lens. Everything the page draws is
// derived here from plain counts, so the arithmetic can be tested without a
// database or a browser — and so a number can never be computed inline in the
// view, where it would quietly drift from the one beside it.
//
// Nothing here reads the database or React. Callers pass counts in; rows come
// out ready to render.

import {
  CLIENT_NEEDS_BLUEPRINT_RANGES,
  CLIENT_NEEDS_SHORT_LABELS,
  DIFFICULTY_LEVELS,
  type Difficulty,
} from '@/lib/bank/classifications';
import {
  POOL_TARGETS,
  PER_SITTING,
  WHOLE_POOL_TARGET,
  THIN_THRESHOLD_SET,
  THIN_THRESHOLD_CALIBRATED,
  BLUEPRINT_AXIS_MAX,
} from './constants';

/** Which difficulty number the spread is read from. §5.5. */
export type SpreadMode = 'set' | 'calibrated';

/** Raw counts the page needs, as read from the database. */
export type PoolCounts = {
  /** Reserved standalone questions (flagged directly on the row). */
  standalone: number;
  /** Reserved case wrappers. */
  cases: number;
  /** Reserved trend wrappers. */
  trends: number;
  /** Child questions inherited from reserved case wrappers — a real count. */
  caseChildren: number;
  /** Child questions inherited from reserved trend wrappers — a real count. */
  trendChildren: number;
  /** Questions per band, by the curator's set label. */
  bySetBand: Record<string, number>;
  /** Questions per band, derived from difficulty_irt where source = EMPIRICAL. */
  byCalibratedBand: Record<string, number>;
  /** Questions per Client Needs subcategory, across the whole pool. */
  bySubcategory: Record<string, number>;
};

export type StatCard = {
  key: string;
  label: string;
  value: number;
  target: number;
  /** 0–100, clamped — the progress bar width. */
  barPct: number;
  note: string;
  /** True once the target is reached; the page tints the bar. */
  met: boolean;
};

export type SpreadRow = {
  band: Difficulty;
  count: number;
  /** 0–100, the fill width against the tallest band. */
  barPct: number;
  /** 0–100, where an even fifth of the target would sit. */
  markerPct: number;
  /** "· 118 short" / "· in range" / "· over" / "· 17% of measured". */
  gapLabel: string;
  /** Thin bands are drawn in the warning tint. */
  thin: boolean;
};

export type BlueprintRow = {
  subcategory: string;
  label: string;
  /** Share of the pool, one decimal. */
  pct: number;
  low: number;
  high: number;
  /** Band + fill geometry, as 0–100 percentages of the 25% axis. */
  bandLeft: number;
  bandWidth: number;
  fillWidth: number;
  inRange: boolean;
  rangeLabel: string;
};

export type SupplyRow = {
  key: string;
  label: string;
  value: string;
  guide: string;
  /** 'ok' | 'warn' — drives the dot colour. */
  tone: 'ok' | 'warn';
};

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));
const pctOf = (value: number, target: number): number =>
  target <= 0 ? 0 : clampPct((value / target) * 100);

/** Total questions CAT could draw: reserved standalone + inherited children. */
export function totalPoolQuestions(c: PoolCounts): number {
  return c.standalone + c.caseChildren + c.trendChildren;
}

/** The four headline cards: three slices plus the whole pool. */
export function buildStatCards(c: PoolCounts): StatCard[] {
  const total = totalPoolQuestions(c);
  const remaining = (value: number, target: number) =>
    value >= target ? 'target met' : `${(target - value).toLocaleString()} to go`;

  return [
    {
      key: 'standalone',
      label: 'Standalone',
      value: c.standalone,
      target: POOL_TARGETS.standalone,
      barPct: pctOf(c.standalone, POOL_TARGETS.standalone),
      note: remaining(c.standalone, POOL_TARGETS.standalone),
      met: c.standalone >= POOL_TARGETS.standalone,
    },
    {
      key: 'cases',
      label: 'Case wrappers',
      value: c.cases,
      target: POOL_TARGETS.cases,
      barPct: pctOf(c.cases, POOL_TARGETS.cases),
      // The real inherited count, not wrappers × 6 — a case can be short a child.
      note: `${c.caseChildren.toLocaleString()} child questions inherited`,
      met: c.cases >= POOL_TARGETS.cases,
    },
    {
      key: 'trends',
      label: 'Trend wrappers',
      value: c.trends,
      target: POOL_TARGETS.trends,
      barPct: pctOf(c.trends, POOL_TARGETS.trends),
      note: `${c.trendChildren.toLocaleString()} child questions inherited`,
      met: c.trends >= POOL_TARGETS.trends,
    },
    {
      key: 'whole',
      label: 'Whole pool',
      value: total,
      target: WHOLE_POOL_TARGET,
      barPct: pctOf(total, WHOLE_POOL_TARGET),
      note: '15 fresh sittings at max length',
      met: total >= WHOLE_POOL_TARGET,
    },
  ];
}

/**
 * The five difficulty bars. The marker shows where an even fifth of the
 * standalone target would fall — a reference, not a rule: CAT needs stock at
 * every band, and a band far below the marker is the one that will run out
 * first for students who settle there.
 */
export function buildSpreadRows(c: PoolCounts, mode: SpreadMode): SpreadRow[] {
  const isCalibrated = mode === 'calibrated';
  const source = isCalibrated ? c.byCalibratedBand : c.bySetBand;
  const counts = DIFFICULTY_LEVELS.map((band) => source[band] ?? 0);
  const measured = counts.reduce((a, b) => a + b, 0);

  const evenShare = POOL_TARGETS.standalone / DIFFICULTY_LEVELS.length;
  const thinThreshold = isCalibrated ? THIN_THRESHOLD_CALIBRATED : THIN_THRESHOLD_SET;
  // In the calibrated view only a subset carries a number, so measuring "short"
  // against the full target would call every band thin. Scale the reference to
  // what has actually been measured.
  const reference = isCalibrated ? measured / DIFFICULTY_LEVELS.length : evenShare;
  const scale = Math.max(...counts, reference, 1);

  return DIFFICULTY_LEVELS.map((band, i) => {
    const count = counts[i];
    const short = Math.round(reference - count);
    const thin = short > thinThreshold;

    let gapLabel: string;
    if (isCalibrated) {
      const share = measured === 0 ? 0 : Math.round((count / measured) * 100);
      gapLabel = `· ${share}% of measured`;
    } else if (thin) {
      gapLabel = `· ${short.toLocaleString()} short`;
    } else if (short < -thinThreshold) {
      gapLabel = '· over';
    } else {
      gapLabel = '· in range';
    }

    return {
      band,
      count,
      barPct: clampPct((count / scale) * 100),
      markerPct: clampPct((reference / scale) * 100),
      gapLabel,
      thin,
    };
  });
}

/**
 * The eight blueprint bars, against the published NCLEX ranges. Advisory:
 * a CAT balances content across a sitting, so pool balance is a question of
 * supply, not of any single exam.
 */
export function buildBlueprintRows(c: PoolCounts): BlueprintRow[] {
  const total = Object.values(c.bySubcategory).reduce((a, b) => a + b, 0);

  return Object.entries(CLIENT_NEEDS_BLUEPRINT_RANGES).map(([subcategory, [low, high]]) => {
    const n = c.bySubcategory[subcategory] ?? 0;
    const pct = total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
    const axis = (v: number) => clampPct((v / BLUEPRINT_AXIS_MAX) * 100);

    return {
      subcategory,
      label: CLIENT_NEEDS_SHORT_LABELS[subcategory] ?? subcategory,
      pct,
      low,
      high,
      bandLeft: axis(low),
      bandWidth: axis(high) - axis(low),
      fillWidth: axis(pct),
      inRange: total > 0 && pct >= low && pct <= high,
      rangeLabel: `${low}–${high}%`,
    };
  });
}

/**
 * Wrapper supply, expressed as sittings rather than counts — the number a
 * curator can act on is "how many exams can this cover", not "how many cases
 * are ticked".
 */
export function buildSupplyRows(c: PoolCounts): SupplyRow[] {
  const sittings = (reserved: number, perSitting: number) =>
    perSitting <= 0 ? 0 : Math.floor(reserved / perSitting);

  const caseSittings = sittings(c.cases, PER_SITTING.cases);
  const trendSittings = sittings(c.trends, PER_SITTING.trends);

  return [
    {
      key: 'cases',
      label: 'Case wrappers reserved',
      value: `${c.cases} / ${POOL_TARGETS.cases}`,
      guide: `${PER_SITTING.cases} per sitting → covers ${caseSittings}`,
      tone: c.cases >= POOL_TARGETS.cases ? 'ok' : 'warn',
    },
    {
      key: 'trends',
      label: 'Trend wrappers reserved',
      value: `${c.trends} / ${POOL_TARGETS.trends}`,
      guide: `${PER_SITTING.trends} per sitting → covers ${trendSittings}`,
      tone: c.trends >= POOL_TARGETS.trends ? 'ok' : 'warn',
    },
    {
      key: 'children',
      label: 'Child questions inherited',
      value: (c.caseChildren + c.trendChildren).toLocaleString(),
      guide: 'reserved with their wrapper',
      tone: 'ok',
    },
  ];
}
