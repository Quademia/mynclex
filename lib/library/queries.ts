// mynclex/lib/library/queries.ts
//
// Server-side reads for the tutor library (slice 11.2a — folders).
// RLS gates every read to the signed-in tutor's own rows via
// `nclex_tutor_library_folders_self_select`. Calls return [] when
// the user isn't signed in (auth gate happens in the layout) or
// when the tutor has no folders yet.
//
// Slice 11.2b extends this file with note queries; folder reads
// stay as-is.

import { createClient } from '@/lib/supabase/server';
import type { LibraryFolderWithCount } from './types';

/**
 * All folders owned by the signed-in tutor, with per-folder note
 * counts joined in the same round trip. Sorted by `position` so
 * the tutor's curated ordering survives across reloads — newly-
 * created folders land at the tail (we set `position` = current
 * count + 1 on insert).
 *
 * The note-count subquery uses PostgREST's relationship-based
 * count (`nclex_tutor_library_notes(count)`), which becomes a
 * LEFT JOIN with COUNT in SQL — single round trip, ~O(folders +
 * notes) read on the dev dataset.
 *
 * For 11.2a the count column will always be 0 (no notes can exist
 * yet). 11.2b's note CRUD makes it light up; this query doesn't
 * need to change then.
 */
export async function getFoldersForTutor(): Promise<LibraryFolderWithCount[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_tutor_library_folders')
    .select(
      `folder_id, tutor_id, name, description, position,
       created_at, updated_at,
       nclex_tutor_library_notes(count)`
    )
    .order('position', { ascending: true });

  if (error || !data) return [];

  // PostgREST returns the count as an array with one object:
  // `nclex_tutor_library_notes: [{ count: N }]`. Normalise to a
  // plain number on the row.
  return data.map((row) => {
    const countArr = (row as { nclex_tutor_library_notes?: Array<{ count: number }> })
      .nclex_tutor_library_notes;
    const note_count = Array.isArray(countArr) && countArr[0]?.count != null
      ? countArr[0].count
      : 0;
    const {
      folder_id, tutor_id, name, description, position,
      created_at, updated_at,
    } = row;
    return {
      folder_id,
      tutor_id,
      name,
      description,
      position,
      created_at,
      updated_at,
      note_count,
    } satisfies LibraryFolderWithCount;
  });
}
