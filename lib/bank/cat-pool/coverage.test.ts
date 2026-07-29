import { describe, it, expect } from 'vitest';
import {
  buildStatCards,
  buildSpreadRows,
  buildBlueprintRows,
  buildSupplyRows,
  totalPoolQuestions,
  type PoolCounts,
} from './coverage';
import { POOL_TARGETS, WHOLE_POOL_TARGET } from './constants';

const empty: PoolCounts = {
  standalone: 0,
  cases: 0,
  caseChildren: 0,
  trendQuestions: 0,
  trendDatasets: 0,
  bySetBand: {},
  byCalibratedBand: {},
  bySubcategory: {},
};

const counts = (over: Partial<PoolCounts> = {}): PoolCounts => ({ ...empty, ...over });

describe('totalPoolQuestions', () => {
  it('adds the three disjoint slices, and counts no wrapper as a question', () => {
    expect(totalPoolQuestions(counts({
      standalone: 2393, cases: 60, caseChildren: 354, trendQuestions: 86, trendDatasets: 59,
    }))).toBe(2393 + 354 + 86);
  });

  it('does not count trend DATASETS as stock — they are a variety measure', () => {
    // Same 86 questions whether they span 1 dataset or 59: the pool is the
    // questions. Only the Coverage tile cares how many scenarios they cover.
    const wide = totalPoolQuestions(counts({ trendQuestions: 86, trendDatasets: 59 }));
    const narrow = totalPoolQuestions(counts({ trendQuestions: 86, trendDatasets: 1 }));
    expect(wide).toBe(narrow);
    expect(wide).toBe(86);
  });
});

describe('buildStatCards', () => {
  it('reports the distance to each target', () => {
    const [standalone] = buildStatCards(counts({ standalone: 582 }));
    expect(standalone.value).toBe(582);
    expect(standalone.target).toBe(POOL_TARGETS.standalone);
    expect(standalone.note).toBe('1,818 to go');
    expect(standalone.met).toBe(false);
  });

  it('says "target met" rather than a negative remainder', () => {
    const cards = buildStatCards(counts({ standalone: 2400 }));
    expect(cards[0].note).toBe('target met');
    expect(cards[0].met).toBe(true);
  });

  it('marks a wrapper target met even though its note carries the child count', () => {
    // The wrapper cards spend their note on inherited children — the more
    // useful fact — so `met` is what the view tints from, not the note text.
    const cards = buildStatCards(counts({ cases: 60, trendDatasets: 72, trendQuestions: 91 }));
    expect(cards[1].met).toBe(true);
    expect(cards[2].met).toBe(true);
  });

  it('counts DATASETS on the trend tile and QUESTIONS in its note', () => {
    // The tile is a variety measure: 86 questions spanning 59 scenarios reads
    // 59 / 60, not 86 / 60.
    const cards = buildStatCards(counts({ trendQuestions: 86, trendDatasets: 59 }));
    expect(cards[2].label).toBe('Trend datasets');
    expect(cards[2].value).toBe(59);
    expect(cards[2].target).toBe(POOL_TARGETS.trendDatasets);
    expect(cards[2].met).toBe(false);
    expect(cards[2].note).toBe('86 trend questions reserved');
  });

  it('says "reserved" for trends and "inherited" for cases — the words are the point', () => {
    // Nothing inherits anything on a trend: each question was ticked on its
    // own row. Only a case child gets its flag from a wrapper.
    const cards = buildStatCards(counts({ caseChildren: 354, trendQuestions: 86, trendDatasets: 59 }));
    expect(cards[1].note).toContain('inherited');
    expect(cards[2].note).toContain('reserved');
    expect(cards[2].note).not.toContain('inherited');
  });

  it('never lets a bar exceed 100% when a target is overshot', () => {
    const cards = buildStatCards(counts({ standalone: 9999 }));
    expect(cards[0].barPct).toBe(100);
  });

  it('reports REAL inherited children, not wrappers times a nominal', () => {
    // 60 cases would nominally be 360 children; only 354 actually exist.
    const cards = buildStatCards(counts({ cases: 60, caseChildren: 354 }));
    expect(cards[1].note).toBe('354 child questions inherited');
  });

  it('targets the whole pool in questions', () => {
    expect(buildStatCards(empty)[3].target).toBe(WHOLE_POOL_TARGET);
  });
});

