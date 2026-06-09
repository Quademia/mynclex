// mynclex/lib/library/programme/queries.ts
//
// Server-side read for the TUTOR's PROGRAMME-LEVEL library preview —
// "what notes can students enrolled in THIS programme see?". The tutor-
// side mirror of lib/library/student/queries.ts: same lens-row shape,
// same folders/shelves snapshot, but computed from the tutor's OWN
// library rather than filtered by a student's RLS.
//
// The entitlement rule mirrors nclex_student_can_see_note(), keyed on
// the programme instead of a student's enrolments. A note is in the
// programme's library when it is:
//
//   • PUBLISHED, and
//   • either TUTOR_WIDE (reaches every student of this tutor), or
//     PROGRAMME_SCOPED with a visibility-junction row for THIS programme.
//
// Unlike the student query (which leans on RLS to do the filtering),
// the tutor owns every note, so the filter is explicit here. We scope
// folders / shelves / notes by the PROGRAMME'S tutor_id — not by
// auth.uid() — so a SUPER_ADMIN previewing another tutor's programme
// sees that tutor's library, not their own (the admin_all RLS bypass
// would otherwise return every tutor's rows).

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  LibraryNoteLensRow,
  NclexPillar,
  LibraryShelfPip,
} from '../types';

/** Folder row for the preview sidebar (counts derived client-side). */
export type ProgrammeLibraryFolder = {
  folder_id: string;
  name: string;
  description: string | null;
  position: number;
};

/** Shelf row for the preview sidebar + carousel. */
export type ProgrammeLibraryShelf = {
  shelf_id: string;
  title: string;
  description: string | null;
  color: string;
  position: number;
};

/**
 * Everything the programme-library preview needs in one snapshot. The
 * shell derives folder / shelf / pillar / tag counts and applies the
 * active lens scope client-side over `notes`.
 */
export type ProgrammeLibrarySnapshot = {
  tutorId: string;
  folders: ProgrammeLibraryFolder[];
  shelves: ProgrammeLibraryShelf[];
  notes: LibraryNoteLensRow[];
};

// --- PostgREST embed shapes (mirror the student query's helpers) -----

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
 * Resolve the tutor that owns a programme. RLS-readable by the owning
 * tutor (and by a SUPER_ADMIN via the admin_all bypass). Returns null
 * for a stale id or a programme the caller can't see — the page 404s.
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
 * Build the programme-library preview snapshot. Three reads run in
 * parallel — the tutor's folders, shelves, and PUBLISHED notes — plus a
 * fetch of the note ids scoped to THIS programme via the visibility
 * junction. The notes are then filtered to the programme's entitlement
 * set (TUTOR_WIDE ∪ PROGRAMME_SCOPED-to-this-programme).
 */
export async function getProgrammeLibrarySnapshot(
  programmeId: string,
): Promise<ProgrammeLibrarySnapshot | null> {
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

  const [foldersRes, shelvesRes, notesRes, scopedRes] = await Promise.all([
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
      .eq('is_published', true)
      .order('updated_at', { ascending: false }),
    // The note ids that name THIS programme in their visibility set.
    supabase
      .from('nclex_tutor_library_note_visibility')
      .select('note_id')
      .eq('programme_id', programmeId),
  ]);

  const folders: ProgrammeLibraryFolder[] = (foldersRes.data ?? []).map(
    (r) => r as ProgrammeLibraryFolder,
  );
  const shelves: ProgrammeLibraryShelf[] = (shelvesRes.data ?? []).map(
    (r) => r as ProgrammeLibraryShelf,
  );

  // The set of PROGRAMME_SCOPED notes visible to this programme.
  const scopedToProgramme = new Set(
    (scopedRes.data ?? []).map((r) => (r as { note_id: string }).note_id),
  );

  const notes: LibraryNoteLensRow[] = (notesRes.data ?? [])
    .map((row) => {
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
        // The preview doesn't surface the curriculum-attachment count;
        // 11.11's "By unit" view will feed it when that lens lands.
        used_in_count: 0,
      } satisfies LibraryNoteLensRow;
    })
    // Entitlement filter: TUTOR_WIDE reaches everyone; PROGRAMME_SCOPED
    // only when this programme is in the note's visibility set.
    .filter(
      (n) =>
        n.visibility_mode === 'TUTOR_WIDE' ||
        scopedToProgramme.has(n.note_id),
    );

  return { tutorId, folders, shelves, notes };
}

/**
 * Count of distinct ENROLLED students in a programme — for the preview
 * banner + hero copy ("what the N students see"). Read with the
 * service-role client: enrolment rows aren't tutor-readable under RLS.
 * Safe because the caller has already proven ownership via
 * getProgrammeForShell (RLS-gated) before reaching this page — same
 * pattern as getMyProgrammesForList's student rollup.
 */
export async function getProgrammeStudentCount(
  programmeId: string,
): Promise<number> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('nclex_enrolments')
    .select('user_id')
    .eq('programme_id', programmeId)
    .eq('status', 'ENROLLED');
  if (error || !data) return 0;
  return new Set(data.map((r) => (r as { user_id: string }).user_id)).size;
}
