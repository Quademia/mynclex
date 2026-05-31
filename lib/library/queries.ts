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

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { NCLEX_PILLARS } from './types';
import {
  applyViewFilters,
  normalizeFilters,
  type LibrarySavedView,
  type LibrarySavedViewWithCount,
} from './view-filters';
import type {
  LibraryEligibleNote,
  LibraryFolderWithCount,
  LibraryNote,
  LibraryNoteForEdit,
  LibraryNoteLensRow,
  LibraryNoteListRow,
  LibraryOverviewStats,
  LibraryProgrammeOption,
  LibraryShelfCardNote,
  LibraryShelfDetail,
  LibraryShelfDetailNote,
  LibraryShelfPip,
  LibraryShelfWithCount,
  LibraryShelfWithNotes,
  LibrarySearchFieldFlags,
  LibraryTagCount,
  LibraryViewCounts,
  LibraryViewKey,
  NclexPillar,
} from './types';


// =====================================================================
// Shared embed helpers — used by getNotesForTutor + getShelfDetail +
// getNoteForEdit. Each takes the raw PostgREST embed shape (which may
// be `T | T[] | null` depending on FK direction) and returns the
// flattened projection field.
// =====================================================================

type FolderEmbed = { name: string } | { name: string }[] | null | undefined;
type ShelfPipEmbed = {
  nclex_tutor_library_shelves:
    | { shelf_id: string; title: string; color: string }
    | { shelf_id: string; title: string; color: string }[]
    | null;
}[];
type AttachmentCountEmbed =
  | { count: number }
  | { count: number }[]
  | null
  | undefined;

function extractFolderName(embed: FolderEmbed): string | null {
  const f = Array.isArray(embed) ? embed[0] : embed;
  return f?.name ?? null;
}

function extractShelfPips(embed: ShelfPipEmbed | null | undefined): LibraryShelfPip[] {
  if (!Array.isArray(embed)) return [];
  return embed
    .map((m) => {
      const s = m.nclex_tutor_library_shelves;
      const shelf = Array.isArray(s) ? s[0] : s;
      if (!shelf) return null;
      return {
        shelf_id: shelf.shelf_id,
        title: shelf.title,
        color: shelf.color,
      } satisfies LibraryShelfPip;
    })
    .filter((x): x is LibraryShelfPip => x != null);
}

function extractAttachmentCount(embed: AttachmentCountEmbed): number {
  const arr = Array.isArray(embed) ? embed : embed ? [embed] : [];
  const first = arr[0];
  return first?.count ?? 0;
}

// The canonical `LibraryNoteLensRow` PostgREST select — folder name +
// shelf-pip memberships + programme-attachment count, the shape every
// full-width note row needs. (getNotesForTutor / getShelfDetail /
// fetchAllLensRowsForTutor still inline their own copies; the search
// query below uses this shared pair.)
const LENS_ROW_SELECT = `
  note_id, folder_id, title, subtitle, description,
  tags, pillars, is_published, visibility_mode, updated_at,
  nclex_tutor_library_folders ( name ),
  nclex_tutor_library_shelf_memberships (
    nclex_tutor_library_shelves ( shelf_id, title, color )
  ),
  nclex_tutor_library_note_attachments ( count )
`;

type LensRowEmbed = {
  note_id: string;
  folder_id: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  tags: string[];
  pillars: NclexPillar[];
  is_published: boolean;
  visibility_mode: LibraryNoteLensRow['visibility_mode'];
  updated_at: string;
  nclex_tutor_library_folders: FolderEmbed;
  nclex_tutor_library_shelf_memberships: ShelfPipEmbed;
  nclex_tutor_library_note_attachments: AttachmentCountEmbed;
};

