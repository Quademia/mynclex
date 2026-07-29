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
import { loadPackDetail, loadPackPicker } from './queries';
import { unitLinkIds, unitMembers } from './grouping';
import { computeGate, type PackGate } from './composition';
import type { PackActionResult, PackUnit, PickerLoadResult } from './types';
import { PACK_POSITION_STEP } from './types';

const NOGAP_ERROR =
  'No room to slot the unit between its neighbours — remove and re-add it at the right spot instead.';

function revalidatePack(packId: string) {
  revalidatePath('/admin/packs');
  revalidatePath(`/admin/packs/${packId}`);
}

// ── Pack basics: shared form parsing (create + edit modal) ───────────

interface PackFormValues {
  title:       string;
  description: string | null;
  timeLimitMin: number;
  n:           number;
}

function parsePackForm(formData: FormData): PackFormValues | { error: string } {
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const timeLimitMin = Number(formData.get('time_limit_min'));
  const n = Number(formData.get('n'));

  if (!title) return { error: 'The pack needs a title.' };
  if (!Number.isFinite(timeLimitMin) || timeLimitMin <= 0 || !Number.isInteger(timeLimitMin)) {
    return { error: 'Time limit must be a whole number of minutes.' };
  }
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    return { error: 'Question count must be a whole number of at least 1.' };
  }
  return { title, description: description || null, timeLimitMin, n };
}

export async function updatePackBasicsAction(
  formData: FormData,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const packId = String(formData.get('pack_id') ?? '');
  if (!packId) return { ok: false, error: 'Missing pack id.' };
  const values = parsePackForm(formData);
  if ('error' in values) return { ok: false, error: values.error };

  // n can't drop below the questions already placed — remove members
  // first (the fill meter, capacity check and gate all read n).
  const { count: memberCount } = await supabase
    .from('nclex_readiness_pack_items')
    .select('id', { count: 'exact', head: true })
    .eq('pack_id', packId);
  if ((memberCount ?? 0) > values.n) {
    return {
      ok: false,
      error: `This pack already holds ${memberCount} questions — remove some before lowering the count to ${values.n}.`,
    };
  }

  const { error } = await supabase
    .from('nclex_readiness_packs')
    .update({
      title: values.title,
      description: values.description,
      n: values.n,
      time_limit_sec: values.timeLimitMin * 60,
      updated_at: new Date().toISOString(),
    })
    .eq('pack_id', packId);
  if (error) return { ok: false, error: `Save failed: ${error.message}` };

  revalidatePack(packId);
  return { ok: true };
}

// ── Create / delete (settled 2026-07-08) ─────────────────────────────

const PACK_ID_PREFIX = 'NCLEX_PACK_';

/** Mint the LOWEST free number, not max+1 — a deleted (never-sold)
 *  pack's slot is refillable. Safe because deletion is restricted to
 *  never-sold packs, so no purchase/credit can reference a reused id;
 *  retired-after-sale packs are archived, never deleted, and keep
 *  their number forever. */
export async function createPackAction(
  formData: FormData,
): Promise<PackActionResult & { packId?: string }> {
  const { supabase } = await requireBankCurator('admin');

  const values = parsePackForm(formData);
  if ('error' in values) return { ok: false, error: values.error };

  const { data: idRows, error: idErr } = await supabase
    .from('nclex_readiness_packs')
    .select('pack_id');
  if (idErr) return { ok: false, error: `Could not load packs: ${idErr.message}` };

  const taken = new Set(
    ((idRows ?? []) as { pack_id: string }[])
      .map((r) => {
        const m = /_(\d+)$/.exec(r.pack_id);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((v) => v > 0),
  );
  let num = 1;
  while (taken.has(num)) num++;
  const packId = `${PACK_ID_PREFIX}${String(num).padStart(5, '0')}`;

  const { error } = await supabase.from('nclex_readiness_packs').insert({
    pack_id: packId,
    title: values.title,
    description: values.description,
    n: values.n,
    time_limit_sec: values.timeLimitMin * 60,
    published: false,
    status: 'draft',
  });
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A pack was just created elsewhere — try again.' };
    }
    return { ok: false, error: `Create failed: ${error.message}` };
  }

  revalidatePath('/admin/packs');
  return { ok: true, packId };
}

