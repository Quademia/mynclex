// mynclex/lib/curriculum/library-note-actions.ts
//
// Server actions for the Library-Note curriculum activity (slice 11.11a,
// "Option C"). A Library Note attached to a unit is a first-class
// activity row in nclex_programme_activities (type LIBRARY_NOTE) PLUS a
// linked nclex_tutor_library_note_attachments row (note_id + the
// delete-protection FK), joined by attachment.activity_id. The activity
// row owns ordering / publish / windows; the attachment owns the
// library-specific detail. Completion stays derived (no progress row).
//
// Detach is NOT here — it reuses deleteActivityAction (deleting the
// activity row cascades the attachment via ON DELETE CASCADE).
//
// RLS does the security: the tutor sees/writes only their own notes,
// activities (via unit→programme ownership) and attachments (via
// programme ownership). These actions add an auth guard + generic
// "not found / not yours" errors so a client can't probe ids.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  resolveCohortForAttach,
  insertCohortOnlyChecklistRow,
} from './cohort-attach';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function trimOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function refreshCurriculum(programmeId: string, unitId: string) {
  revalidatePath(`/tutor/programme/${programmeId}/curriculum`);
  revalidatePath(`/tutor/programme/${programmeId}/curriculum/unit/${unitId}`);
}

// ── A published note the tutor can attach (picker row) ────────────────
export type AttachableNote = {
  note_id: string;
  title: string;
  subtitle: string | null;
  folder_id: string | null;
  folder_name: string | null;
  pillars: string[];
};

type FolderEmbed = { name: string } | { name: string }[] | null | undefined;
function folderName(embed: FolderEmbed): string | null {
  const f = Array.isArray(embed) ? embed[0] : embed;
  return f?.name ?? null;
}

/**
 * The tutor's PUBLISHED library notes, for the attach picker. RLS scopes
 * to the caller's own notes; we also filter is_published (a draft can't
 * be attached — the visibility precondition). Newest first.
 */
export async function listAttachableNotesAction(): Promise<AttachableNote[]> {
  const { supabase, user } = await getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('nclex_tutor_library_notes')
    .select(
      `note_id, title, subtitle, folder_id, pillars,
       nclex_tutor_library_folders ( name )`,
    )
    .eq('tutor_id', user.id)
    .eq('is_published', true)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return (data as Array<{
    note_id: string;
    title: string;
    subtitle: string | null;
    folder_id: string | null;
    pillars: string[];
    nclex_tutor_library_folders: FolderEmbed;
  }>).map((r) => ({
    note_id: r.note_id,
    title: r.title,
    subtitle: r.subtitle,
    folder_id: r.folder_id,
    folder_name: folderName(r.nclex_tutor_library_folders),
    pillars: r.pillars ?? [],
  }));
}

export type AttachResult =
  | { ok: true; activity_id: string }
  | { ok: false; error: string };

/**
 * Attach a published note to a unit (loose) or a block. Creates the
 * activity row (draft) then the linked attachment row in sequence; if
 * the attachment insert fails, the activity is rolled back so we never
 * leave an orphan LIBRARY_NOTE activity with no note behind it.
 */
export async function attachLibraryNoteAction(
  unitId: string,
  blockId: string | null,
  noteId: string,
  caption: string,
  isPublished: boolean,
  // Cohort-only attach (Slice 3b). When set, the activity is tagged with
  // this cohort, a COHORT_ONLY checklist row is created, and a block (if
  // given) must be THIS cohort's own cohort-only block. null = template.
  cohortId: string | null = null,
): Promise<AttachResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // The note must be the tutor's own AND published. Both halves are
  // explicit: RLS does NOT scope this read to "own" — a tutor who is
  // also an enrolled student can read the notes of the tutor whose
  // programme they're on, and without the `tutor_id` filter could
  // attach one of those to their OWN unit. See lib/library/tutor-scope.ts.
  const { data: note } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, title, is_published')
    .eq('note_id', noteId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!note) return { ok: false, error: 'Note not found or not yours.' };
  if (!note.is_published) {
    return { ok: false, error: 'Only a published note can be attached.' };
  }

  // Resolve the unit's programme (RLS scopes to own) + index (for the
  // cohort release-date default); verify the block when attaching inside
  // one.
  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id, unit_index')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (!unitRow) return { ok: false, error: 'Unit not found or not yours.' };

  // Cohort-only: the cohort must belong to the unit's programme.
  const cohort = await resolveCohortForAttach(
    supabase,
    cohortId,
    (unitRow as { programme_id: string }).programme_id,
  );
  if (!cohort.ok) return cohort;

  if (blockId !== null) {
    const { data: blockRow } = await supabase
      .from('nclex_programme_blocks')
      .select('block_id, unit_id, cohort_id')
      .eq('block_id', blockId)
      .maybeSingle();
    if (!blockRow || blockRow.unit_id !== unitId) {
      return { ok: false, error: 'Block not found or not yours.' };
    }
    // A cohort-only attach into a block requires THIS cohort's own block.
    if (
      cohortId !== null &&
      (blockRow as { cohort_id: string | null }).cohort_id !== cohortId
    ) {
      return {
        ok: false,
        error: 'That block isn’t a cohort-only block in this cohort.',
      };
    }
  }

  const ordinal = await nextOrdinal(supabase, unitId, blockId);

  // 1. The activity row — draft by default; title mirrors the note's,
  //    caption rides the activity's `note` field (the "directive to the
  //    student" slot), payload empty (the pointer lives on the
  //    attachment). cohort_id NULL for template, set for cohort-only.
  const { data: act, error: actErr } = await supabase
    .from('nclex_programme_activities')
    .insert({
      unit_id: unitId,
      block_id: blockId,
      cohort_id: cohortId,
      ordinal,
      type: 'LIBRARY_NOTE',
      title: note.title,
      description: null,
      note: trimOrNull(caption),
      payload: {},
      is_published: isPublished,
    })
    .select('activity_id')
    .single();
  if (actErr || !act) {
    return { ok: false, error: actErr?.message ?? 'Failed to attach note.' };
  }

  // 2. The attachment row — links back via activity_id.
  const { error: attErr } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .insert({
      activity_id: act.activity_id,
      note_id: noteId,
      programme_id: unitRow.programme_id,
      unit_id: unitId,
      block_id: blockId,
      position: ordinal,
      caption: trimOrNull(caption),
    });
  if (attErr) {
    // Roll back the orphan activity so the two rows stay 1:1.
    await supabase
      .from('nclex_programme_activities')
      .delete()
      .eq('activity_id', act.activity_id);
    return { ok: false, error: 'Failed to attach note.' };
  }

  // 3. Cohort-only: the COHORT_ONLY checklist row carries delivery +
  //    dates. On failure roll back the activity (cascades the attachment)
  //    so the delivery path never sees a cohort-only activity with no row.
  if (cohortId !== null) {
    const item = await insertCohortOnlyChecklistRow(
      supabase,
      cohortId,
      act.activity_id,
      (unitRow as { unit_index: number }).unit_index,
      cohort.startDate,
    );
    if (!item.ok) {
      await supabase
        .from('nclex_programme_activities')
        .delete()
        .eq('activity_id', act.activity_id);
      return { ok: false, error: item.error };
    }
    revalidatePath(`/tutor/programme/${unitRow.programme_id}/cohorts`);
    return { ok: true, activity_id: act.activity_id };
  }

  refreshCurriculum(unitRow.programme_id, unitId);
  return { ok: true, activity_id: act.activity_id };
}