function mapLensRow(row: unknown): LibraryNoteLensRow {
  const r = row as LensRowEmbed;
  return {
    note_id: r.note_id,
    folder_id: r.folder_id,
    folder_name: extractFolderName(r.nclex_tutor_library_folders),
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    pillars: r.pillars,
    tags: r.tags,
    shelf_memberships: extractShelfPips(
      r.nclex_tutor_library_shelf_memberships,
    ),
    is_published: r.is_published,
    visibility_mode: r.visibility_mode,
    updated_at: r.updated_at,
    used_in_count: extractAttachmentCount(
      r.nclex_tutor_library_note_attachments,
    ),
  } satisfies LibraryNoteLensRow;
}

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
 * Returns the canonical `LibraryNoteLensRow` projection used by every
 * full-width row context (folder list, future All Notes / Drafts /
 * Used nowhere views). PostgREST embeds carry the folder name, the
 * shelf-membership pips (one per shelf with its identity colour),
 * and the programme-attachment count — single round trip.
 *
 * Excludes body + body_tsv to keep the row light — list views never
 * need the body. Sorted by `position` so the tutor's curated order
 * (when it lands) survives; ties break on updated_at desc.
 */
export async function getNotesForTutor(
  folderId: string | null,
): Promise<LibraryNoteListRow[]> {
  const supabase = await createClient();

  const baseSelect = `
    note_id, folder_id, title, subtitle, description,
    tags, pillars, is_published, visibility_mode, updated_at,
    nclex_tutor_library_folders ( name ),
    nclex_tutor_library_shelf_memberships (
      nclex_tutor_library_shelves ( shelf_id, title, color )
    ),
    nclex_tutor_library_note_attachments ( count )
  `;

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

  return data.map((row) => {
    const r = row as {
      note_id: string;
      folder_id: string | null;
      title: string;
      subtitle: string | null;
      description: string | null;
      tags: string[];
      pillars: NclexPillar[];
      is_published: boolean;
      visibility_mode: LibraryNoteLensRow['visibility_mode'];
      updated_at: string;
      nclex_tutor_library_folders: FolderEmbed;
      nclex_tutor_library_shelf_memberships: ShelfPipEmbed;
      nclex_tutor_library_note_attachments: AttachmentCountEmbed;
    };
    return {
      note_id: r.note_id,
      folder_id: r.folder_id,
      folder_name: extractFolderName(r.nclex_tutor_library_folders),
      title: r.title,
      subtitle: r.subtitle,
      description: r.description,
      pillars: r.pillars,
      tags: r.tags,
      shelf_memberships: extractShelfPips(
        r.nclex_tutor_library_shelf_memberships,
      ),
      is_published: r.is_published,
      visibility_mode: r.visibility_mode,
      updated_at: r.updated_at,
      used_in_count: extractAttachmentCount(
        r.nclex_tutor_library_note_attachments,
      ),
    } satisfies LibraryNoteLensRow;
  });
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
       nclex_tutor_library_note_attachments(count),
       nclex_tutor_library_shelf_memberships (
         nclex_tutor_library_shelves ( shelf_id, title, color )
       ),
       nclex_tutor_library_note_visibility ( programme_id )`,
    )
    .eq('note_id', noteId)
    .maybeSingle();

  if (error || !data) return null;

  const raw = data as LibraryNote & {
    nclex_tutor_library_note_attachments?: AttachmentCountEmbed;
    nclex_tutor_library_shelf_memberships?: ShelfPipEmbed;
    nclex_tutor_library_note_visibility?: { programme_id: string }[] | null;
  };

  const used_in_count = extractAttachmentCount(
    raw.nclex_tutor_library_note_attachments,
  );
  const shelf_memberships = extractShelfPips(
    raw.nclex_tutor_library_shelf_memberships,
  );
  const visibility_programme_ids = Array.isArray(
    raw.nclex_tutor_library_note_visibility,
  )
    ? raw.nclex_tutor_library_note_visibility.map((v) => v.programme_id)
    : [];

  // Strip the embeds before returning so the LibraryNote shape stays
  // clean — the derived fields live in the extension type.
  const {
    nclex_tutor_library_note_attachments: _attEmbed,
    nclex_tutor_library_shelf_memberships: _memEmbed,
    nclex_tutor_library_note_visibility: _visEmbed,
    ...rest
  } = raw;
  void _attEmbed;
  void _memEmbed;
  void _visEmbed;

  return {
    ...(rest as LibraryNote),
    used_in_count,
    shelf_memberships,
    visibility_programme_ids,
  } satisfies LibraryNoteForEdit;
}


/**
 * The signed-in tutor's own programmes, slimmed to `{ programme_id,
 * title }` for the Publish dialog's programme-scope picker (slice
 * 11.10). RLS on `nclex_programmes` scopes the read to the tutor's
 * own rows (SUPER_ADMIN bypass aside), so the list is exactly the
 * programmes a note may legally be scoped to — which the same-tutor
 * trigger on the junction also enforces at write time.
 *
 * Ordered by title for a stable checkbox list. Returns [] when the
 * tutor has no programmes yet (the dialog then disables the
 * Programme-scoped option).
 */
export async function getTutorProgrammesForPicker(): Promise<
  LibraryProgrammeOption[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title')
    .order('title', { ascending: true });

  if (error || !data) return [];
  return data as LibraryProgrammeOption[];
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


// =====================================================================
// Slice 11.4 — shelf detail (single-shelf scope)
// =====================================================================

/**
 * One shelf with its members in ordered detail. Returns `null` when
 * the shelf id doesn't match any of the tutor's shelves (RLS filters
 * cross-tutor reads, so non-existent + not-yours both surface as
 * `null` — caller renders the same "Shelf not found" empty state).
 *
 * Two queries (deliberate): the first reads the shelf + its
 * member-position pairs; the second pulls the canonical
 * `LibraryNoteLensRow` projection for those notes in a single
 * batched `IN (...)` call. We could collapse to one round trip via
 * a deeply nested PostgREST embed, but the self-referencing embed
 * (shelves → memberships → notes → memberships → shelves) needs an
 * alias hint to disambiguate, and the two-query form keeps the
 * lens-row projection shareable with `getNotesForTutor`. Two cheap
 * reads beats one twisty one.
 */
export async function getShelfDetail(
  shelfId: string,
): Promise<LibraryShelfDetail | null> {
  const supabase = await createClient();

  // Query 1 — shelf row + its membership-position pairs.
  const { data: shelfRow, error: shelfErr } = await supabase
    .from('nclex_tutor_library_shelves')
    .select(
      `shelf_id, tutor_id, title, tagline, description, color, position,
       created_at, updated_at,
       nclex_tutor_library_shelf_memberships ( position, note_id )`,
    )
    .eq('shelf_id', shelfId)
    .maybeSingle();

  if (shelfErr || !shelfRow) return null;

  type MembershipRow = { position: number; note_id: string };
  const memberships =
    (
      shelfRow as {
        nclex_tutor_library_shelf_memberships?: MembershipRow[];
      }
    ).nclex_tutor_library_shelf_memberships ?? [];

  // Order memberships up front so we can preserve curator order.
  const ordered = memberships
    .map((m) => ({ note_id: m.note_id, position: m.position }))
    .sort((a, b) => a.position - b.position);

  // Query 2 — lens-row projection for every member note. RLS gates
  // both queries to the tutor's own rows. Skipped when the shelf is
  // empty (no IN clause to fire).
  let notes: LibraryShelfDetailNote[] = [];
  if (ordered.length > 0) {
    const noteIds = ordered.map((m) => m.note_id);
    const { data: noteRows, error: notesErr } = await supabase
      .from('nclex_tutor_library_notes')
      .select(
        `note_id, folder_id, title, subtitle, description,
         tags, pillars, is_published, visibility_mode, updated_at,
         nclex_tutor_library_folders ( name ),
         nclex_tutor_library_shelf_memberships (
           nclex_tutor_library_shelves ( shelf_id, title, color )
         ),
         nclex_tutor_library_note_attachments ( count )`,
      )
      .in('note_id', noteIds);

    if (notesErr) return null;

    const byId = new Map<string, LibraryNoteLensRow>();
    for (const row of noteRows ?? []) {
      const r = row as {
        note_id: string;
        folder_id: string | null;
        title: string;
        subtitle: string | null;
        description: string | null;
        tags: string[];
        pillars: NclexPillar[];
        is_published: boolean;
        visibility_mode: LibraryNoteLensRow['visibility_mode'];
        updated_at: string;
        nclex_tutor_library_folders: FolderEmbed;
        nclex_tutor_library_shelf_memberships: ShelfPipEmbed;
        nclex_tutor_library_note_attachments: AttachmentCountEmbed;
      };
      byId.set(r.note_id, {
        note_id: r.note_id,
        folder_id: r.folder_id,
        folder_name: extractFolderName(r.nclex_tutor_library_folders),
        title: r.title,
        subtitle: r.subtitle,
        description: r.description,
        pillars: r.pillars,
        tags: r.tags,
        shelf_memberships: extractShelfPips(
          r.nclex_tutor_library_shelf_memberships,
        ),
        is_published: r.is_published,
        visibility_mode: r.visibility_mode,
        updated_at: r.updated_at,
        used_in_count: extractAttachmentCount(
          r.nclex_tutor_library_note_attachments,
        ),
      });
    }

    notes = ordered
      .map((m) => {
        const lens = byId.get(m.note_id);
        if (!lens) return null;
        return { ...lens, position: m.position } satisfies LibraryShelfDetailNote;
      })
      .filter((x): x is LibraryShelfDetailNote => x != null);
  }

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
  } = shelfRow;

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
    notes,
    note_count: notes.length,
  } satisfies LibraryShelfDetail;
}


// =====================================================================
// Slice 11.4 follow-on (P2) — Library Overview + system Views
// =====================================================================

/**
 * Every lens row the tutor owns, ordered by `updated_at` desc.
 * Used by the overview (counts + recent + pillar coverage) and the
 * three system views (All notes / Drafts / Used nowhere). Wrapped
 * in React's `cache()` so multiple consumers in the same RSC
 * render share a single round trip — `getLibraryLensCounts` and
 * `getNotesForView` both call this without paying the fetch cost
 * twice.
 */
const fetchAllLensRowsForTutor = cache(async (): Promise<LibraryNoteLensRow[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select(
      `note_id, folder_id, title, subtitle, description,
       tags, pillars, is_published, visibility_mode, updated_at,
       nclex_tutor_library_folders ( name ),
       nclex_tutor_library_shelf_memberships (
         nclex_tutor_library_shelves ( shelf_id, title, color )
       ),
       nclex_tutor_library_note_attachments ( count )`,
    )
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const r = row as {
      note_id: string;
      folder_id: string | null;
      title: string;
      subtitle: string | null;
      description: string | null;
      tags: string[];
      pillars: NclexPillar[];
      is_published: boolean;
      visibility_mode: LibraryNoteLensRow['visibility_mode'];
      updated_at: string;
      nclex_tutor_library_folders: FolderEmbed;
      nclex_tutor_library_shelf_memberships: ShelfPipEmbed;
      nclex_tutor_library_note_attachments: AttachmentCountEmbed;
    };
    return {
      note_id: r.note_id,
      folder_id: r.folder_id,
      folder_name: extractFolderName(r.nclex_tutor_library_folders),
      title: r.title,
      subtitle: r.subtitle,
      description: r.description,
      pillars: r.pillars,
      tags: r.tags,
      shelf_memberships: extractShelfPips(
        r.nclex_tutor_library_shelf_memberships,
      ),
      is_published: r.is_published,
      visibility_mode: r.visibility_mode,
      updated_at: r.updated_at,
      used_in_count: extractAttachmentCount(
        r.nclex_tutor_library_note_attachments,
      ),
    } satisfies LibraryNoteLensRow;
  });
});

function aggregatePillars(
  rows: LibraryNoteLensRow[],
): Record<NclexPillar, number> {
  const counts = Object.fromEntries(
    NCLEX_PILLARS.map((p) => [p, 0]),
  ) as Record<NclexPillar, number>;
  for (const r of rows) {
    for (const p of r.pillars) {
      counts[p] += 1;
    }
  }
  return counts;
}

/**
 * Distinct tags across the tutor's notes with per-tag note counts,
 * sorted by count desc then alphabetically. A note counts once per
 * tag it carries. Powers the sidebar Tags lens (11.16b).
 */
function aggregateTags(rows: LibraryNoteLensRow[]): LibraryTagCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const tag of r.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Counts powering the sidebar Views lens entries. Always called on
 * every render of `/tutor/library` so the lens lights up regardless
 * of which scope the tutor is in.
 */
export async function getLibraryLensCounts(): Promise<{
  view: LibraryViewCounts;
  pillars: Record<NclexPillar, number>;
  tags: LibraryTagCount[];
}> {
  const rows = await fetchAllLensRowsForTutor();
  return {
    view: {
      all: rows.length,
      drafts: rows.filter((r) => !r.is_published).length,
      used_nowhere: rows.filter((r) => r.used_in_count === 0).length,
    },
    pillars: aggregatePillars(rows),
    tags: aggregateTags(rows),
  };
}

/**
 * Data feeding the Overview dashboard at `/tutor/library` (no scope).
 * Five stat cards + a Recent activity list (last 5 by updated_at) +
 * an 8-row Pillar coverage breakdown.
 */
export async function getLibraryOverviewStats(): Promise<LibraryOverviewStats> {
  const supabase = await createClient();

  const [rows, foldersHead, shelvesHead] = await Promise.all([
    fetchAllLensRowsForTutor(),
    supabase
      .from('nclex_tutor_library_folders')
      .select('folder_id', { count: 'exact', head: true }),
    supabase
      .from('nclex_tutor_library_shelves')
      .select('shelf_id', { count: 'exact', head: true }),
  ]);

  return {
    total_notes: rows.length,
    folders: foldersHead.count ?? 0,
    shelves: shelvesHead.count ?? 0,
    drafts: rows.filter((r) => !r.is_published).length,
    used_nowhere: rows.filter((r) => r.used_in_count === 0).length,
    pillar_counts: aggregatePillars(rows),
    recent: rows.slice(0, 5),
  };
}

/**
 * Lens-row list for a system view. `Recent` is not represented here
 * — it stays disabled in the sidebar until visit-tracking ships.
 */
export async function getNotesForView(
  key: LibraryViewKey,
): Promise<LibraryNoteLensRow[]> {
  const rows = await fetchAllLensRowsForTutor();
  switch (key) {
    case 'all-notes':
      return rows;
    case 'drafts':
      return rows.filter((r) => !r.is_published);
    case 'used-nowhere':
      return rows.filter((r) => r.used_in_count === 0);
  }
}


/**
 * Lens-row list for a single tag — every note the tutor owns that
 * carries `tag`. Derived from the same cached row fetch as the
 * system views (11.16b). Sorted newest-edit-first (the fetch order).
 */
export async function getNotesForTag(
  tag: string,
): Promise<LibraryNoteLensRow[]> {
  const rows = await fetchAllLensRowsForTutor();
  return rows.filter((r) => r.tags.includes(tag));
}


/**
 * The full lens-row set for the tutor — feeds the custom-view builder
 * (slice 11.16c), which filters client-side over every dimension on the
 * projection (status / pillars / tags). Same cached fetch the views +
 * counts already use, so a builder render adds no extra round trip when
 * the sidebar counts are fetched in the same pass.
 */
export async function getAllLensRowsForTutor(): Promise<LibraryNoteLensRow[]> {
  return fetchAllLensRowsForTutor();
}


// =====================================================================
// Slice 11.16c-2 — saved custom views
// =====================================================================

type SavedViewRow = {
  view_id: string;
  name: string;
  filters_json: unknown;
  position: number;
};

/**
 * Every saved view the tutor owns, ordered by `position`, each with the
 * live count of notes its filter combo matches. The count is computed
 * in-app over the cached lens-row fetch (the same one the sidebar
 * counts + system views use), so the whole sidebar — system views,
 * pillar/tag counts, AND saved-view counts — costs a single notes read
 * per render. RLS scopes the view rows to the tutor.
 */
export async function getSavedViewsWithCounts(): Promise<
  LibrarySavedViewWithCount[]
> {
  const supabase = await createClient();
  const [rows, { data, error }] = await Promise.all([
    fetchAllLensRowsForTutor(),
    supabase
      .from('nclex_tutor_library_views')
      .select('view_id, name, filters_json, position')
      .order('position', { ascending: true }),
  ]);
  if (error || !data) return [];

  return (data as SavedViewRow[]).map((r) => {
    const filters = normalizeFilters(r.filters_json);
    return {
      view_id: r.view_id,
      name: r.name,
      filters,
      position: r.position,
      count: applyViewFilters(rows, filters).length,
    } satisfies LibrarySavedViewWithCount;
  });
}

/**
 * One saved view + the lens-row list its combo matches. Returns `null`
 * when the id doesn't match any of the tutor's views (RLS filters
 * cross-tutor reads, so non-existent + not-yours both surface as
 * `null` — caller renders a "View not found" pane). Mirrors
 * `getShelfDetail`'s shape: the row read, then the filtered note set.
 */
export async function getSavedView(
  viewId: string,
): Promise<{ view: LibrarySavedView; notes: LibraryNoteLensRow[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_tutor_library_views')
    .select('view_id, name, filters_json, position')
    .eq('view_id', viewId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as SavedViewRow;
  const filters = normalizeFilters(row.filters_json);
  const rows = await fetchAllLensRowsForTutor();
  return {
    view: {
      view_id: row.view_id,
      name: row.name,
      filters,
      position: row.position,
    },
    notes: applyViewFilters(rows, filters),
  };
}


// =====================================================================
// Slice 11.16a — content search
// =====================================================================

/**
 * Ranked full-text search over the tutor's own notes. Two round
 * trips, mirroring `getShelfDetail`:
 *   1. `nclex_search_library_notes` (SECURITY INVOKER, RLS-scoped)
 *      returns matching note_ids ordered by `ts_rank` desc.
 *   2. The canonical lens-row projection is batch-fetched for those
 *      ids and re-ordered to match the ranking.
 *
 * `fields` masks which note fields count toward a match (title /
 * subtitle / description / body) via the RPC's ts_rank weight array.
 * Returns [] for an empty query or when every field is deselected —
 * the UI guards against both, this is the belt-and-braces floor.
 */
export async function searchNotesForTutor(
  query: string,
  fields: LibrarySearchFieldFlags,
): Promise<LibraryNoteLensRow[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  if (
    !fields.title &&
    !fields.subtitle &&
    !fields.description &&
    !fields.body
  ) {
    return [];
  }

  const supabase = await createClient();

  // 1. Ranked note_ids from the FTS RPC.
  const { data: ranked, error: rpcErr } = await supabase.rpc(
    'nclex_search_library_notes',
    {
      p_query: trimmed,
      p_title: fields.title,
      p_subtitle: fields.subtitle,
      p_description: fields.description,
      p_body: fields.body,
    },
  );
  if (rpcErr || !ranked) return [];

  const orderedIds = (ranked as { note_id: string; rank: number }[]).map(
    (r) => r.note_id,
  );
  if (orderedIds.length === 0) return [];

  // 2. Lens-row projection for those notes, re-ordered by rank.
  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select(LENS_ROW_SELECT)
    .in('note_id', orderedIds);
  if (error || !data) return [];

  const byId = new Map<string, LibraryNoteLensRow>();
  for (const row of data) {
    const lens = mapLensRow(row);
    byId.set(lens.note_id, lens);
  }

  return orderedIds
    .map((id) => byId.get(id))
    .filter((x): x is LibraryNoteLensRow => x != null);
}
