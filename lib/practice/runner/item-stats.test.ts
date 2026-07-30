// mynclex/lib/practice/runner/item-stats.test.ts
//
// Two jobs here.
//
//   1. statsDisplay — the counts-to-percentages step.
//   2. ⭐ The SQL/TypeScript agreement. The refresh function buckets every
//      answer into full / partial / zero, and lib/scoring/verdict.ts does
//      the same for the verdict chip. They are written in two languages
//      and neither can see the other. If they drift, a question reads
//      "Partial credit" in the strip while being counted as full credit
//      in the figure beside it — a contradiction on one line, which is
//      the exact defect this whole arc set out to remove.
//
//      So the migration is read from disk, its FILTER conditions are
//      extracted and evaluated, and the buckets are compared against
//      verdictFor() over a grid of scores. Edit the SQL and this test
//      evaluates the NEW expression: it cannot be satisfied by a stale
//      copy of the old one. Same technique the difficulty band cut-offs
//      use.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statsDisplay, statsTooltip, TOOLTIP_MAX_LINE, type ItemStats } from './item-stats';
import { verdictFor } from '@/lib/scoring';
import { DEFAULT_MIN_RESPONSES } from '@/lib/calibration/fit';

const MIGRATION = join(
  process.cwd(),
  'db/migrations/20260903120000_item_response_stats.sql',
);
const SQL = readFileSync(MIGRATION, 'utf8');

function stats(over: Partial<ItemStats> = {}): ItemStats {
  return { nStudents: 100, nFull: 40, nPartial: 35, nZero: 25, ...over };
}

describe('statsDisplay', () => {
  it('turns counts into whole percentages', () => {
    const d = statsDisplay(stats(), 3)!;
    expect(d.fullPct).toBe(40);
    expect(d.partialPct).toBe(35);
    expect(d.zeroPct).toBe(25);
    expect(d.nStudents).toBe(100);
  });

  it('hides the partial share on a question that cannot have one', () => {
    // A 1-mark question is all-or-nothing, so its partial share is
    // structurally 0% — printing "0% partial" on every multiple-choice
    // question is noise, not information.
    const d = statsDisplay(stats({ nPartial: 0, nFull: 60, nZero: 40 }), 1)!;
    expect(d.partialPct).toBeNull();
    expect(d.fullPct).toBe(60);
  });

  it('shows the partial share on a multi-mark question', () => {
    expect(statsDisplay(stats(), 2)!.partialPct).toBe(35);
  });

  it('returns null rather than dividing by zero', () => {
    expect(statsDisplay(stats({ nStudents: 0 }), 3)).toBeNull();
  });

  it('does not force the three shares to total 100', () => {
    // Rounded independently on purpose: they are three readings, not a
    // pie, and forcing a total would mean distorting one of them.
    const d = statsDisplay({ nStudents: 3, nFull: 1, nPartial: 1, nZero: 1 }, 3)!;
    expect(d.fullPct).toBe(33);
    expect(d.partialPct).toBe(33);
    expect(d.zeroPct).toBe(33);
  });
});

