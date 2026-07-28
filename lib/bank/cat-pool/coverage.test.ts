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
  trends: 0,
  caseChildren: 0,
  trendChildren: 0,
  bySetBand: {},
  byCalibratedBand: {},
  bySubcategory: {},
};

const counts = (over: Partial<PoolCounts> = {}): PoolCounts => ({ ...empty, ...over });

describe('totalPoolQuestions', () => {
  it('counts standalone plus inherited children, not wrappers', () => {
    expect(totalPoolQuestions(counts({
      standalone: 2393, cases: 60, trends: 60, caseChildren: 354, trendChildren: 87,
    }))).toBe(2393 + 354 + 87);
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
    const cards = buildStatCards(counts({ cases: 60, trends: 72, trendChildren: 91 }));
    expect(cards[1].met).toBe(true);
    expect(cards[2].met).toBe(true);
    expect(cards[2].note).toBe('91 child questions inherited');
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
    // An even fifth of 2,400 is 480. 30 is far below it.
    const rows = buildSpreadRows(counts({ bySetBand: { Easy: 30, Medium: 480 } }), 'set');
    const easy = rows.find((r) => r.band === 'Easy')!;
    const medium = rows.find((r) => r.band === 'Medium')!;
    expect(easy.thin).toBe(true);
    expect(easy.gapLabel).toBe('· 450 short');
    expect(medium.thin).toBe(false);
    expect(medium.gapLabel).toBe('· in range');
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
  it('expresses wrapper stock as sittings covered', () => {
    const rows = buildSupplyRows(counts({ cases: 60, trends: 60 }));
    expect(rows[0].guide).toBe('3 per sitting → covers 20');
    expect(rows[1].guide).toBe('2 per sitting → covers 30');
  });

  it('warns while a wrapper target is unmet', () => {
    const rows = buildSupplyRows(counts({ cases: 12, trends: 60 }));
    expect(rows[0].tone).toBe('warn');
    expect(rows[1].tone).toBe('ok');
  });

  it('rounds sittings DOWN — a partial sitting is not a sitting', () => {
    expect(buildSupplyRows(counts({ cases: 8 }))[0].guide).toBe('3 per sitting → covers 2');
  });

  it('totals inherited children across both wrapper kinds', () => {
    const rows = buildSupplyRows(counts({ caseChildren: 354, trendChildren: 87 }));
    expect(rows[2].value).toBe('441');
  });
});
