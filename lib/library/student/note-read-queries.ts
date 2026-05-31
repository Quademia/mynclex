// mynclex/lib/library/student/note-read-queries.ts
//
// Server read for the student note read-view (slice 11.13a). RLS does
// the gating: nclex_tutor_library_notes_student_select →
// nclex_student_can_see_note() returns the row only if the note is
// published AND the student is entitled (tutor-wide for an enrolled
// programme, or programme-scoped matching their enrolment). A note the
// student can't see → maybeSingle returns null → the route 404s.
//
// Per-student reading state (bookmark / done / resume position) lives
// in nclex_library_note_state, read here in the same call. No row yet =
// first visit (all-null defaults).

import { createClient } from '@/lib/supabase/server';
import { bodyToTiptap, type TiptapDoc } from '../body-tiptap';
import type { NclexPillar } from '../types';

export type StudentNoteReadState = {
  bookmarked: boolean;
  done: boolean;
  lastHeadingId: string | null;
};

export type StudentNoteFolder = { folder_id: string; name: string };
export type StudentNoteShelf = {
  shelf_id: string;
  title: string;
  color: string;
};

export type StudentNoteRead = {
  note_id: string;
  title: string;
  subtitle: string | null;
  pillars: NclexPillar[];
  tags: string[];
  updated_at: string;
  body: TiptapDoc;
  readingMinutes: number;
  /** The note's home folder (breadcrumb), or null for a root note. */
  folder: StudentNoteFolder | null;
  /** Every shelf the note is on (cross-cutting; rendered as chips). */
  shelves: StudentNoteShelf[];
  state: StudentNoteReadState;
};

// PostgREST embed shapes (mirror the list-side helpers).
type FolderEmbed = { name: string } | { name: string }[] | null | undefined;
type ShelfPipEmbed = {
  nclex_tutor_library_shelves:
    | { shelf_id: string; title: string; color: string }
    | { shelf_id: string; title: string; color: string }[]
    | null;
}[];

function extractFolderName(embed: FolderEmbed): string | null {
  const f = Array.isArray(embed) ? embed[0] : embed;
  return f?.name ?? null;
}

function extractShelves(
  embed: ShelfPipEmbed | null | undefined,
): StudentNoteShelf[] {
  if (!Array.isArray(embed)) return [];
  return embed
    .map((m) => {
      const s = m.nclex_tutor_library_shelves;
      const shelf = Array.isArray(s) ? s[0] : s;
      if (!shelf) return null;
      return { shelf_id: shelf.shelf_id, title: shelf.title, color: shelf.color };
    })
    .filter((x): x is StudentNoteShelf => x != null);
}

// Walk the Tiptap doc collecting plain text, for the ~200-wpm reading
// estimate. Text lives on `text` nodes; we ignore atoms (image / pdf /
// embeds) — they aren't "reading," and counting their attrs would
// inflate the estimate.
function countWords(doc: TiptapDoc): number {
  let words = 0;
  const walk = (node: { type?: string; text?: string; content?: unknown }) => {
    if (typeof node.text === 'string') {
      const t = node.text.trim();
      if (t) words += t.split(/\s+/).length;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child as { type?: string; text?: string; content?: unknown });
      }
    }
  };
  walk(doc);
  return words;
}

export async function getStudentNoteForRead(
  noteId: string,
): Promise<StudentNoteRead | null> {
  const supabase = await createClient();

  const { data: note, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select(
      `note_id, title, subtitle, pillars, tags, body, updated_at, folder_id,
       nclex_tutor_library_folders ( name ),
       nclex_tutor_library_shelf_memberships (
         nclex_tutor_library_shelves ( shelf_id, title, color )
       )`,
    )
    .eq('note_id', noteId)
    .maybeSingle();

  if (error || !note) return null;

  const row = note as {
    note_id: string;
    title: string;
    subtitle: string | null;
    pillars: NclexPillar[];
    tags: string[];
    body: unknown;
    updated_at: string;
    folder_id: string | null;
    nclex_tutor_library_folders: FolderEmbed;
    nclex_tutor_library_shelf_memberships: ShelfPipEmbed;
  };

  const folderName = extractFolderName(row.nclex_tutor_library_folders);
  const folder =
    row.folder_id && folderName
      ? { folder_id: row.folder_id, name: folderName }
      : null;
  const shelves = extractShelves(row.nclex_tutor_library_shelf_memberships);

  const body = bodyToTiptap(row.body);
  const words = countWords(body);
  const readingMinutes = Math.max(1, Math.round(words / 200));

  // Per-student state. RLS scopes to the caller's own row; no row yet =
  // first visit. Failures here are non-fatal — the note still reads.
  const { data: stateRow } = await supabase
    .from('nclex_library_note_state')
    .select('bookmarked_at, marked_done_at, last_heading_id')
    .eq('note_id', noteId)
    .maybeSingle();

  const s = stateRow as {
    bookmarked_at: string | null;
    marked_done_at: string | null;
    last_heading_id: string | null;
  } | null;

  return {
    note_id: row.note_id,
    title: row.title,
    subtitle: row.subtitle,
    pillars: row.pillars,
    tags: row.tags,
    updated_at: row.updated_at,
    body,
    readingMinutes,
    folder,
    shelves,
    state: {
      bookmarked: s?.bookmarked_at != null,
      done: s?.marked_done_at != null,
      lastHeadingId: s?.last_heading_id ?? null,
    },
  };
}