describe('statsTooltip', () => {
  const display = (marksMax: number) => statsDisplay(stats(), marksMax)!;

  it('stays narrow — every line under the cap', () => {
    // ⚠ This is the whole point of the function's shape. A native title
    // renders as ONE unbroken line, so the first version (a single
    // ~180-char sentence) stretched most of the way across the screen.
    // No CSS can constrain it; only the line breaks can. Without this
    // test, one appended clause quietly undoes the fix.
    for (const marks of [1, 5]) {
      for (const line of statsTooltip(display(marks)).split('\n')) {
        expect(line.length, `too wide: "${line}"`).toBeLessThan(TOOLTIP_MAX_LINE);
      }
    }
  });

  it('is several short lines, not one long one', () => {
    expect(statsTooltip(display(5)).split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('never says how many students have answered', () => {
    // ⚠ Sam's call, for a commercial reason: the count tells a student
    // how small the platform still is. It IS in the payload and was
    // deliberately left there — nothing follows from knowing it, so this
    // is a display decision rather than a boundary. But the copy must
    // not carry it, and "100" is easy to reintroduce by accident when
    // rewording. Checked against a deliberately round n so a stray count
    // would be unmistakable.
    for (const marks of [1, 5]) {
      const text = statsTooltip(statsDisplay({ ...stats(), nStudents: 137 }, marks)!);
      expect(text, 'the student count leaked into the tooltip').not.toContain('137');
      expect(text.toLowerCase()).not.toContain('have answered');
    }
  });

  it('says whose results these are, without counting them', () => {
    // "of students" is the only naming left, and it does the whole job
    // the dropped count line used to: the visible text is two bare
    // numbers, and nothing else on screen says who they are of.
    expect(statsTooltip(display(5))).toContain('of students');
    expect(statsTooltip(display(1))).toContain('of students');
    // Not "users" — what a platform calls people rather than what it
    // calls them to their face.
    expect(statsTooltip(display(5)).toLowerCase()).not.toContain('users');
  });

  it('the three shares total exactly 100', () => {
    // Rounded independently, so the raw values can sum to 101. Fine in
    // the strip, where nobody adds two figures side by side — not fine
    // here, where all three are listed and a reader can.
    const d = statsDisplay({ nStudents: 88, nFull: 26, nPartial: 41, nZero: 21 }, 5)!;
    const shares = [...statsTooltip(d).matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(shares).toHaveLength(3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('on a one-mark question, "did not" is everyone short of full marks', () => {
    // Not the zero share: marksMax is frozen per attempt while the counts
    // aggregate across attempts, so an edited question can carry partial
    // answers this branch would otherwise drop. Was seen printing
    // "41% got it right, 18% did not" — 59% of students unaccounted for.
    const d = statsDisplay({ nStudents: 100, nFull: 41, nPartial: 41, nZero: 18 }, 1)!;
    const shares = [...statsTooltip(d).matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(shares).toEqual([41, 59]);
  });

  it('does not borrow "verdict", which names the chip beside it', () => {
    // Same trap as "cohort": one word, two meanings, on one screen.
    expect(statsTooltip(display(5)).toLowerCase()).not.toContain('verdict');
    expect(statsTooltip(display(5)).toLowerCase()).not.toContain('cohort');
  });
});

describe('the migration agrees with the TypeScript', () => {
  it('gates at the same number the calibration job uses', () => {
    // One answer to "how many responses before we believe this", not two.
    expect(SQL).toContain(`st.n_students >= ${DEFAULT_MIN_RESPONSES}`);
  });

  it('buckets every score exactly as verdictFor does', () => {
    // Pull the three FILTER conditions out of the live migration text.
    const conditions = [...SQL.matchAll(/FILTER \(WHERE ([^)]*(?:\([^)]*\))?[^)]*)\)/g)]
      .map((m) => m[1].trim());
    expect(conditions, 'expected three FILTER clauses in the refresh')
      .toHaveLength(3);

    const [fullSql, partialSql, zeroSql] = conditions;

    // The conditions are plain boolean arithmetic over two values, so
    // they are valid JS once the SQL spellings are swapped out. This
    // EVALUATES what is in the file rather than restating it.
    const toJs = (sql: string) =>
      sql
        .replace(/\bAND\b/g, '&&')
        .replace(/\bOR\b/g, '||')
        .replace(/f\.score/g, 'score')
        .replace(/f\.marks/g, 'marks');

    const evaluate = (sql: string, score: number, marks: number): boolean =>
      // eslint-disable-next-line no-new-func
      new Function('score', 'marks', `return (${toJs(sql)});`)(score, marks) as boolean;

    for (let marks = 1; marks <= 5; marks++) {
      for (let score = 0; score <= marks; score++) {
        const bucket = evaluate(fullSql, score, marks)
          ? 'CORRECT'
          : evaluate(partialSql, score, marks)
            ? 'PARTIAL'
            : evaluate(zeroSql, score, marks)
              ? 'WRONG'
              : 'NONE';

        expect(bucket, `score ${score} of ${marks}`).toBe(verdictFor(score, marks));
      }
    }
  });

  it('puts every score in exactly one bucket', () => {
    // A score counted twice, or not at all, breaks the CHECK constraint
    // that n_full + n_partial + n_zero = n_students — but only at 3am in
    // a job nobody watches. Catch it here instead.
    const conditions = [...SQL.matchAll(/FILTER \(WHERE ([^)]*(?:\([^)]*\))?[^)]*)\)/g)]
      .map((m) => m[1].trim());
    const toJs = (sql: string) =>
      sql.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||')
         .replace(/f\.score/g, 'score').replace(/f\.marks/g, 'marks');
    const evaluate = (sql: string, score: number, marks: number): boolean =>
      // eslint-disable-next-line no-new-func
      new Function('score', 'marks', `return (${toJs(sql)});`)(score, marks) as boolean;

    // Includes marks = 0, the broken-rubric row that must still land
    // somewhere, and an over-max score.
    for (const marks of [0, 1, 3, 5]) {
      for (const score of [-1, 0, 1, 2, 5, 9]) {
        const hits = conditions.filter((c) => evaluate(c, score, marks)).length;
        expect(hits, `score ${score} of ${marks} landed in ${hits} buckets`).toBe(1);
      }
    }
  });
});

describe('the refresh is safe to run twice', () => {
  it('upserts rather than accumulating', () => {
    // A full recompute that INSERTed without ON CONFLICT would either
    // fail on the second night or double every count.
    expect(SQL).toMatch(/ON CONFLICT \(item_source, item_id\) DO UPDATE/);
  });

  it('counts each student once, on their first submitted answer', () => {
    expect(SQL).toMatch(/DISTINCT ON \(a\.student_id, ai\.item_source, ai\.item_id\)/);
    // NULLS LAST keeps the rows with no submitted_at in the running
    // instead of silently dropping them from every cohort.
    expect(SQL).toMatch(/aa\.submitted_at ASC NULLS LAST/);
  });

  it('never counts a skip as an encounter', () => {
    expect(SQL).toContain(`aa.submission_status IN ('SUBMITTED', 'AUTO_SUBMITTED')`);
    expect(SQL).not.toContain(`'SKIPPED'`);
  });
});
