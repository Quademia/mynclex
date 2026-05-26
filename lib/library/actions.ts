// mynclex/lib/library/actions.ts
//
// Server actions for the tutor library (slice 11.2a — folders).
// RLS enforces tutor ownership on INSERT via
// `nclex_tutor_library_folders_self_insert` (tutor_id = auth.uid()).
// The action layer adds an auth check + input validation + name
// uniqueness so the UX-friendly error surfaces before the DB.
//
// Slice 11.2b extends this with note actions.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { LibraryFolderFormValues } from './types';

export type CreateFolderResult =
  | { ok: true; folder_id: string }
  | { ok: false; error: string };

// Mirror the CD prototype's input constraints: 2..60 chars, trimmed,
// no duplicate names within the tutor's library.
const NAME_MIN = 2;
const NAME_MAX = 60;

function validate(input: LibraryFolderFormValues): string | null {
  const trimmed = input.name.trim();
  if (trimmed.length < NAME_MIN) {
    return `Folder name must be at least ${NAME_MIN} characters.`;
  }
  if (trimmed.length > NAME_MAX) {
    return `Folder name must be ${NAME_MAX} characters or fewer.`;
  }
  if (input.description != null && input.description.length > 280) {
    return 'Description must be 280 characters or fewer.';
  }
  return null;
}

/**
 * Create a folder owned by the signed-in tutor. Returns the new
 * folder_id on success. Errors come back as a discriminated-union
 * `{ ok: false, error }` so the calling client can render them
 * inline + via ErrorToast.
 *
 * `position` is set to current folder count so new folders land at
 * the tail of the tutor's existing order.
 */
export async function createFolderAction(
  input: LibraryFolderFormValues
): Promise<CreateFolderResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const name = input.name.trim();
  const description =
    input.description != null && input.description.trim().length > 0
      ? input.description.trim()
      : null;

  // Case-insensitive uniqueness check before insert. The DB doesn't
  // enforce this (no unique index on (tutor_id, lower(name))) — it's
  // a UX-friendly app-layer gate so the tutor gets a specific
  // message rather than a generic constraint error. Race condition
  // window is microseconds; if a duplicate slips through we just
  // accept the two rows (extremely unlikely in single-user flow).
  const { data: existing } = await supabase
    .from('nclex_tutor_library_folders')
    .select('folder_id, name')
    .ilike('name', name);
  if (existing && existing.length > 0) {
    return { ok: false, error: `A folder named "${name}" already exists.` };
  }

  // Position = current count, so new folders go to the tail.
  const { count } = await supabase
    .from('nclex_tutor_library_folders')
    .select('folder_id', { count: 'exact', head: true });
  const position = count ?? 0;

  const { data, error } = await supabase
    .from('nclex_tutor_library_folders')
    .insert({
      tutor_id: user.id,
      name,
      description,
      position,
    })
    .select('folder_id')
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'Failed to create folder.',
    };
  }

  revalidatePath('/tutor/library');
  return { ok: true, folder_id: data.folder_id };
}
