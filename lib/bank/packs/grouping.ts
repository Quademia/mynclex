// mynclex/lib/bank/packs/grouping.ts
//
// Pure helper: fold an ordered list of pack members into display units.
// Consecutive rows sharing a parent_case_id (or trend_id) form ONE
// case / trend unit — the same derivation attempt-creation uses (the
// link rows carry no wrapper columns; each question knows its parent on
// its own row, readiness-packs.md §6). Non-consecutive repeats of the
// same wrapper would fold into separate units — the picker's
// add-as-a-unit action keeps that from ever happening at save.

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
