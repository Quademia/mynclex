// mynclex/lib/bank/packs/grouping.ts
//
// Pure helper: fold an ordered list of pack members into display units.
// Consecutive rows sharing a parent_case_id (or trend_id) form ONE
// case / trend unit — the same derivation attempt-creation uses (the
// link rows carry no wrapper columns; each question knows its parent on
// its own row, readiness-packs.md §6). Non-consecutive repeats fold
// into SEPARATE units: for cases that can't occur (the picker's atomic
// add), but for trends it's legal by design (§5, revised 2026-07-07 —
// a trend block is display-grouping over adjacency, and a curator may
// place siblings at different insertion points).

import type { PackMember, PackUnit } from './types';

export interface WrapperMeta {
  title:       string;
  isPublished: boolean;
}

export function groupPackMembers(
  members: PackMember[],
  caseMeta: Record<string, WrapperMeta>,
  trendMeta: Record<string, WrapperMeta>,
): PackUnit[] {
  const units: PackUnit[] = [];

  for (const m of members) {
    const prev = units[units.length - 1];

    if (m.parentCaseId) {
      if (prev && prev.kind === 'case' && prev.wrapperId === m.parentCaseId) {
        prev.members.push(m);
      } else {
        const meta = caseMeta[m.parentCaseId];
        units.push({
          kind: 'case',
          wrapperId: m.parentCaseId,
          title: meta?.title ?? m.parentCaseId,
          isPublished: meta?.isPublished ?? false,
          members: [m],
        });
      }
      continue;
    }

    if (m.trendId) {
      if (prev && prev.kind === 'trend' && prev.wrapperId === m.trendId) {
        prev.members.push(m);
      } else {
        const meta = trendMeta[m.trendId];
        units.push({
          kind: 'trend',
          wrapperId: m.trendId,
          title: meta?.title ?? m.trendId,
          isPublished: meta?.isPublished ?? false,
          members: [m],
        });
      }
      continue;
    }

    units.push({ kind: 'q', member: m });
  }

  return units;
}

/** All link ids inside a unit, in order. */
export function unitLinkIds(unit: PackUnit): string[] {
  return unit.kind === 'q'
    ? [unit.member.linkId]
    : unit.members.map((m) => m.linkId);
}

/** The members inside a unit, in order. */
export function unitMembers(unit: PackUnit): PackMember[] {
  return unit.kind === 'q' ? [unit.member] : unit.members;
}
