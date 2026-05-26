// mynclex/lib/library/queries.ts
//
// Server-side reads for the tutor library (slice 11.2a — folders).
// RLS gates every read to the signed-in tutor's own rows via
// `nclex_tutor_library_folders_self_select`. Calls return [] when
// the user isn't signed in (auth gate happens in the layout) or
// when the tutor has no folders yet.
//
// Slice 11.2b extends this file with note queries; folder reads
// stay as-is. Slice 11.3a adds shelf queries the same way.

import { createClient } from '@/lib/supabase/server';
import type {
  LibraryEligibleNote,
  LibraryFolderWithCount,
  LibraryNote,
  LibraryNoteForEdit,
  LibraryNoteListRow,
  LibraryShelfCardNote,
  LibraryShelfWithCount,
  LibraryShelfWithNotes,
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


// =====================================================================
// Slice 11.3a — shelves
// =====================================================================

/**
 * All shelves owned by the signed-in tutor, with per-shelf note
 * counts joined in the same round trip. Sorted by `position` so the
 * tutor's curated ordering survives across reloads — newly-created
 * shelves land at the tail (`createShelfAction` sets `position` to
 * the current count on insert).
 *
 * The note-count subquery uses PostgREST's relationship-based count
 * (`nclex_tutor_library_shelf_memberships(count)`) — the same shape
 * as the folder note-count join in `getFoldersForTutor`. Becomes a
 * LEFT JOIN with COUNT in SQL — single round trip.
 *
 * Members are pulled via the M:N junction table, not via a column on
 * the notes table (notes can sit on many shelves). Membership rows
 * are gated by RLS through `nclex_tutor_library_shelf_memberships_self_all`,
 * which scopes via the parent shelf's `tutor_id` — so the count we
 * get back is exactly "rows in this shelf that the tutor owns".
 */
export async function getShelvesForTutor(): Promise<LibraryShelfWithCount[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_tutor_library_shelves')
    .select(
      `shelf_id, tutor_id, title, tagline, description, color, position,
       created_at, updated_at,
       nclex_tutor_library_shelf_memberships(count)`,
    )
    .order('position', { ascending: true });

  if (error || !data) return [];

  // PostgREST returns the count as an array with one object —
  // identical normalisation to the folder note-count branch.
  return data.map((row) => {
    const countArr = (
      row as {
        nclex_tutor_library_shelf_memberships?: Array<{ count: number }>;
      }
    ).nclex_tutor_library_shelf_memberships;
    const note_count =
      Array.isArray(countArr) && countArr[0]?.count != null
        ? countArr[0].count
        : 0;
    const {
      shelf_id,
      tutor_id,
      title,
      tagline,
      description,
      color,
      position,
      created_at,
      updated_at,
    } = row;
    return {
      shelf_id,
      tutor_id,
      title,
      tagline,
      description,
      color,
      position,
      created_at,
      updated_at,
      note_count,
    } satisfies LibraryShelfWithCount;
  });
}


// =====================================================================
// Slice 11.3b — shelves + members joined for the carousel
// =====================================================================

/**
 * Shelves with their member notes attached — feeds the Spotify-
 * style All Shelves carousel main pane. One round trip via
 * PostgREST embed: each shelf row carries an array of
 * `_shelf_memberships(position, _notes(...))` joins that we flatten
 * down into a clean `notes: LibraryShelfCardNote[]` ordered by
 * membership.position.
 *
 * Heavy at the embed layer (one join hop + a nested join to the
 * notes table), but bounded — a shelf typically holds 5..40 notes,
 * and a tutor typically has < 20 shelves. If carousel render time
 * grows into a problem, the natural next move is a
 * `nclex_tutor_library_shelf_notes` materialised view; not needed
 * for v1.
 *
 * RLS gates: tutor sees own shelves (`_shelves_self_select`); the
 * membership embed sees own rows (`_shelf_memberships_self_all`);
 * the nested note embed sees own notes (`_notes_self_select`). All
 * three policies fire automatically through the PostgREST query.
 */
export async function getShelvesWithNotes(): Promise<LibraryShelfWithNotes[]> {
  const supabase = await createClient();

  // The double-nested embed shape:
  //   shelves
  //     └─ shelf_memberships
  //          └─ notes
  // PostgREST returns membership rows ordered by their `position`
  // when we add `.order('position', { foreignTable: ... })`, but
  // the simpler path is to fetch unordered and sort in JS — the
  // arrays are small.
  const { data, error } = await supabase
    .from('nclex_tutor_library_shelves')
    .select(
      `shelf_id, tutor_id, title, tagline, description, color, position,
       created_at, updated_at,
       nclex_tutor_library_shelf_memberships (
         position,
         nclex_tutor_library_notes (
           note_id, title, subtitle, description, pillars,
           is_published, updated_at
         )
       )`,
    )
    .order('position', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    // Flatten the membership embed → ordered LibraryShelfCardNote[].
    const memberships =
      (row as {
        nclex_tutor_library_shelf_memberships?: Array<{
          position: number;
          nclex_tutor_library_notes:
            | LibraryShelfCardNote
            | LibraryShelfCardNote[]
            | null;
        }>;
      }).nclex_tutor_library_shelf_memberships ?? [];

    const notes: LibraryShelfCardNote[] = memberships
      .map((m) => {
        // PostgREST returns the nested note as either an object (FK
        // is to-one) or an array (FK is to-many); the membership
        // row's FK is to-one (each membership references exactly one
        // note), so it's the object case here. Defensive handle both.
        const n = m.nclex_tutor_library_notes;
        const note = Array.isArray(n) ? n[0] : n;
        return note ? { note, position: m.position } : null;
      })
      .filter((x): x is { note: LibraryShelfCardNote; position: number } => x != null)
      .sort((a, b) => a.position - b.position)
      .map((x) => x.note);

    const {
      shelf_id,
      tutor_id,
      title,
      tagline,
      description,
      color,
      position,
      created_at,
      updated_at,
    } = row;
    return {
      shelf_id,
      tutor_id,
      title,
      tagline,
      description,
      color,
      position,
      created_at,
      updated_at,
      note_count: notes.length,
      notes,
    } satisfies LibraryShelfWithNotes;
  });
}


