// mynclex/lib/bank/packs/actions.ts
//
// Server Actions for the readiness-pack authoring surfaces (Slice ②a:
// basics edit, unit move, unit remove — the picker's add actions come
// with Slice ②b). All BANK_CURATE-gated (TS gate mirrors RLS).
//
// Position model: spaced ordinals (see types.ts). A unit move writes
// midpoints into the gap on the far side of its neighbour — one UPDATE
// per moving row, no global renumber, and the UNIQUE (pack_id,
// position) constraint never sees a collision because the gap is empty.

'use server';

import { revalidatePath } from 'next/cache';
import { requireBankCurator } from '@/lib/access';
import { loadPackDetail } from './queries';
import { unitLinkIds, unitMembers } from './grouping';
import type { PackActionResult, PackUnit } from './types';
import { PACK_POSITION_STEP } from './types';

const NOGAP_ERROR =
  'No room to slot the unit between its neighbours — remove and re-add it at the right spot instead.';

function revalidatePack(packId: string) {
  revalidatePath('/admin/packs');
  revalidatePath(`/admin/packs/${packId}`);
}

// ── Pack basics ──────────────────────────────────────────────────────
export async function updatePackBasicsAction(
  formData: FormData,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const packId = String(formData.get('pack_id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const timeLimitMin = Number(formData.get('time_limit_min'));

  if (!packId) return { ok: false, error: 'Missing pack id.' };
  if (!title) return { ok: false, error: 'The pack needs a title.' };
  if (!Number.isFinite(timeLimitMin) || timeLimitMin <= 0 || !Number.isInteger(timeLimitMin)) {
    return { ok: false, error: 'Time limit must be a whole number of minutes.' };
  }

  const { error } = await supabase
    .from('nclex_readiness_packs')
    .update({
      title,
      description: description || null,
      time_limit_sec: timeLimitMin * 60,
      updated_at: new Date().toISOString(),
    })
    .eq('pack_id', packId);
  if (error) return { ok: false, error: `Save failed: ${error.message}` };

  revalidatePack(packId);
  return { ok: true };
}

// ── Unit move / remove ───────────────────────────────────────────────

/** Locate the unit containing `firstLinkId` in a freshly loaded detail. */
function findUnit(units: PackUnit[], linkId: string): number {
  return units.findIndex((u) => unitLinkIds(u).includes(linkId));
}

export async function movePackUnitAction(
  packId: string,
  linkId: string,
  direction: 'up' | 'down',
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const detail = await loadPackDetail(supabase, packId);
  if (!detail) return { ok: false, error: 'Pack not found.' };

  const i = findUnit(detail.units, linkId);
  if (i < 0) return { ok: false, error: 'That question is no longer in this pack.' };
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= detail.units.length) return { ok: true }; // edge — no-op

  // The moving unit lands on the FAR side of its neighbour: bounds are
  // (row before the neighbour, neighbour's first row) going up, or
  // (neighbour's last row, row after the neighbour) going down.
  const moving = unitMembers(detail.units[i]);
  const neighbour = unitMembers(detail.units[j]);

  let lower: number;
  let upper: number;
  if (direction === 'up') {
    const before = i >= 2 ? unitMembers(detail.units[i - 2]) : null;
    lower = before ? before[before.length - 1].position : 0;
    upper = neighbour[0].position;
  } else {
    const after = i + 2 < detail.units.length ? unitMembers(detail.units[i + 2]) : null;
    lower = neighbour[neighbour.length - 1].position;
    upper = after ? after[0].position : lower + (moving.length + 1) * PACK_POSITION_STEP;
  }

  const spacing = Math.floor((upper - lower) / (moving.length + 1));
  if (spacing < 1) return { ok: false, error: NOGAP_ERROR };

  for (let k = 0; k < moving.length; k++) {
    const { error } = await supabase
      .from('nclex_readiness_pack_items')
      .update({ position: lower + spacing * (k + 1) })
      .eq('id', moving[k].linkId)
      .eq('pack_id', packId);
    if (error) return { ok: false, error: `Move failed: ${error.message}` };
  }

  revalidatePack(packId);
  return { ok: true };
}

export async function removePackUnitAction(
  packId: string,
  linkId: string,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const detail = await loadPackDetail(supabase, packId);
  if (!detail) return { ok: false, error: 'Pack not found.' };

  const i = findUnit(detail.units, linkId);
  if (i < 0) return { ok: false, error: 'That question is no longer in this pack.' };

  const ids = unitLinkIds(detail.units[i]);
  const { error } = await supabase
    .from('nclex_readiness_pack_items')
    .delete()
    .in('id', ids)
    .eq('pack_id', packId);
  if (error) return { ok: false, error: `Remove failed: ${error.message}` };

  // Deliberately NOT touching the question's visibility flags: removed
  // questions stay reserved and hidden (never auto-expose — §6).
  revalidatePack(packId);
  return { ok: true };
}