export async function deletePackAction(packId: string): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const { data: packRow } = await supabase
    .from('nclex_readiness_packs')
    .select('pack_id, published')
    .eq('pack_id', packId)
    .maybeSingle();
  if (!packRow) return { ok: false, error: 'Pack not found.' };
  if ((packRow as { published: boolean }).published) {
    return {
      ok: false,
      error: 'A published pack cannot be deleted — unpublish it first.',
    };
  }
  // FUTURE (student side): also refuse when any nclex_readiness_credits
  // row references this pack — ever-sold packs retire via archive, and
  // that guard is what keeps the lowest-free-number minting safe.

  // Link rows cascade; each removal lands in the audit log ('deleted'
  // rows with the composite ids). Member questions keep their flags +
  // readiness tag — they return to the UNASSIGNED reserve, never to
  // student practice (§6 never-auto-expose).
  const { error } = await supabase
    .from('nclex_readiness_packs')
    .delete()
    .eq('pack_id', packId);
  if (error) return { ok: false, error: `Delete failed: ${error.message}` };

  revalidatePath('/admin/packs');
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

/** Remove ONE member row — the trend blocks' per-question × (§5: trend
 *  blocks are display-grouping, not welded units). Case children are
 *  refused here (layered enforcement of case atomicity). */
export async function removePackMemberAction(
  packId: string,
  linkId: string,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const { data: link } = await supabase
    .from('nclex_readiness_pack_items')
    .select('id, item_id, nclex_bank_items(parent_case_id)')
    .eq('id', linkId)
    .eq('pack_id', packId)
    .maybeSingle();
  if (!link) return { ok: false, error: 'That question is no longer in this pack.' };
  const parentCaseId = (
    link as unknown as { nclex_bank_items: { parent_case_id: string | null } | null }
  ).nclex_bank_items?.parent_case_id;
  if (parentCaseId) {
    return {
      ok: false,
      error: 'Case questions leave as one unit — remove the whole case block.',
    };
  }

  const { error } = await supabase
    .from('nclex_readiness_pack_items')
    .delete()
    .eq('id', linkId)
    .eq('pack_id', packId);
  if (error) return { ok: false, error: `Remove failed: ${error.message}` };

  // Flags untouched — never auto-expose (§6).
  revalidatePack(packId);
  return { ok: true };
}

// ── Picker: candidates + add (Slice ②b) ─────────────────────────────