describe('buildSpreadRows', () => {
  it('returns one row per band, in ladder order', () => {
    const rows = buildSpreadRows(empty, 'set');
    expect(rows.map((r) => r.band)).toEqual([
      'Very easy', 'Easy', 'Medium', 'Hard', 'Very hard',
    ]);
  });

  it('flags a band far below an even fifth as thin', () => {
    // An even fifth of the 2,880 whole-pool target is 576.
    const even = WHOLE_POOL_TARGET / 5;
    const rows = buildSpreadRows(counts({ bySetBand: { Easy: 30, Medium: even } }), 'set');
    const easy = rows.find((r) => r.band === 'Easy')!;
    const medium = rows.find((r) => r.band === 'Medium')!;
    expect(easy.thin).toBe(true);
    expect(easy.gapLabel).toBe(`· ${even - 30} short`);
    expect(medium.thin).toBe(false);
    expect(medium.gapLabel).toBe('· in range');
  });

  it('measures against the WHOLE pool target, not the standalone one', () => {
    // Regression: the reference used to be a fifth of the standalone target
    // (480) while the bars counted every reserved question — case children and
    // trend questions included — so the marker sat too low and every band read
    // healthier than it was. A band of exactly 480 is genuinely 96 short.
    const rows = buildSpreadRows(counts({ bySetBand: { Medium: POOL_TARGETS.standalone / 5 } }), 'set');
    const medium = rows.find((r) => r.band === 'Medium')!;
    expect(medium.thin).toBe(true);
    expect(medium.gapLabel).toBe('· 96 short');
  });

  it('calls a band well above the reference "over"', () => {
    const rows = buildSpreadRows(counts({ bySetBand: { Medium: 1200 } }), 'set');
    expect(rows.find((r) => r.band === 'Medium')!.gapLabel).toBe('· over');
  });

  it('measures the calibrated view against what was measured, not the full target', () => {
    // Only 100 items carry an empirical number. Against the 480 even-fifth these
    // would all read "thin"; against the measured subset they are balanced.
    const byCalibratedBand = {
      'Very easy': 20, Easy: 20, Medium: 20, Hard: 20, 'Very hard': 20,
    };
    const rows = buildSpreadRows(counts({ byCalibratedBand }), 'calibrated');
    expect(rows.every((r) => !r.thin)).toBe(true);
    expect(rows[0].gapLabel).toBe('· 20% of measured');
  });

  it('does not divide by zero when nothing is calibrated', () => {
    const rows = buildSpreadRows(empty, 'calibrated');
    expect(rows.every((r) => r.count === 0)).toBe(true);
    expect(rows[0].gapLabel).toBe('· 0% of measured');
    expect(rows.every((r) => Number.isFinite(r.barPct))).toBe(true);
  });

  it('keeps every bar and marker within the axis', () => {
    const rows = buildSpreadRows(counts({ bySetBand: { Medium: 5000 } }), 'set');
    for (const r of rows) {
      expect(r.barPct).toBeGreaterThanOrEqual(0);
      expect(r.barPct).toBeLessThanOrEqual(100);
      expect(r.markerPct).toBeGreaterThanOrEqual(0);
      expect(r.markerPct).toBeLessThanOrEqual(100);
    }
  });
});

describe('buildBlueprintRows', () => {
  it('returns all eight subcategories with their published ranges', () => {
    const rows = buildBlueprintRows(empty);
    expect(rows).toHaveLength(8);
    const moc = rows.find((r) => r.subcategory === 'Management of Care')!;
    expect(moc.low).toBe(15);
    expect(moc.high).toBe(21);
    expect(moc.rangeLabel).toBe('15–21%');
    expect(moc.label).toBe('Mgmt of Care');
  });

  it('computes share of pool and judges it against the range', () => {
    const rows = buildBlueprintRows(counts({
      bySubcategory: { 'Management of Care': 18, 'Physiological Adaptation': 82 },
    }));
    const moc = rows.find((r) => r.subcategory === 'Management of Care')!;
    const phys = rows.find((r) => r.subcategory === 'Physiological Adaptation')!;
    expect(moc.pct).toBe(18);
    expect(moc.inRange).toBe(true);
    expect(phys.pct).toBe(82);      // far over its 11–17 ceiling
    expect(phys.inRange).toBe(false);
  });

  it('is not "in range" when the pool is empty — zero is not compliance', () => {
    expect(buildBlueprintRows(empty).every((r) => r.inRange === false)).toBe(true);
  });

  it('clamps the fill to the axis when a share exceeds it', () => {
    const rows = buildBlueprintRows(counts({ bySubcategory: { 'Management of Care': 10 } }));
    // 100% of the pool, well past the 25% axis.
    expect(rows.find((r) => r.subcategory === 'Management of Care')!.fillWidth).toBe(100);
  });
});

describe('buildSupplyRows', () => {
  it('expresses CASE stock as sittings covered', () => {
    const rows = buildSupplyRows(counts({ cases: 60 }));
    expect(rows[0].guide).toBe('3 per sitting → covers 20');
  });

  it('rounds sittings DOWN — a partial sitting is not a sitting', () => {
    expect(buildSupplyRows(counts({ cases: 8 }))[0].guide).toBe('3 per sitting → covers 2');
  });

  it('warns while the case target is unmet', () => {
    expect(buildSupplyRows(counts({ cases: 12 }))[0].tone).toBe('warn');
    expect(buildSupplyRows(counts({ cases: 60 }))[0].tone).toBe('ok');
  });

  it('reports case children on their own row, without folding trends in', () => {
    const rows = buildSupplyRows(counts({ caseChildren: 354, trendQuestions: 86 }));
    expect(rows[1].value).toBe('354');
  });

  it('expresses TREND stock as variety, never as sittings covered', () => {
    // A dataset is not drawn as a unit, so "covers N sittings" would be a
    // category error here — the useful facts are the spread and its depth.
    const rows = buildSupplyRows(counts({ trendQuestions: 86, trendDatasets: 59 }));
    expect(rows[2].label).toBe('Trend datasets represented');
    expect(rows[2].value).toBe('59 / 60');
    expect(rows[2].guide).toBe('86 questions · 1.5 per dataset');
    expect(rows[2].guide).not.toContain('sitting');
  });

  it('does not divide by zero when no trend question is reserved', () => {
    const rows = buildSupplyRows(empty);
    expect(rows[2].guide).toBe('0 questions · 0 per dataset');
  });
});
