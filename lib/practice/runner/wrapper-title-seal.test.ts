// mynclex/lib/practice/runner/wrapper-title-seal.test.ts
//
// Pillar 2 guard for the WRAPPER TITLE (2026-08-03).
//
// A case study's title is not a label — it is the answer to the opening
// "Recognise cues" question. The bank is full of titles like "Diabetic
// Ketoacidosis", "Sepsis and Septic Shock" and "Hyponatremia (SIADH)", and
// one narrates the whole six-question arc ("Acute Ischaemic Stroke: From
// Cue Recognition to Post-tPA Evaluation"). Trend titles do the same
// ("Sepsis Vital-Sign Deterioration"). So `title_snapshot` is withheld
// from the payload while a sitting is live, exactly as the answer key and
// rationale are, and restored in review.
//
// ⚠ WHY THIS TEST READS SOURCE OFF DISK rather than importing the
// constants: `page.tsx` is a Next.js page, and a page file may export ONLY
// its default and route config — a stray named export fails the
// production build while dev (Turbopack) misses it. So the seal cannot be
// exported to be asserted directly. Reading the file is the same technique
// `lib/cat/termination.test.ts` uses to pin a TS constant against SQL.
//
// This guards the one thing that would silently undo the fix: someone
// adding `title_snapshot` back into the sealed column list, which would
// leak on every live sitting with no type error, no lint error, and no
// visible change until a student noticed the diagnosis in the header.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = join(here, '..', '..', '..', 'app', '(app)', '(focused)', 'session', '[attempt_id]', 'page.tsx');
const src = readFileSync(PAGE, 'utf8');

/** Pull `const NAME = '...'` or `const NAME = OTHER + ', extra'` as written. */
function declaration(name: string): string {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=([^;]+);`));
  if (!m) throw new Error(`${name} not found in page.tsx — was it renamed?`);
  return m[1];
}

describe('wrapper title is sealed while a sitting is live', () => {
  it('page.tsx still declares the four wrapper column lists', () => {
    for (const n of [
      'SEALED_CASE_COLUMNS',
      'UNSEALED_CASE_COLUMNS',
      'SEALED_TREND_COLUMNS',
      'UNSEALED_TREND_COLUMNS',
    ]) {
      expect(() => declaration(n), `${n} missing`).not.toThrow();
    }
  });

  it('the SEALED lists do NOT carry title_snapshot', () => {
    expect(declaration('SEALED_CASE_COLUMNS')).not.toContain('title_snapshot');
    expect(declaration('SEALED_TREND_COLUMNS')).not.toContain('title_snapshot');
  });

  it('the UNSEALED lists DO carry title_snapshot, so review restores it', () => {
    expect(declaration('UNSEALED_CASE_COLUMNS')).toContain('title_snapshot');
    expect(declaration('UNSEALED_TREND_COLUMNS')).toContain('title_snapshot');
  });

  // The lists are inert unless the queries actually switch on them. Before
  // this assertion the selects named their columns inline, so a correct
  // pair of constants could sit beside a query that still sent the title.
  it('the case/trend queries select through the isLive switch', () => {
    expect(src).toMatch(/caseColumns\s*=\s*isLive\s*\?\s*SEALED_CASE_COLUMNS\s*:\s*UNSEALED_CASE_COLUMNS/);
    expect(src).toMatch(/trendColumns\s*=\s*isLive\s*\?\s*SEALED_TREND_COLUMNS\s*:\s*UNSEALED_TREND_COLUMNS/);
    expect(src).toContain('.select(caseColumns)');
    expect(src).toContain('.select(trendColumns)');
  });

  // The seal is keyed on LIVE, not on EXAM — deliberately NOT the §16.6
  // exam-scaffold rule. A study sitting is sealed too, for the same reason
  // nobody hands a study sitting the answer key.
  it('isLive is the attempt status, not the intent', () => {
    expect(src).toMatch(/const\s+isLive\s*=\s*attempt\.status\s*===\s*'IN_PROGRESS'/);
    const caseSwitch = src.match(/caseColumns\s*=[^;]+;/)?.[0] ?? '';
    expect(caseSwitch).not.toContain('intent');
  });
});

describe('the tutorial sandbox honours the same seal', () => {
  // The sandbox builds its own RunnerData and never passes through
  // page.tsx's projection, so the seal has to be honoured by hand. Without
  // this, the public walkthrough would show a header the real runner does
  // not — the exact defect slice 8 existed to fix.
  const SANDBOX = join(here, '..', 'tutorial', 'sandbox-data.ts');
  const sandboxSrc = readFileSync(SANDBOX, 'utf8');

  it('sandbox case/trend snapshots omit title_snapshot', () => {
    expect(sandboxSrc).not.toMatch(/title_snapshot:\s*TUTORIAL_(CASE|TREND)\.title/);
  });

  it('but still supply the scenario and tabs', () => {
    expect(sandboxSrc).toContain('TUTORIAL_CASE.scenario');
    expect(sandboxSrc).toContain('TUTORIAL_CASE.tabs');
    expect(sandboxSrc).toContain('TUTORIAL_TREND.scenario');
    expect(sandboxSrc).toContain('TUTORIAL_TREND.tabs');
  });
});