export type LibraryNoteActivityDetail = {
  activity_id: string;
  note_id: string;
  note_title: string;
  caption: string | null;
  is_published: boolean;
};

/**
 * Detail for the edit modal — the linked note + the activity's caption /
 * publish state. Joins the attachment (by activity_id) to the note.
 */
export async function getLibraryNoteActivityAction(
  activityId: string,
): Promise<
  | { ok: true; detail: LibraryNoteActivityDetail }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: act } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, note, is_published, type')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!act || act.type !== 'LIBRARY_NOTE') {
    return { ok: false, error: 'Activity not found or not yours.' };
  }

  const { data: att } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .select('note_id, nclex_tutor_library_notes ( title )')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!att) return { ok: false, error: 'Attachment not found.' };

  const noteEmbed = (att as { nclex_tutor_library_notes: { title: string } | { title: string }[] | null }).nclex_tutor_library_notes;
  const noteRow = Array.isArray(noteEmbed) ? noteEmbed[0] : noteEmbed;

  return {
    ok: true,
    detail: {
      activity_id: activityId,
      note_id: (att as { note_id: string }).note_id,
      note_title: noteRow?.title ?? 'Untitled note',
      caption: (act as { note: string | null }).note,
      is_published: (act as { is_published: boolean }).is_published,
    },
  };
}

export type UpdateResult = { ok: true } | { ok: false; error: string };

/**
 * Edit a Library-Note activity — caption + publish state only (you can't
 * re-point it at a different note; detach + re-attach for that).
 */
export async function updateLibraryNoteActivityAction(
  activityId: string,
  caption: string,
  isPublished: boolean,
): Promise<UpdateResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .update({
      note: trimOrNull(caption),
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    })
    .eq('activity_id', activityId)
    .eq('type', 'LIBRARY_NOTE')
    .select('unit_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Activity not found or not yours.' };

  // Keep the attachment caption in step (it mirrors the activity note).
  await supabase
    .from('nclex_tutor_library_note_attachments')
    .update({ caption: trimOrNull(caption) })
    .eq('activity_id', activityId);

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', (data as { unit_id: string }).unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshCurriculum(
      (unitRow as { programme_id: string }).programme_id,
      (data as { unit_id: string }).unit_id,
    );
  }
  return { ok: true };
}

// Next ordinal — block-scoped when inside a block, else across the whole
// unit body (blocks + loose activities share one ordinal space).
async function nextOrdinal(
  supabase: SupabaseClient,
  unitId: string,
  blockId: string | null,
): Promise<number> {
  if (blockId !== null) {
    const { data } = await supabase
      .from('nclex_programme_activities')
      .select('ordinal')
      .eq('block_id', blockId)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle();
    return ((data as { ordinal: number } | null)?.ordinal ?? 0) + 1;
  }
  const [b, a] = await Promise.all([
    supabase
      .from('nclex_programme_blocks')
      .select('ordinal')
      .eq('unit_id', unitId)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('nclex_programme_activities')
      .select('ordinal')
      .eq('unit_id', unitId)
      .is('block_id', null)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const blockMax = (b.data as { ordinal: number } | null)?.ordinal ?? 0;
  const looseMax = (a.data as { ordinal: number } | null)?.ordinal ?? 0;
  return Math.max(blockMax, looseMax) + 1;
}
