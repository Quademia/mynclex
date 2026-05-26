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
import type {
  LibraryFolderWithCount,
  LibraryNote,
  LibraryNoteForEdit,
  LibraryNoteListRow,
} from './types';

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


// =====================================================================
// Slice 11.2b — notes
// =====================================================================

/**
 * Notes the signed-in tutor owns, filtered by folder.
 *   • `folderId === null` returns root notes (folder_id IS NULL).
 *   • `folderId === string` returns notes in that folder.
 *   • Call with `folderId === 'all'` from a route param to bypass the
 *     filter and return every note — handled by the caller (page.tsx).
 *
 * Excludes body + body_tsv to keep the row light — list views never
 * need the body. Sorted by `position` so the tutor's curated order
 * (when it lands) survives; ties break on updated_at desc.
 */
export async function getNotesForTutor(
  folderId: string | null,
): Promise<LibraryNoteListRow[]> {
  const supabase = await createClient();

  const baseSelect = `note_id, folder_id, title, subtitle, description,
                      tags, pillars, is_published, visibility_mode,
                      updated_at`;

  let query = supabase
    .from('nclex_tutor_library_notes')
    .select(baseSelect)
    .order('position', { ascending: true })
    .order('updated_at', { ascending: false });

  // PostgREST distinguishes `.is(col, null)` from `.eq(col, value)` —
  // the former is the only way to filter IS NULL.
  if (folderId === null) {
    query = query.is('folder_id', null);
  } else {
    query = query.eq('folder_id', folderId);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as LibraryNoteListRow[];
}

/**
 * Full note read for the editor route. Returns null when the id
 * doesn't match any of the tutor's notes (RLS filters cross-tutor
 * access, so this catches both "doesn't exist" and "not yours"
 * with the same return shape — page.tsx surfaces both as a 404).
 *
 * Joins the attachment table for the "Used in" rail count — single
 * round trip via PostgREST's relationship-based count. Today the
 * count is always 0 (no attachment UI yet); when slice 11.11 ships,
 * the same query lights up automatically.
 *
 * Excludes `body_tsv` (it's the FTS vector — not needed at edit
 * time, and Postgres pretty-prints it heavily on the wire).
 */
export async function getNoteForEdit(
  noteId: string,
): Promise<LibraryNoteForEdit | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select(
      `note_id, tutor_id, folder_id, title, subtitle, description,
       body, tags, pillars, version_id, position, is_published,
       visibility_mode, created_at, updated_at,
       nclex_tutor_library_note_attachments(count)`,
    )
    .eq('note_id', noteId)
    .maybeSingle();

  if (error || !data) return null;

  // PostgREST returns the count as an array with one entry — same
  // shape as the folder note-count join. Normalise to a plain number.
  const countArr = (
    data as {
      nclex_tutor_library_note_attachments?: Array<{ count: number }>;
    }
  ).nclex_tutor_library_note_attachments;
  const used_in_count =
    Array.isArray(countArr) && countArr[0]?.count != null
      ? countArr[0].count
      : 0;

  // Strip the embed before returning so the LibraryNote shape stays
  // clean — the count lives in the extension field, not as a nested
  // relationship array.
  const {
    nclex_tutor_library_note_attachments: _embed,
    ...rest
  } = data as LibraryNote & {
    nclex_tutor_library_note_attachments?: Array<{ count: number }>;
  };
  void _embed;

  return { ...(rest as LibraryNote), used_in_count } satisfies LibraryNoteForEdit;
}
