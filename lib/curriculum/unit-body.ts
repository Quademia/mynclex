// mynclex/lib/curriculum/unit-body.ts
//
// Pure helper that merges a unit's blocks + activities into the
// ordered display sequence the Unit Builder renders. Lives in
// its own module so the function can be imported by client
// components (the builder) without dragging the server-only
// Supabase client in via queries.ts.

import type {
  ProgrammeActivity,
  ProgrammeBlock,
  UnitBodyEntry,
} from './types';

// Cohort-specific activities, Slice 4 — spaced position numbers ("Gap the
// numbers", the STORE variant). Template items and cohort-only items share
// ONE number line, stored physically spaced: every new unit-body item
// (template or cohort-only) lands a full STEP past the last one, so a
// cohort-only item can later take a number in the gap (e.g. 1_500_000
// between 1_000_000 and 2_000_000) by rewriting only its own row — its
// neighbours never move. STEP leaves ~20 midpoint inserts of headroom per
// gap before whole numbers run out, well within INTEGER for realistic unit
// sizes. See docs/product-plan/cohort-specific-activities.md → "Ordering".
export const UNIT_BODY_ORDINAL_STEP = 1_000_000;

/**
 * Merge blocks + activities into the ordered unit-body sequence.
 *
 * The unit body interleaves blocks and loose activities (`block_id
 * IS NULL`) by their shared `ordinal`. Activities inside a block
 * collapse onto the block entry — they appear under the block's
 * card, not as separate body entries.
 *
 * Tiebreaker on equal ordinals: blocks first, then created_at ASC.
 * Ordinals shouldn't collide in practice (every action picks a
 * fresh max+1 ordinal, swap actions trade values 1-for-1) but the
 * DB carries no UNIQUE constraint across the two tables, so we
 * keep the sort total to avoid render flicker.
 */
export function composeUnitBody(
  blocks: ProgrammeBlock[],
  activities: ProgrammeActivity[]
): UnitBodyEntry[] {
  const blockEntries: UnitBodyEntry[] = blocks.map((block) => ({
    kind: 'block',
    block,
    activities: activities
      .filter((a) => a.block_id === block.block_id)
      .sort((a, b) => a.ordinal - b.ordinal),
  }));

  const looseEntries: UnitBodyEntry[] = activities
    .filter((a) => a.block_id === null)
    .map((activity) => ({ kind: 'loose', activity }));

  const all = [...blockEntries, ...looseEntries];
  all.sort((a, b) => {
    const ao = a.kind === 'block' ? a.block.ordinal : a.activity.ordinal;
    const bo = b.kind === 'block' ? b.block.ordinal : b.activity.ordinal;
    if (ao !== bo) return ao - bo;
    if (a.kind !== b.kind) return a.kind === 'block' ? -1 : 1;
    const ac = a.kind === 'block' ? a.block.created_at : a.activity.created_at;
    const bc = b.kind === 'block' ? b.block.created_at : b.activity.created_at;
    return ac.localeCompare(bc);
  });

  return all;
}
