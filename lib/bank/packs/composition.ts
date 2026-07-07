// mynclex/lib/bank/packs/composition.ts
//
// Pure composition + publish-gate maths for a readiness pack
// (Slice ③, readiness-packs.md §5/§6/§8). Everything here is
// GUIDANCE-grade except the gate: the mix + blueprint meters advise
// and never block; the gate rows decide whether the publish toggle
// may flip. Kept pure (no IO) so the detail sidebar, the list-page
// blueprint hint, and the server-side publish actions all share one
// set of numbers.

import {
  CLIENT_NEEDS_BLUEPRINT_RANGES,
  CLIENT_NEEDS_SHORT_LABELS,
} from '@/lib/bank/classifications';
import { unitMembers } from './grouping';
import type { PackRow, PackUnit } from './types';

// §5 composition guideline, per 100 questions.
export const MIX_GUIDE_CASES  = [2, 3]   as const;
export const MIX_GUIDE_CJ     = [8, 12]  as const;
export const MIX_GUIDE_TRAD   = [70, 80] as const;

export type MeterTone = 'ok' | 'warn' | 'empty';

export interface MixRow {
  label: string;
  value: string;
  guide: string;
  tone:  MeterTone;
}

export function computeMix(units: PackUnit[], total: number): MixRow[] {
  const caseUnits = units.filter((u) => u.kind === 'case').length;
  const caseQ = units
    .filter((u) => u.kind === 'case')
    .reduce((a, u) => a + unitMembers(u).length, 0);
  const trendQ = units
    .filter((u) => u.kind === 'trend')
    .reduce((a, u) => a + unitMembers(u).length, 0);
  const bowQ = units.filter(
    (u) => u.kind === 'q' && u.member.questionType === 'BOWTIE',
  ).length;
  const trad = total - caseQ - trendQ - bowQ;

  const tone = (lo: number, hi: number, v: number): MeterTone =>
    total === 0 ? 'empty' : v >= lo && v <= hi ? 'ok' : 'warn';

  return [
    {
      label: 'Case studies',
      value: `${caseUnits} unit${caseUnits === 1 ? '' : 's'}`,
      guide: `${MIX_GUIDE_CASES[0]}–${MIX_GUIDE_CASES[1]} units`,
      tone: tone(MIX_GUIDE_CASES[0], MIX_GUIDE_CASES[1], caseUnits),
    },
    {
      label: 'Trend + bow-tie',
      value: `${trendQ + bowQ} Q`,
      guide: `~${MIX_GUIDE_CJ[0]}–${MIX_GUIDE_CJ[1]} Q`,
      tone: tone(MIX_GUIDE_CJ[0], MIX_GUIDE_CJ[1], trendQ + bowQ),
    },
    {
      label: 'Traditional standalone',
      value: `${trad} Q`,
      guide: `~${MIX_GUIDE_TRAD[0]}–${MIX_GUIDE_TRAD[1]} Q`,
      tone: tone(MIX_GUIDE_TRAD[0], MIX_GUIDE_TRAD[1], trad),
    },
  ];
}

export interface BlueprintRow {
  label: string;      // compact subcategory label
  lo:    number;      // published range, % of items
  hi:    number;
  pct:   number;      // this pack's share (0–100; 0 when empty)
  tone:  MeterTone;   // ok = inside the band; warn = outside; empty = no members
}

/** Blueprint rows over any member subcategory list (detail page passes
 *  units; the list-page hint passes raw subcategory arrays). */
export function computeBlueprintFromSubcats(
  subcats: (string | null)[],
): BlueprintRow[] {
  const total = subcats.length;
  const counts: Record<string, number> = {};
  for (const s of subcats) {
    if (s) counts[s] = (counts[s] ?? 0) + 1;
  }
  return Object.entries(CLIENT_NEEDS_BLUEPRINT_RANGES).map(([subcat, [lo, hi]]) => {
    const pct = total > 0 ? ((counts[subcat] ?? 0) / total) * 100 : 0;
    return {
      label: CLIENT_NEEDS_SHORT_LABELS[subcat] ?? subcat,
      lo,
      hi,
      pct,
      tone: total === 0 ? 'empty' : pct >= lo && pct <= hi ? 'ok' : 'warn',
    };
  });
}

export function computeBlueprint(units: PackUnit[]): BlueprintRow[] {
  return computeBlueprintFromSubcats(
    units.flatMap((u) => unitMembers(u).map((m) => m.subcategory)),
  );
}

/** The list cards' one-line blueprint-health summary ("6 of 8 in range"). */
export function blueprintHealth(
  subcats: (string | null)[],
): { inRange: number; total: number } | null {
  if (subcats.length === 0) return null;
  const rows = computeBlueprintFromSubcats(subcats);
  return { inRange: rows.filter((r) => r.tone === 'ok').length, total: rows.length };
}

// ── Publish gate (§6 — completeness gates the TOGGLE, never drafting) ──

export interface GateRow {
  ok:    boolean;
  label: string;
}

export interface PackGate {
  rows:       GateRow[];
  ok:         boolean;
  /** Everything green EXCEPT unpublished member questions — the
   *  "Publish all N & publish pack" helper's exact precondition. */
  helperOnly: boolean;
  unpubQ:     string[];   // unpublished member question ids
  unpubW:     string[];   // unpublished case/trend wrapper ids
}

export function computeGate(
  pack: Pick<PackRow, 'title' | 'time_limit_sec'>,
  units: PackUnit[],
  count: number,
  target: number,
): PackGate {
  const unpubQ: string[] = [];
  const unpubW: string[] = [];
  for (const u of units) {
    if (u.kind !== 'q' && !u.isPublished) unpubW.push(u.wrapperId);
    for (const m of unitMembers(u)) {
      if (!m.isPublished) unpubQ.push(m.itemId);
    }
  }
  const basicsOk = Boolean(pack.title?.trim()) && (pack.time_limit_sec ?? 0) > 0;

  const nameFirst = (ids: string[]) =>
    ids.slice(0, 3).join(', ') + (ids.length > 3 ? ` +${ids.length - 3} more` : '');

  const rows: GateRow[] = [
    {
      ok: count === target,
      label:
        count === target
          ? `All ${target} positions filled`
          : `${target - count} of ${target} positions still to fill`,
    },
    {
      ok: unpubQ.length === 0,
      label:
        unpubQ.length === 0
          ? 'Every member question is published'
          : `${unpubQ.length} member question${unpubQ.length === 1 ? '' : 's'} unpublished — ${nameFirst(unpubQ)}`,
    },
    {
      ok: unpubW.length === 0,
      label:
        unpubW.length === 0
          ? 'Every case & trend unit is published'
          : `${unpubW.length} unit${unpubW.length === 1 ? '' : 's'} unpublished — ${nameFirst(unpubW)}`,
    },
    {
      ok: basicsOk,
      label: basicsOk
        ? 'Pack basics set (title, time limit)'
        : 'Pack needs a title and time limit',
    },
  ];

  return {
    rows,
    ok: rows.every((r) => r.ok),
    helperOnly:
      count === target && basicsOk && unpubW.length === 0 && unpubQ.length > 0,
    unpubQ,
    unpubW,
  };
}
