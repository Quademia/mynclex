// mynclex/lib/bank/cat-pool/actions.ts
//
// Server Actions for the CAT pool (Slice 10b2-b). Release only — adding to
// the pool is the editor tick today, and the reserve drawer in 10b2-d.
//
// Releasing clears `cat_pool`. Nothing is deleted and no content changes: the
// question returns to the practice pool and stops counting toward the CAT
// target. Re-reserving is a single tick, which is why the confirmation is a
// plain one rather than a typed gate.
//
// TWO reservation units, not three (migration 20260822120000):
//   • a CASE, written on the wrapper — a database trigger cascades the flag to
//     its children, so one UPDATE here takes the whole block in or out;
//   • a QUESTION, written on its own row — standalone and trend-linked alike.
// A trend dataset is not a unit at all: the exam picks trend questions
// individually, so they are reserved individually.
//
// The TS gate mirrors RLS: cat_pool is writable only under BANK_CURATE on the
// admin surface, so a tutor curator reaching this action is refused twice.
// Audit capture is automatic — the Slice-① triggers on both tables log the
// UPDATE without anything here.

'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';

export type ReleaseTarget = 'item' | 'case';

export type ReleaseResult = { ok: true; released: string } | { ok: false; error: string };

const TABLE: Record<ReleaseTarget, { table: string; idColumn: string; noun: string }> = {
  item: { table: 'nclex_bank_items', idColumn: 'item_id', noun: 'question' },
  case: { table: 'nclex_case_studies', idColumn: 'case_id', noun: 'case study' },
};

/**
 * Take one row out of the CAT pool.
 *
 * `target` decides which table is written, and it comes from the row's own
 * source rather than being inferred from the id — an id prefix is a naming
 * convention, not a guarantee, and writing the wrong table would silently
 * release something else.
 */
export async function releaseFromCatPool(
  target: ReleaseTarget,
  id: string,
): Promise<ReleaseResult> {
  const spec = TABLE[target];
  if (!spec) return { ok: false, error: 'Unknown release target.' };

  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: 'No id supplied.' };

  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  // Guarded on cat_pool = true as well as the id, so a double-submit (or a
  // stale page whose row has already been released) is a no-op rather than a
  // second write and a second audit entry.
  const { data, error } = await supabase
    .from(spec.table)
    .update({ cat_pool: false })
    .eq(spec.idColumn, trimmed)
    .eq('cat_pool', true)
    .select(spec.idColumn);

  if (error) {
    return { ok: false, error: `Could not release this ${spec.noun}. ${error.message}` };
  }

  if (!data || data.length === 0) {
    // Either it was already released, or RLS hid the row. Both are reported
    // the same way: nothing changed, and the page will show the truth on reload.
    return { ok: false, error: `That ${spec.noun} is no longer reserved — reload to see the current pool.` };
  }

  revalidatePath('/admin/cat-pool');
  return { ok: true, released: trimmed };
}

export type ReserveResult =
  | { ok: true; reserved: number; skipped: number }
  | { ok: false; error: string };

/**
 * Add a selection to the CAT pool (Slice 10b2-d).
 *
 * The mutual-exclusivity guard (§20.5) is re-checked HERE, not just in the
 * drawer that greys the row out: 10b1 stored reservation as a boolean rather
 * than the UNIQUE table §20.2 planned, so there is no constraint to catch a
 * stale page or a crafted request. Readiness-tagged ids are dropped and
 * reported as skipped rather than failing the whole batch.
 */
