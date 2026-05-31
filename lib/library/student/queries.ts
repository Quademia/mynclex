// mynclex/lib/library/student/queries.ts
//
// Server-side reads for the STUDENT library surface (slice 11.14 —
// the "front door"). The mirror of the tutor's lib/library/queries.ts,
// but read-only and far simpler: there is no draft / used-nowhere /
// custom-view logic, and — crucially — we never re-implement the
// visibility filtering. Every read runs through the signed-in
// student's own Supabase client, so RLS does the work:
//
//   • nclex_tutor_library_notes_student_select → nclex_student_can_see_note()
//     returns only PUBLISHED notes the student is entitled to (TUTOR_WIDE
//     for any programme of that tutor they're enrolled in, or
//     PROGRAMME_SCOPED matching their enrolment).
//   • folders / shelves / shelf_memberships have parallel
//     *_student_select policies scoped to the enrolled tutor.
//
// The route is programme-scoped (/student/programme/[id]/library), and
// a student may be enrolled with several tutors, so every query is
// additionally narrowed to THE PROGRAMME'S tutor via `.eq('tutor_id', …)`.
// That isn't a security boundary (RLS already is) — it's what makes
// "this programme's library" mean one tutor's library.
//
// Lens counts + hide-empty are derived in the shell from the returned
// notes (matching the CD prototype), so this file is a pure fetch.

import { createClient } from '@/lib/supabase/server';
import type {
  LibraryNoteLensRow,
  NclexPillar,
  LibraryShelfPip,
} from '../types';

/** Folder row for the student sidebar (no counts — derived client-side). */
export type StudentLibraryFolder = {
  folder_id: string;
  name: string;
  description: string | null;
  position: number;
};

/** Shelf row for the student sidebar + carousel. */
export type StudentLibraryShelf = {
  shelf_id: string;
  title: string;
  description: string | null;
  color: string;
  position: number;
};

/**
 * Everything the student library page needs in one snapshot. The shell
 * derives folder / shelf / pillar / tag counts and applies the active
 * lens scope client-side over `notes`.
 */
export type StudentLibrarySnapshot = {
  tutorId: string;
  folders: StudentLibraryFolder[];
  shelves: StudentLibraryShelf[];
  notes: LibraryNoteLensRow[];
};

// --- PostgREST embed shapes (mirror the tutor query's helpers) -------

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

function extractShelfPips(
  embed: ShelfPipEmbed | null | undefined,
): LibraryShelfPip[] {
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

/**
 * Resolve the tutor that owns a programme. Readable by an enrolled
 * student via the programme metadata-tier RLS. Returns null for a
 * stale / non-enrolled programme id (the caller 404s).
 */
async function resolveProgrammeTutor(
  programmeId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('tutor_id')
    .eq('programme_id', programmeId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { tutor_id: string }).tutor_id;
}

/**
 * The student library snapshot for one programme. Returns null when the
 * programme can't be resolved (stale id / not enrolled) — the access
 * gate in the layout already covers the common case, but this keeps the
 * query honest if called directly.
 *
 * Three RLS-gated reads run in parallel after the tutor is resolved:
 *   • folders  — the tutor's folders (student-visible)
 *   • shelves  — the tutor's shelves (student-visible)
 *   • notes    — published + visible notes, lens-row projection
 */
export async function getStudentLibrarySnapshot(
  programmeId: string,
): Promise<StudentLibrarySnapshot | null> {
  const tutorId = await resolveProgrammeTutor(programmeId);
  if (!tutorId) return null;

  const supabase = await createClient();

  const noteSelect = `
    note_id, folder_id, title, subtitle, description,
    tags, pillars, is_published, visibility_mode, updated_at,
    nclex_tutor_library_folders ( name ),
    nclex_tutor_library_shelf_memberships (
      nclex_tutor_library_shelves ( shelf_id, title, color )
    )
  `;

  const [foldersRes, shelvesRes, notesRes] = await Promise.all([
    supabase
      .from('nclex_tutor_library_folders')
      .select('folder_id, name, description, position')
      .eq('tutor_id', tutorId)
      .order('position', { ascending: true }),
    supabase
      .from('nclex_tutor_library_shelves')
      .select('shelf_id, title, description, color, position')
      .eq('tutor_id', tutorId)
      .order('position', { ascending: true }),
    supabase
      .from('nclex_tutor_library_notes')
      .select(noteSelect)
      .eq('tutor_id', tutorId)
      .order('updated_at', { ascending: false }),
  ]);

  const folders: StudentLibraryFolder[] = (foldersRes.data ?? []).map(
    (r) => r as StudentLibraryFolder,
  );

  const shelves: StudentLibraryShelf[] = (shelvesRes.data ?? []).map(
    (r) => r as StudentLibraryShelf,
  );

  const notes: LibraryNoteLensRow[] = (notesRes.data ?? []).map((row) => {
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
      // Student rows don't surface the attachment count; 11.11 will add
      // the "Unit task" affordance off the attachment join when it lands.
      used_in_count: 0,
    } satisfies LibraryNoteLensRow;
  });

  return { tutorId, folders, shelves, notes };
}
