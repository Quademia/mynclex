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
// Reservation lives on the WRAPPER for cases and trends (10b1), so releasing a
// wrapper is one UPDATE that takes every child out with it — the caller is
// responsible for saying so before it happens.
//
// The TS gate mirrors RLS: cat_pool is writable only under BANK_CURATE on the
// admin surface, so a tutor curator reaching this action is refused twice.
// Audit capture is automatic — the Slice-① triggers on all three tables log
// the UPDATE without anything here.

'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';

export type ReleaseTarget = 'item' | 'case' | 'trend';

export type ReleaseResult = { ok: true; released: string } | { ok: false; error: string };

const TABLE: Record<ReleaseTarget, { table: string; idColumn: string; noun: string }> = {
  item: { table: 'nclex_bank_items', idColumn: 'item_id', noun: 'question' },
  case: { table: 'nclex_case_studies', idColumn: 'case_id', noun: 'case study' },
  trend: { table: 'nclex_trend_datasets', idColumn: 'trend_id', noun: 'trend dataset' },
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
