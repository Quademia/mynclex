// mynclex/lib/library/programme/note-read-queries.ts
//
// Server read for the TUTOR programme-library note preview — the read
// view a student opens, shown to the tutor. The tutor owns the note
// (RLS self-select returns it, draft or published), so unlike the
// student read query there's no enrolment gate. Instead we enforce the
// PROGRAMME entitlement explicitly: the note must be PUBLISHED and
// either TUTOR_WIDE or PROGRAMME_SCOPED with a visibility row for THIS
// programme — i.e. actually in this programme's library. A note that
// fails the gate returns null → the route 404s.
//
// No per-student reading state is read (a tutor preview has none). The
// reading-minutes estimate mirrors the student query.

import { createClient } from '@/lib/supabase/server';
import { bodyToTiptap, type TiptapDoc } from '../body-tiptap';
import type { NclexPillar, LibraryVisibilityMode } from '../types';

export type ProgrammeNoteFolder = { folder_id: string; name: string };
export type ProgrammeNoteShelf = {
  shelf_id: string;
  title: string;
  color: string;
};

export type ProgrammeNoteRead = {
  note_id: string;
  title: string;
  subtitle: string | null;
  pillars: NclexPillar[];
  tags: string[];
  updated_at: string;
  body: TiptapDoc;
  readingMinutes: number;
  visibility_mode: LibraryVisibilityMode;
  folder: ProgrammeNoteFolder | null;
  shelves: ProgrammeNoteShelf[];
};

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
): ProgrammeNoteShelf[] {
  if (!Array.isArray(embed)) return [];
  return embed
    .map((m) => {
      const s = m.nclex_tutor_library_shelves;
      const shelf = Array.isArray(s) ? s[0] : s;
      if (!shelf) return null;
      return { shelf_id: shelf.shelf_id, title: shelf.title, color: shelf.color };
    })
    .filter((x): x is ProgrammeNoteShelf => x != null);
}

// Count words across the doc for the ~200-wpm estimate (atoms ignored).
function countWords(doc: TiptapDoc): number {
  let words = 0;
  const walk = (node: { text?: string; content?: unknown }) => {
    if (typeof node.text === 'string') {
      const t = node.text.trim();
      if (t) words += t.split(/\s+/).length;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child as { text?: string; content?: unknown });
      }
    }
  };
  walk(doc);
  return words;
}

export async function getProgrammeNoteForRead(
  programmeId: string,
  noteId: string,
): Promise<ProgrammeNoteRead | null> {
  const supabase = await createClient();

  const { data: note, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select(
      `note_id, title, subtitle, pillars, tags, body, updated_at, folder_id,
       is_published, visibility_mode,
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
    is_published: boolean;
    visibility_mode: LibraryVisibilityMode;
    nclex_tutor_library_folders: FolderEmbed;
    nclex_tutor_library_shelf_memberships: ShelfPipEmbed;
  };

  // Programme entitlement gate — the note must be in THIS programme's
  // library, mirroring the list-side filter in queries.ts.
  if (!row.is_published) return null;
  if (row.visibility_mode !== 'TUTOR_WIDE') {
    const { data: vis } = await supabase
      .from('nclex_tutor_library_note_visibility')
      .select('note_id')
      .eq('note_id', noteId)
      .eq('programme_id', programmeId)
      .maybeSingle();
    if (!vis) return null;
  }

  const folderName = extractFolderName(row.nclex_tutor_library_folders);
  const folder =
    row.folder_id && folderName
      ? { folder_id: row.folder_id, name: folderName }
      : null;
  const shelves = extractShelves(row.nclex_tutor_library_shelf_memberships);

  const body = bodyToTiptap(row.body);
  const words = countWords(body);
  const readingMinutes = Math.max(1, Math.round(words / 200));

  return {
    note_id: row.note_id,
    title: row.title,
    subtitle: row.subtitle,
    pillars: row.pillars,
    tags: row.tags,
    updated_at: row.updated_at,
    body,
    readingMinutes,
    visibility_mode: row.visibility_mode,
    folder,
    shelves,
  };
}