export async function reserveToCatPool(
  targets: { kind: ReleaseTarget; id: string }[],
): Promise<ReserveResult> {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { ok: false, error: 'Nothing selected.' };
  }

  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const byKind = new Map<ReleaseTarget, string[]>();
  for (const t of targets) {
    if (!TABLE[t.kind]) continue;
    const id = t.id.trim();
    if (!id) continue;
    byKind.set(t.kind, [...(byKind.get(t.kind) ?? []), id]);
  }

  // One question serves one purpose. Check the live link table rather than
  // trusting what the drawer displayed.
  const itemIds = byKind.get('item') ?? [];
  let skipped = 0;
  if (itemIds.length) {
    const { data: clash } = await supabase
      .from('nclex_readiness_pack_items')
      .select('item_id')
      .in('item_id', itemIds);
    const blocked = new Set((clash ?? []).map((r) => (r as { item_id: string }).item_id));
    if (blocked.size) {
      skipped += blocked.size;
      byKind.set('item', itemIds.filter((id) => !blocked.has(id)));
    }
  }

  // A case is not a pack member, but its CHILDREN can be — and reserving a
  // case cascades `cat_pool` onto all six. The drawer's UI already greys
  // these (queries.ts rolls child pack membership up into the wrapper's
  // `readinessTagged`), so this is not a hole a curator can click through.
  // What was missing is the SERVER-side re-check the item path above has —
  // and that one exists for a stated reason: don't trust what the drawer
  // displayed. A stale page, or a pack edited in another tab between load
  // and submit, went straight through for cases. The UI rollup also counts
  // only published children, so a pack member that is an unpublished child
  // greys nothing.
  //
  // The database now refuses it outright (`nclex_cat_pool_seal_item`,
  // migration 20260828120000) — that is the guarantee. This check exists so
  // the curator gets a counted skip and a sentence they can act on, rather
  // than a raw check_violation naming a child id they never selected.
  //
  // Runs BEFORE the placeability gate so a case failing both is skipped
  // once, not twice.
  const packCaseIds = byKind.get('case') ?? [];
  if (packCaseIds.length) {
    const { data: kids } = await supabase
      .from('nclex_bank_items')
      .select('item_id, parent_case_id')
      .in('parent_case_id', packCaseIds);

    const children = (kids ?? []) as { item_id: string; parent_case_id: string }[];
    if (children.length) {
      const { data: clash } = await supabase
        .from('nclex_readiness_pack_items')
        .select('item_id')
        .in('item_id', children.map((k) => k.item_id));

      const blockedKids = new Set((clash ?? []).map((r) => (r as { item_id: string }).item_id));
      if (blockedKids.size) {
        const blockedCases = new Set(
          children.filter((k) => blockedKids.has(k.item_id)).map((k) => k.parent_case_id),
        );
        skipped += blockedCases.size;
        byKind.set('case', packCaseIds.filter((id) => !blockedCases.has(id)));
      }
    }
  }

  // A case whose children cannot all be placed is a case CAT will never
  // schedule, so reserving it adds nothing to the pool while adding six
  // questions to the target. The database no longer refuses this — the
  // placeability CHECK exempts case children on purpose, because the cascade
  // trigger would otherwise make an unplaceable child unsaveable — so the
  // gate lives here, where it can say what is wrong.
  //
  // The test mirrors `cat_next_item`'s case slot exactly: SIX published
  // children, each carrying `difficulty_irt`. Counting the shortfall is what
  // makes it binding — checking only that no child is *broken* passes a case
  // with five published children, which the scheduler then skips forever.
  // `difficulty_irt` is the column the scheduler counts; the band and the
  // subcategory are held to as well, since a child with no subcategory can
  // still be served but cannot be balanced against the blueprint.
  const caseIds = byKind.get('case') ?? [];
  if (caseIds.length) {
    const { data: kids } = await supabase
      .from('nclex_bank_items')
      .select('parent_case_id, difficulty, difficulty_irt, client_needs_subcategory')
      .in('parent_case_id', caseIds)
      .eq('is_published', true);

    const placeable = new Map<string, number>();
    for (const k of (kids ?? []) as {
      parent_case_id: string;
      difficulty: string | null;
      difficulty_irt: number | null;
      client_needs_subcategory: string | null;
    }[]) {
      if (!k.difficulty || k.difficulty_irt === null || !k.client_needs_subcategory) continue;
      placeable.set(k.parent_case_id, (placeable.get(k.parent_case_id) ?? 0) + 1);
    }

    const schedulable = caseIds.filter((id) => (placeable.get(id) ?? 0) === 6);
    if (schedulable.length !== caseIds.length) {
      skipped += caseIds.length - schedulable.length;
      byKind.set('case', schedulable);
    }
  }

  let reserved = 0;
  for (const [kind, ids] of byKind) {
    if (!ids.length) continue;
    const spec = TABLE[kind];

    // Reserving also clears the practice-side flags (10b3). `cat_pool` in
    // `_nclex_eligible_unit_pool` is what actually keeps the row out of
    // practice; this is the second layer, so a query that forgets the pool
    // predicate still cannot serve reserved stock. `is_free_sample` goes
    // because a free sample is public shop window and a reserved question
    // must not be met before the exam — the two cannot both be true.
    const { data, error } = await supabase
      .from(spec.table)
      .update(
        kind === 'item'
          ? { cat_pool: true, is_builder_visible: false, is_free_sample: false }
          : { cat_pool: true, is_builder_visible: false },
      )
      .in(spec.idColumn, ids)
      .eq('cat_pool', false)
      .select(spec.idColumn);

    if (error) {
      return { ok: false, error: `Could not reserve. ${error.message}` };
    }
    reserved += data?.length ?? 0;
    skipped += ids.length - (data?.length ?? 0);
  }

  if (reserved === 0) {
    return {
      ok: false,
      error:
        skipped > 0
          ? 'Nothing was reserved — those are already reserved, belong to a readiness pack, or are cases without six published questions the selector can place.'
          : 'Nothing was reserved.',
    };
  }

  revalidatePath('/admin/cat-pool');
  return { ok: true, reserved, skipped };
}

export type BulkReleaseResult =
  | { ok: true; released: number; failed: number }
  | { ok: false; error: string };

/**
 * Release a selected set in one go.
 *
 * Grouped per table so this is three UPDATEs rather than one per row — a
 * curator can select a few hundred. Partial success is reported honestly
 * rather than rolled back: each row is independent, and a release that did
 * happen should not be undone because a sibling failed.
 */
export async function releaseManyFromCatPool(
  targets: { kind: ReleaseTarget; id: string }[],
): Promise<BulkReleaseResult> {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { ok: false, error: 'Nothing selected.' };
  }

  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const byKind = new Map<ReleaseTarget, string[]>();
  for (const t of targets) {
    if (!TABLE[t.kind]) continue;
    const id = t.id.trim();
    if (!id) continue;
    const list = byKind.get(t.kind) ?? [];
    list.push(id);
    byKind.set(t.kind, list);
  }

  let released = 0;
  let failed = 0;

  for (const [kind, ids] of byKind) {
    const spec = TABLE[kind];
    const { data, error } = await supabase
      .from(spec.table)
      .update({ cat_pool: false })
      .in(spec.idColumn, ids)
      .eq('cat_pool', true)
      .select(spec.idColumn);

    if (error) {
      failed += ids.length;
      continue;
    }
    released += data?.length ?? 0;
    failed += ids.length - (data?.length ?? 0);
  }

  revalidatePath('/admin/cat-pool');

  if (released === 0) {
    return { ok: false, error: 'Nothing was released — reload to see the current pool.' };
  }
  return { ok: true, released, failed };
}
