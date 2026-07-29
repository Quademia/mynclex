// ─────────────────────────────────────────────────────────────────────
// The band rule exists twice — and must never be edited once.
// ─────────────────────────────────────────────────────────────────────
// §5.5.1's cut-offs live in bandForIrt() (lib/bank/difficulty.ts) for the
// runner's pill and the readiness report, and AGAIN in the SQL function
// nclex_difficulty_band() for the practice builder's filter and its live
// per-band counts. Two copies of one rule is exactly the shape of problem
// Slice 10d exists to remove — so this test binds them together.
//
// It cannot run the SQL (the suite is pure, with no database connection —
// giving CI one would be a bigger cost than this buys). What it does
// instead is read the cut-off numbers straight out of the migration file
// and assert they are the same numbers, in the same order, with the same
// comparison operators, as the TypeScript. Change one side without the
// other and this goes red.
//
// Behavioural equivalence — every band and every boundary value, run
// through both implementations — was verified against dev when the
// migration was written. This test is what stops them parting later.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bandForIrt } from '@/lib/bank/difficulty';
import { DIFFICULTY_LEVELS } from '@/lib/bank/classifications';

const MIGRATION = join(
  process.cwd(),
  'db/migrations/20260827120000_difficulty_band_filter.sql',
);

/** The `WHEN p_irt <= -1.5 THEN 'Very easy'` arms, in file order. */
function sqlBandArms(): { op: string; bound: number; band: string }[] {
  const sql = readFileSync(MIGRATION, 'utf8');

  // Narrow to the band function's body so an unrelated CASE elsewhere in
  // the file can never be mistaken for the rule.
  const start = sql.indexOf('FUNCTION public.nclex_difficulty_band');
  expect(start, 'nclex_difficulty_band not found in the migration').toBeGreaterThan(-1);
  const body = sql.slice(start, sql.indexOf('$fn$;', start));

  return [...body.matchAll(/WHEN\s+p_irt\s*(<=|<)\s*(-?[\d.]+)\s*THEN\s*'([^']+)'/g)].map(
    (m) => ({ op: m[1], bound: Number(m[2]), band: m[3] }),
  );
}

describe('nclex_difficulty_band (SQL) ⟷ bandForIrt (TS) — §5.5.1', () => {
  it('the SQL declares the same four cut-offs, in the same order', () => {
    expect(sqlBandArms()).toEqual([
      { op: '<=', bound: -1.5, band: 'Very easy' },
      { op: '<=', bound: -0.5, band: 'Easy' },
      { op: '<', bound: 0.5, band: 'Medium' },
      { op: '<', bound: 1.5, band: 'Hard' },
    ]);
  });

  it('every SQL arm agrees with the TS at and around its own boundary', () => {
    // The operators are asymmetric on purpose (≤ below zero, < above), so
    // a boundary value is the one place the two could silently part.
    for (const { op, bound, band } of sqlBandArms()) {
      // Exactly on the boundary: `<=` means this arm claims it, `<` means
      // the NEXT one does — so only `<=` should band here.
      if (op === '<=') expect(bandForIrt(bound), `TS at ${bound}`).toBe(band);
      else expect(bandForIrt(bound), `TS at ${bound}`).not.toBe(band);

      // A hair below always belongs to this arm, under either operator.
      expect(bandForIrt(bound - 0.01), `TS just below ${bound}`).toBe(band);
    }
  });

  it('the SQL names only real bands, and leaves exactly one to the ELSE', () => {
    const named = sqlBandArms().map((a) => a.band);
    for (const b of named) expect(DIFFICULTY_LEVELS).toContain(b);
    // Five bands, four WHEN arms — the fifth is the ELSE. If someone adds
    // a sixth band without touching the SQL, this catches it.
    expect(named).toHaveLength(DIFFICULTY_LEVELS.length - 1);
    expect(new Set(named).size).toBe(named.length);
  });

  it('the TS ELSE-equivalent is the band the SQL leaves out', () => {
    const named = new Set(sqlBandArms().map((a) => a.band));
    const fellThrough = DIFFICULTY_LEVELS.filter((b) => !named.has(b));
    expect(fellThrough).toHaveLength(1);
    // Anything past the last cut-off must land there in the TS too.
    expect(bandForIrt(99)).toBe(fellThrough[0]);
  });
});