/**
 * Eligible-notes picker for the AddNotesToShelfDialog. Returns every
 * note the tutor owns that ISN'T already on the given shelf — both
 * draft AND published per the 11.3b scope decision (shelves don't
 * gate visibility; drafts on shelves are harmless).
 *
 * `folder_name` is joined in for the picker meta line.
 * `other_shelf_count` is the count of memberships this note has on
 * OTHER shelves (drives the "also on N shelf" badge); 0 for notes
 * with no membership rows anywhere.
 *
 * Sorted by `updated_at desc` so the tutor's most-recently-worked-
 * on notes surface first — that's the natural "what am I curating
 * right now" order.
 */
export async function getEligibleNotesForShelf(
  shelfId: string,
): Promise<LibraryEligibleNote[]> {
  const supabase = await createClient();

  // Pull all owned notes with folder + every membership in a single
  // round trip. We exclude already-on-this-shelf rows in JS rather
  // than via a NOT EXISTS subquery — supabase-js doesn't express
  // that well and the membership arrays are small.
  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select(
      `note_id, title, subtitle, folder_id, pillars, is_published,
       updated_at,
       nclex_tutor_library_folders ( name ),
       nclex_tutor_library_shelf_memberships ( shelf_id )`,
    )
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data
    .map((row) => {
      const folderEmbed = (row as {
        nclex_tutor_library_folders?:
          | { name: string }
          | { name: string }[]
          | null;
      }).nclex_tutor_library_folders;
      const folder = Array.isArray(folderEmbed) ? folderEmbed[0] : folderEmbed;

      const memberships =
        (row as {
          nclex_tutor_library_shelf_memberships?: Array<{ shelf_id: string }>;
        }).nclex_tutor_library_shelf_memberships ?? [];

      const onThisShelf = memberships.some((m) => m.shelf_id === shelfId);
      if (onThisShelf) return null; // exclude already-attached

      const other_shelf_count = memberships.filter(
        (m) => m.shelf_id !== shelfId,
      ).length;

      const projection: LibraryEligibleNote = {
        note_id: row.note_id,
        title: row.title,
        subtitle: row.subtitle,
        folder_id: row.folder_id,
        folder_name: folder?.name ?? null,
        pillars: row.pillars,
        is_published: row.is_published,
        other_shelf_count,
      };
      return projection;
    })
    .filter((x): x is LibraryEligibleNote => x != null);
}
