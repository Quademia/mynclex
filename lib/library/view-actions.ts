// mynclex/lib/library/view-actions.ts
//
// Server actions for saved custom views (slice 11.16c-2). Plain CRUD
// against `nclex_tutor_library_views` under the caller's own RLS — no
// SECURITY DEFINER RPC needed (the policies scope every write to the
// tutor's own rows). Follows the same three-wall model as the rest of
// the library actions: requireTutor() gate + POST-only server action +
// per-row RLS.
//
// Filters are sanitised through `normalizeFilters` before storage, so a
// malformed client payload can never land a junk `filters_json` row.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTutor } from '@/lib/access';
import {
  normalizeFilters,
  type LibraryViewFilters,
} from './view-filters';

type CreateResult =
  | { ok: true; viewId: string }
  | { ok: false; error: string };

type MutateResult = { ok: true } | { ok: false; error: string };

function validateName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 60) return null;
  return trimmed;
}

/**
 * Create a new saved view. Name is required (1..60 chars); filters are
 * normalised before storage. New views land at the tail (position =
 * current max + 1, mirroring folders / shelves).
 */
export async function createViewAction(
  name: string,
  filters: LibraryViewFilters,
): Promise<CreateResult> {
  const cleanName = validateName(name);
  if (cleanName === null) {
    return { ok: false, error: 'A view needs a name (1–60 characters).' };
  }

  const supabase = await createClient();
  const { user } = await requireTutor();

  const { data: maxRow } = await supabase
    .from('nclex_tutor_library_views')
    .select('position')
    .eq('tutor_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition =
    maxRow && typeof maxRow.position === 'number' ? maxRow.position + 1 : 0;

  const { data, error } = await supabase
    .from('nclex_tutor_library_views')
    .insert({
      tutor_id: user.id,
      name: cleanName,
      filters_json: normalizeFilters(filters),
      position: nextPosition,
    })
    .select('view_id')
    .single();

  if (error || !data) {
    return { ok: false, error: 'Could not save the view.' };
  }
  revalidatePath('/tutor/library');
  return { ok: true, viewId: data.view_id as string };
}

/**
 * Update a saved view's name + filters in place (the builder's edit
 * mode). RLS scopes the UPDATE to the tutor's own row.
 */
export async function updateViewAction(
  viewId: string,
  name: string,
  filters: LibraryViewFilters,
): Promise<MutateResult> {
  const cleanName = validateName(name);
  if (cleanName === null) {
    return { ok: false, error: 'A view needs a name (1–60 characters).' };
  }

  const supabase = await createClient();
  const { user } = await requireTutor();

  const { error } = await supabase
    .from('nclex_tutor_library_views')
    .update({
      name: cleanName,
      filters_json: normalizeFilters(filters),
      updated_at: new Date().toISOString(),
    })
    .eq('view_id', viewId)
    .eq('tutor_id', user.id);

  if (error) {
    return { ok: false, error: 'Could not update the view.' };
  }
  revalidatePath('/tutor/library');
  return { ok: true };
}

/**
 * Rename a saved view (name only) — the quick action in the view
 * pane header. Leaves filters untouched.
 */
export async function renameViewAction(
  viewId: string,
  name: string,
): Promise<MutateResult> {
  const cleanName = validateName(name);
  if (cleanName === null) {
    return { ok: false, error: 'A view needs a name (1–60 characters).' };
  }

  const supabase = await createClient();
  const { user } = await requireTutor();

  const { error } = await supabase
    .from('nclex_tutor_library_views')
    .update({ name: cleanName, updated_at: new Date().toISOString() })
    .eq('view_id', viewId)
    .eq('tutor_id', user.id);

  if (error) {
    return { ok: false, error: 'Could not rename the view.' };
  }
  revalidatePath('/tutor/library');
  return { ok: true };
}

/**
 * Delete a saved view. The note rows are untouched — a view is just a
 * saved filter, so deleting it loses nothing but the shortcut.
 */
export async function deleteViewAction(
  viewId: string,
): Promise<MutateResult> {
  const supabase = await createClient();
  const { user } = await requireTutor();

  const { error } = await supabase
    .from('nclex_tutor_library_views')
    .delete()
    .eq('view_id', viewId)
    .eq('tutor_id', user.id);

  if (error) {
    return { ok: false, error: 'Could not delete the view.' };
  }
  revalidatePath('/tutor/library');
  return { ok: true };
}