export async function loadPackPickerAction(
  packId: string,
): Promise<PickerLoadResult> {
  const { supabase } = await requireBankCurator('admin');
  try {
    return { ok: true, data: await loadPackPicker(supabase, packId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not load the picker.' };
  }
}

const READINESS_TAG = 'readiness';

const NOGAP_INSERT_ERROR =
  'No room to insert at that spot — insert at the end and move things, or remove and re-add a neighbour.';

interface OrderedLink {
  id:       string;
  position: number;
}

/** This pack's link rows in position order + the pack's target n. */
async function loadPackLinks(
  supabase: Awaited<ReturnType<typeof requireBankCurator>>['supabase'],
  packId: string,
): Promise<{ links: OrderedLink[]; target: number } | { error: string }> {
  const [{ data: packRow }, { data: linkRows, error }] = await Promise.all([
    supabase.from('nclex_readiness_packs').select('n').eq('pack_id', packId).maybeSingle(),
    supabase
      .from('nclex_readiness_pack_items')
      .select('id, position')
      .eq('pack_id', packId)
      .order('position'),
  ]);
  if (!packRow) return { error: 'Pack not found.' };
  if (error) return { error: `Could not load pack members: ${error.message}` };
  return {
    links: (linkRows ?? []) as OrderedLink[],
    target: (packRow as { n: number | null }).n ?? 100,
  };
}

/** Spaced positions for k new rows: at the end, or in the gap above
 *  `beforeLinkId` (the anchor unit's first row — the ⊕ semantics). */
function computeInsertPositions(
  links: OrderedLink[],
  beforeLinkId: string | null,
  k: number,
): { positions: number[] } | { error: string } {
  if (beforeLinkId === null) {
    const last = links.length > 0 ? links[links.length - 1].position : 0;
    return { positions: Array.from({ length: k }, (_, i) => last + PACK_POSITION_STEP * (i + 1)) };
  }
  const idx = links.findIndex((l) => l.id === beforeLinkId);
  if (idx < 0) {
    return { error: 'That insertion point just moved — reopen the picker and try again.' };
  }
  const lower = idx > 0 ? links[idx - 1].position : 0;
  const upper = links[idx].position;
  const spacing = Math.floor((upper - lower) / (k + 1));
  if (spacing < 1) return { error: NOGAP_INSERT_ERROR };
  return { positions: Array.from({ length: k }, (_, i) => lower + spacing * (i + 1)) };
}

/** Any of these questions already in a pack? (Friendly pre-check; the
 *  global UNIQUE(item_id) is the real guarantee.) */
async function findExistingMemberships(
  supabase: Awaited<ReturnType<typeof requireBankCurator>>['supabase'],
  itemIds: string[],
): Promise<string[] | { error: string }> {
  const { data, error } = await supabase
    .from('nclex_readiness_pack_items')
    .select('item_id')
    .in('item_id', itemIds);
  if (error) return { error: `Could not check memberships: ${error.message}` };
  return ((data ?? []) as { item_id: string }[]).map((r) => r.item_id);
}

/** Machine-managed reservation on QUESTION rows (standalones + trend
 *  children — §4 per-entity rule): hide from the builder, drop the
 *  free-sample exposure, and stamp the `readiness` bookkeeping tag in
 *  the same save (§4's tag-and-hide rule — the tag and the pack
 *  contents must not drift). Runs BEFORE the link insert so a partial
 *  failure leaves a question reserved-but-unassigned (never exposed). */
async function reserveQuestionRows(
  supabase: Awaited<ReturnType<typeof requireBankCurator>>['supabase'],
  rows: { item_id: string; tags: string[] }[],
): Promise<string | null> {
  for (const r of rows) {
    const tags = r.tags.includes(READINESS_TAG) ? r.tags : [...r.tags, READINESS_TAG];
    const { error } = await supabase
      .from('nclex_bank_items')
      .update({
        is_builder_visible: false,
        is_free_sample: false,
        tags,
        updated_at: new Date().toISOString(),
      })
      .eq('item_id', r.item_id);
    if (error) return `Could not reserve ${r.item_id}: ${error.message}`;
  }
  return null;
}

/** Insert the link rows (one batch statement — atomic). */
async function insertLinkRows(
  supabase: Awaited<ReturnType<typeof requireBankCurator>>['supabase'],
  packId: string,
  itemIds: string[],
  positions: number[],
): Promise<string | null> {
  const { error } = await supabase.from('nclex_readiness_pack_items').insert(
    itemIds.map((itemId, i) => ({
      id: `${packId}:${itemId}`,
      pack_id: packId,
      item_id: itemId,
      position: positions[i],
    })),
  );
  if (!error) return null;
  if (error.code === '23505') {
    return 'One of those questions was just placed in a pack elsewhere — refresh and try again.';
  }
  return `Add failed: ${error.message}`;
}

function capacityError(remaining: number): string {
  if (remaining <= 0) return 'This pack is already full — remove something first.';
  return `Only ${remaining} position${remaining === 1 ? '' : 's'} left in this pack — deselect a few first.`;
}

/** Standalone questions — the picker's multi-tick add. Order preserved
 *  as sent (the picker's visible list order). */
export async function addPackStandalonesAction(
  packId: string,
  itemIds: string[],
  beforeLinkId: string | null,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const ids = [...new Set(itemIds)].filter(Boolean);
  if (ids.length === 0) return { ok: false, error: 'Nothing selected.' };

  const { data: itemRows, error: itemErr } = await supabase
    .from('nclex_bank_items')
    .select('item_id, tags, is_published, parent_case_id, trend_id, cat_pool')
    .in('item_id', ids);
  if (itemErr) return { ok: false, error: `Could not load questions: ${itemErr.message}` };
  const items = (itemRows ?? []) as {
    item_id: string;
    tags: string[];
    is_published: boolean;
    parent_case_id: string | null;
    trend_id: string | null;
    cat_pool: boolean;
  }[];
  if (items.length !== ids.length) {
    return { ok: false, error: 'One of those questions no longer exists.' };
  }
  const bad = items.find((i) => !i.is_published || i.parent_case_id || i.trend_id);
  if (bad) {
    return {
      ok: false,
      error: `${bad.item_id} is not a published standalone question — refresh the picker.`,
    };
  }

  // §20.5 mutual exclusivity, the OTHER direction. The CAT reserve drawer
  // already refuses a readiness-tagged question; without this a curator could
  // still walk a CAT-reserved one into a pack from this side and the same
  // question would be measuring twice.
  const reserved = items.find((i) => i.cat_pool);
  if (reserved) {
    return {
      ok: false,
      error: `${reserved.item_id} is reserved for the CAT pool — release it there first. A question can only serve one purpose.`,
    };
  }

  return finishAdd(supabase, packId, ids, beforeLinkId, () =>
    reserveQuestionRows(
      supabase,
      ids.map((id) => items.find((i) => i.item_id === id)!),
    ),
  );
}

/** A case study — atomic, all children as one unit in slot order (§5).
 *  Reservation flips the CASE row's own flag (§4 per-entity rule). */
export async function addPackCaseAction(
  packId: string,
  caseId: string,
  beforeLinkId: string | null,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const [{ data: caseRow }, { data: childRows, error: childErr }] = await Promise.all([
    supabase
      .from('nclex_case_studies')
      .select('case_id, tags, is_published, cat_pool')
      .eq('case_id', caseId)
      .maybeSingle(),
    supabase
      .from('nclex_case_study_items')
      .select('item_id, position')
      .eq('case_id', caseId)
      .order('position'),
  ]);
  if (!caseRow) return { ok: false, error: 'Case study not found.' };
  if (childErr) return { ok: false, error: `Could not load case members: ${childErr.message}` };
  const c = caseRow as {
    case_id: string;
    tags: string[];
    is_published: boolean;
    cat_pool: boolean;
  };
  if (!c.is_published) return { ok: false, error: 'Only published case studies can join a pack.' };
  // §20.5 mutual exclusivity, the other direction (see addPackStandalonesAction).
  if (c.cat_pool) {
    return {
      ok: false,
      error: `${caseId} is reserved for the CAT pool — release it there first. A case can only serve one purpose.`,
    };
  }
  const childIds = ((childRows ?? []) as { item_id: string }[]).map((r) => r.item_id);
  if (childIds.length === 0) return { ok: false, error: 'That case study has no questions.' };

  return finishAdd(supabase, packId, childIds, beforeLinkId, async () => {
    const tags = c.tags.includes(READINESS_TAG) ? c.tags : [...c.tags, READINESS_TAG];
    const { error } = await supabase
      .from('nclex_case_studies')
      .update({
        is_builder_visible: false,
        is_free_sample: false,
        tags,
        updated_at: new Date().toISOString(),
      })
      .eq('case_id', caseId);
    return error ? `Could not reserve ${caseId}: ${error.message}` : null;
  });
}

/** SELECTED questions of a trend — the §5 per-question model. The
 *  batch lands consecutively in item-id order; reservation flips the
 *  CHILD question rows' flags (§4 — the dataset's own flag is a no-op). */
export async function addPackTrendQuestionsAction(
  packId: string,
  trendId: string,
  itemIds: string[],
  beforeLinkId: string | null,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const ids = [...new Set(itemIds)].filter(Boolean).sort();
  if (ids.length === 0) return { ok: false, error: 'Nothing selected.' };

  const [{ data: trendRow }, { data: itemRows, error: itemErr }] = await Promise.all([
    supabase
      .from('nclex_trend_datasets')
      .select('trend_id, is_published')
      .eq('trend_id', trendId)
      .maybeSingle(),
    supabase
      .from('nclex_bank_items')
      .select('item_id, tags, is_published, trend_id, cat_pool')
      .in('item_id', ids),
  ]);
  if (!trendRow) return { ok: false, error: 'Trend not found.' };
  if (!(trendRow as { is_published: boolean }).is_published) {
    return { ok: false, error: 'Only published trends can join a pack.' };
  }
  if (itemErr) return { ok: false, error: `Could not load questions: ${itemErr.message}` };
  const items = (itemRows ?? []) as {
    item_id: string;
    tags: string[];
    is_published: boolean;
    trend_id: string | null;
    cat_pool: boolean;
  }[];
  if (items.length !== ids.length) {
    return { ok: false, error: 'One of those questions no longer exists.' };
  }
  const bad = items.find((i) => !i.is_published || i.trend_id !== trendId);
  if (bad) {
    return {
      ok: false,
      error: `${bad.item_id} is not a published question of this trend — refresh the picker.`,
    };
  }
  // §20.5 mutual exclusivity, the other direction (see addPackStandalonesAction).
  const reserved = items.find((i) => i.cat_pool);
  if (reserved) {
    return {
      ok: false,
      error: `${reserved.item_id} is reserved for the CAT pool — release it there first. A question can only serve one purpose.`,
    };
  }

  return finishAdd(supabase, packId, ids, beforeLinkId, () =>
    reserveQuestionRows(
      supabase,
      ids.map((id) => items.find((i) => i.item_id === id)!),
    ),
  );
}

/** Shared tail of every add: capacity → double-add pre-check →
 *  positions → reserve (fail-safe direction) → one batch link insert. */
async function finishAdd(
  supabase: Awaited<ReturnType<typeof requireBankCurator>>['supabase'],
  packId: string,
  itemIds: string[],
  beforeLinkId: string | null,
  reserve: () => Promise<string | null>,
): Promise<PackActionResult> {
  const loaded = await loadPackLinks(supabase, packId);
  if ('error' in loaded) return { ok: false, error: loaded.error };
  const { links, target } = loaded;

  if (links.length + itemIds.length > target) {
    return { ok: false, error: capacityError(target - links.length) };
  }

  const existing = await findExistingMemberships(supabase, itemIds);
  if (!Array.isArray(existing)) return { ok: false, error: existing.error };
  if (existing.length > 0) {
    return {
      ok: false,
      error: `Already in a pack: ${existing.slice(0, 3).join(', ')}${existing.length > 3 ? ` +${existing.length - 3} more` : ''}.`,
    };
  }

  const computed = computeInsertPositions(links, beforeLinkId, itemIds.length);
  if ('error' in computed) return { ok: false, error: computed.error };

  const reserveErr = await reserve();
  if (reserveErr) return { ok: false, error: reserveErr };

  const insertErr = await insertLinkRows(supabase, packId, itemIds, computed.positions);
  if (insertErr) return { ok: false, error: insertErr };

  revalidatePack(packId);
  return { ok: true };
}

// ── Publish / unpublish (Slice ③ — §6) ──────────────────────────────
// The gate lives on the TOGGLE, not on save — and it's re-computed
// here server-side (layered enforcement), not trusted from the client.
// Un-publish stops new sales/claims only; it never touches existing
// credits, attempts or review.

/** Gate + publish state for one pack — feeds the packs-list card
 *  menu's Publishing popup, which loads lazily instead of the list
 *  page loading five packs' full membership up front. */
export async function loadPackGateAction(packId: string): Promise<
  | { ok: true; published: boolean; gate: PackGate }
  | { ok: false; error: string }
> {
  const { supabase } = await requireBankCurator('admin');
  const detail = await loadPackDetail(supabase, packId);
  if (!detail) return { ok: false, error: 'Pack not found.' };
  return {
    ok: true,
    published: detail.pack.published,
    gate: computeGate(detail.pack, detail.units, detail.count, detail.pack.n ?? 100),
  };
}

export async function setPackPublishedAction(
  packId: string,
  publish: boolean,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  if (publish) {
    const detail = await loadPackDetail(supabase, packId);
    if (!detail) return { ok: false, error: 'Pack not found.' };
    const gate = computeGate(detail.pack, detail.units, detail.count, detail.pack.n ?? 100);
    if (!gate.ok) {
      const n = gate.rows.filter((r) => !r.ok).length;
      return {
        ok: false,
        error: `${n} item${n === 1 ? '' : 's'} to finish before this pack can go on sale — see the checklist.`,
      };
    }
  }

  const { error } = await supabase
    .from('nclex_readiness_packs')
    .update({
      published: publish,
      status: publish ? 'active' : 'draft',
      updated_at: new Date().toISOString(),
    })
    .eq('pack_id', packId);
  if (error) return { ok: false, error: `Could not update the pack: ${error.message}` };

  revalidatePack(packId);
  return { ok: true };
}

/** "Publish all N & publish pack" — mirrors the case wrapper's
 *  publish-all helper: flips is_published on the draft member
 *  questions (safe — a saved question row is always well-formed, and
 *  pack members are hidden from the builder so publishing only makes
 *  them reachable through this pack), then publishes the pack. Only
 *  offered/accepted when unpublished member questions are the ONLY
 *  gate gap. */
export async function publishAllAndPublishPackAction(
  packId: string,
): Promise<PackActionResult> {
  const { supabase } = await requireBankCurator('admin');

  const detail = await loadPackDetail(supabase, packId);
  if (!detail) return { ok: false, error: 'Pack not found.' };
  const gate = computeGate(detail.pack, detail.units, detail.count, detail.pack.n ?? 100);
  if (!gate.helperOnly) {
    return {
      ok: false,
      error: 'This helper only applies when unpublished member questions are the only gap.',
    };
  }

  const { error: pubErr } = await supabase
    .from('nclex_bank_items')
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .in('item_id', gate.unpubQ);
  if (pubErr) {
    return { ok: false, error: `Could not publish the questions: ${pubErr.message}` };
  }

  const { error } = await supabase
    .from('nclex_readiness_packs')
    .update({ published: true, status: 'active', updated_at: new Date().toISOString() })
    .eq('pack_id', packId);
  if (error) return { ok: false, error: `Could not publish the pack: ${error.message}` };

  revalidatePack(packId);
  return { ok: true };
}
