// mynclex/lib/curriculum/shelf-activity-actions.ts
//
// Server actions for the Shelf curriculum activity (slice 11.12,
// "Option C" — same model as the Library Note in slice 11.11a). A shelf
// attached to a unit is a first-class activity row in
// nclex_programme_activities (type SHELF) PLUS a linked
// nclex_tutor_library_note_attachments row (shelf_id set, note_id NULL,
// the per-placement skipped_note_ids list), joined by attachment.activity_id.
// The activity row owns ordering / publish / windows; the attachment owns
// the library-specific detail. A shelf is ATOMIC (one activity, one
// attachment); membership is read LIVE. Completion stays derived (slice
// 11.12b) — no progress row.
//
// Detach is NOT here — it reuses deleteActivityAction (deleting the
// activity row cascades the attachment via ON DELETE CASCADE).
//
// RLS does the security: the tutor sees/writes only their own shelves,
// notes, activities (via unit→programme ownership) and attachments (via
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

// ── A shelf the tutor can attach (picker row) ─────────────────────────
export type AttachableShelf = {
  shelf_id: string;
  title: string;
  description: string | null;
  color: string;
  note_count: number;
};

/**
 * The tutor's shelves, for the attach picker. RLS scopes to the caller's
 * own shelves. Each row carries a live member-note count so the tutor can
 * tell a populated shelf from an empty one. Newest-edited first.
 */
export async function listAttachableShelvesAction(): Promise<AttachableShelf[]> {
  const { supabase, user } = await getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('nclex_tutor_library_shelves')
    .select(
      `shelf_id, title, description, color,
       nclex_tutor_library_shelf_memberships ( note_id )`,
    )
    .eq('tutor_id', user.id)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return (data as Array<{
    shelf_id: string;
    title: string;
    description: string | null;
    color: string;
    nclex_tutor_library_shelf_memberships: { note_id: string }[] | null;
  }>).map((r) => ({
    shelf_id: r.shelf_id,
    title: r.title,
    description: r.description,
    color: r.color,
    note_count: r.nclex_tutor_library_shelf_memberships?.length ?? 0,
  }));
}

// ── A member note as the tutor sees it inside a shelf placement ────────
//
// Two orthogonal "won't show to students" reasons, surfaced separately so
// the modal never confuses them (slice 11.12 "Option A"):
//   • skipped              — the tutor hid it in THIS unit (reversible
//                            here via Unhide; lives in skipped_note_ids).
//   • visible_to_programme — false when the note's own visibility excludes
//                            this programme (fixed by "Make visible here",
//                            which widens the NOTE's visibility, not a skip).
export type ShelfMemberNote = {
  note_id: string;
  title: string;
  subtitle: string | null;
  is_published: boolean;
  visibility_mode: 'TUTOR_WIDE' | 'PROGRAMME_SCOPED';
  visible_to_programme: boolean;
  skipped: boolean;
};

type NoteEmbed = {
  note_id: string;
  title: string;
  subtitle: string | null;
  is_published: boolean;
  visibility_mode: 'TUTOR_WIDE' | 'PROGRAMME_SCOPED';
};

/**
 * Resolve a shelf's LIVE member notes for one programme placement —
 * ordered by shelf position, each annotated with its publish state, its
 * visibility relative to `programmeId`, and whether it's skipped in this
 * placement. Two RLS-scoped reads (memberships→notes, then the visibility
 * junction for the scoped notes only).
 */
async function loadShelfMembers(
  supabase: SupabaseClient,
  shelfId: string,
  programmeId: string,
  skippedNoteIds: string[],
): Promise<ShelfMemberNote[]> {
  const { data, error } = await supabase
    .from('nclex_tutor_library_shelf_memberships')
    .select(
      `position, note_id,
       nclex_tutor_library_notes (
         note_id, title, subtitle, is_published, visibility_mode
       )`,
    )
    .eq('shelf_id', shelfId)
    .order('position', { ascending: true });

  if (error || !data) return [];

  const rows = (data as Array<{
    position: number;
    note_id: string;
    nclex_tutor_library_notes: NoteEmbed | NoteEmbed[] | null;
  }>)
    .map((r) => {
      const embed = r.nclex_tutor_library_notes;
      const note = Array.isArray(embed) ? embed[0] : embed;
      return note ? { position: r.position, note } : null;
    })
    .filter((x): x is { position: number; note: NoteEmbed } => x != null);

  // Which PROGRAMME_SCOPED member notes are visible to this programme.
  const scopedIds = rows
    .filter((r) => r.note.visibility_mode === 'PROGRAMME_SCOPED')
    .map((r) => r.note.note_id);
  const visibleScoped = new Set<string>();
  if (scopedIds.length > 0) {
    const { data: vis } = await supabase
      .from('nclex_tutor_library_note_visibility')
      .select('note_id')
      .eq('programme_id', programmeId)
      .in('note_id', scopedIds);
    for (const v of (vis ?? []) as Array<{ note_id: string }>) {
      visibleScoped.add(v.note_id);
    }
  }

  const skipped = new Set(skippedNoteIds);

  return rows.map((r) => ({
    note_id: r.note.note_id,
    title: r.note.title,
    subtitle: r.note.subtitle,
    is_published: r.note.is_published,
    visibility_mode: r.note.visibility_mode,
    visible_to_programme:
      r.note.visibility_mode === 'TUTOR_WIDE' ||
      visibleScoped.has(r.note.note_id),
    skipped: skipped.has(r.note.note_id),
  }));
}

export type ShelfPreview = {
  shelf_id: string;
  title: string;
  color: string;
  notes: ShelfMemberNote[];
};

/**
 * Preview a shelf's members for a target unit BEFORE attaching — drives
 * the create-modal member list + the "N of M notes won't be visible
 * here" warning. Resolves the unit's programme (RLS scopes to own), then
 * the shelf's live members against it. No skips yet (nothing attached).
 */
export async function previewShelfForUnitAction(
  unitId: string,
  shelfId: string,
): Promise<{ ok: true; preview: ShelfPreview } | { ok: false; error: string }> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: shelf } = await supabase
    .from('nclex_tutor_library_shelves')
    .select('shelf_id, title, color')
    .eq('shelf_id', shelfId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!shelf) return { ok: false, error: 'Shelf not found or not yours.' };

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (!unitRow) return { ok: false, error: 'Unit not found or not yours.' };

  const notes = await loadShelfMembers(
    supabase,
    shelfId,
    (unitRow as { programme_id: string }).programme_id,
    [],
  );

  return {
    ok: true,
    preview: {
      shelf_id: (shelf as { shelf_id: string }).shelf_id,
      title: (shelf as { title: string }).title,
      color: (shelf as { color: string }).color,
      notes,
    },
  };
}

export type AttachResult =
  | { ok: true; activity_id: string }
  | { ok: false; error: string };

/**
 * Attach a shelf to a unit (loose) or a block. Creates the activity row
 * (draft by default) then the linked attachment row (shelf_id set,
 * note_id NULL, empty skip-list); if the attachment insert fails, the
 * activity is rolled back so we never leave an orphan SHELF activity.
 */
export async function attachShelfAction(
  unitId: string,
  blockId: string | null,
  shelfId: string,
  caption: string,
  isPublished: boolean,
  // Cohort-only attach (Slice 3b). When set, the activity is tagged with
  // this cohort, a COHORT_ONLY checklist row is created, and a block (if
  // given) must be THIS cohort's own cohort-only block. null = template.
  cohortId: string | null = null,
): Promise<AttachResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: shelf } = await supabase
    .from('nclex_tutor_library_shelves')
    .select('shelf_id, title')
    .eq('shelf_id', shelfId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!shelf) return { ok: false, error: 'Shelf not found or not yours.' };

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

  // 1. The activity row — draft by default; title mirrors the shelf's,
  //    caption rides the activity's `note` field, payload empty (the
  //    pointer lives on the attachment). cohort_id NULL for template, set
  //    for cohort-only.
  const { data: act, error: actErr } = await supabase
    .from('nclex_programme_activities')
    .insert({
      unit_id: unitId,
      block_id: blockId,
      cohort_id: cohortId,
      ordinal,
      type: 'SHELF',
      title: (shelf as { title: string }).title,
      description: null,
      note: trimOrNull(caption),
      payload: {},
      is_published: isPublished,
    })
    .select('activity_id')
    .single();
  if (actErr || !act) {
    return { ok: false, error: actErr?.message ?? 'Failed to attach shelf.' };
  }

  // 2. The attachment row — shelf_id set, note_id NULL (the kind XOR
  //    check enforces exactly one), empty skip-list.
  const { error: attErr } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .insert({
      activity_id: act.activity_id,
      shelf_id: shelfId,
      note_id: null,
      programme_id: (unitRow as { programme_id: string }).programme_id,
      unit_id: unitId,
      block_id: blockId,
      position: ordinal,
      caption: trimOrNull(caption),
    });
  if (attErr) {
    await supabase
      .from('nclex_programme_activities')
      .delete()
      .eq('activity_id', act.activity_id);
    return { ok: false, error: 'Failed to attach shelf.' };
  }

  // 3. Cohort-only: the COHORT_ONLY checklist row carries delivery +
  //    dates. On failure roll back the activity (cascades the attachment).
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
    revalidatePath(
      `/tutor/programme/${(unitRow as { programme_id: string }).programme_id}/cohorts`,
    );
    return { ok: true, activity_id: act.activity_id };
  }

  refreshCurriculum((unitRow as { programme_id: string }).programme_id, unitId);
  return { ok: true, activity_id: act.activity_id };
}

export type ShelfActivityDetail = {
  activity_id: string;
  shelf_id: string;
  shelf_title: string;
  shelf_color: string;
  caption: string | null;
  is_published: boolean;
  notes: ShelfMemberNote[];
};

/**
 * Detail for the edit modal — the linked shelf + the activity's caption /
 * publish state + the live member notes (each with skip + visibility
 * state). Joins the attachment (by activity_id) to the shelf, then loads
 * members against the attachment's programme.
 */
export async function getShelfActivityAction(
  activityId: string,
): Promise<
  | { ok: true; detail: ShelfActivityDetail }
  | { ok: false; error: string }
> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: act } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, note, is_published, type')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!act || act.type !== 'SHELF') {
    return { ok: false, error: 'Activity not found or not yours.' };
  }

  const { data: att } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .select(
      `shelf_id, programme_id, skipped_note_ids,
       nclex_tutor_library_shelves ( title, color )`,
    )
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!att || (att as { shelf_id: string | null }).shelf_id == null) {
    return { ok: false, error: 'Shelf attachment not found.' };
  }

  const shelfEmbed = (att as {
    nclex_tutor_library_shelves:
      | { title: string; color: string }
      | { title: string; color: string }[]
      | null;
  }).nclex_tutor_library_shelves;
  const shelf = Array.isArray(shelfEmbed) ? shelfEmbed[0] : shelfEmbed;

  const skipped = normalizeSkipped(
    (att as { skipped_note_ids: unknown }).skipped_note_ids,
  );

  const notes = await loadShelfMembers(
    supabase,
    (att as { shelf_id: string }).shelf_id,
    (att as { programme_id: string }).programme_id,
    skipped,
  );

  return {
    ok: true,
    detail: {
      activity_id: activityId,
      shelf_id: (att as { shelf_id: string }).shelf_id,
      shelf_title: shelf?.title ?? 'Untitled shelf',
      shelf_color: shelf?.color ?? '#64748b',
      caption: (act as { note: string | null }).note,
      is_published: (act as { is_published: boolean }).is_published,
      notes,
    },
  };
}

export type UpdateResult = { ok: true } | { ok: false; error: string };

/**
 * Edit a Shelf activity — caption + publish state only (you can't
 * re-point it at a different shelf; detach + re-attach for that).
 */
export async function updateShelfActivityAction(
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
    .eq('type', 'SHELF')
    .select('unit_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Activity not found or not yours.' };

  await supabase
    .from('nclex_tutor_library_note_attachments')
    .update({ caption: trimOrNull(caption) })
    .eq('activity_id', activityId);

  await refreshFromUnit(supabase, (data as { unit_id: string }).unit_id);
  return { ok: true };
}

/**
 * Hide / unhide a member note in THIS shelf placement — appends to (or
 * removes from) the attachment's skipped_note_ids. Local to this unit;
 * never touches shelf membership. Reversible.
 */
export async function setShelfNoteHiddenAction(
  activityId: string,
  noteId: string,
  hidden: boolean,
): Promise<UpdateResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: att } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .select('attachment_id, unit_id, skipped_note_ids')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!att) return { ok: false, error: 'Shelf attachment not found.' };

  const current = normalizeSkipped(
    (att as { skipped_note_ids: unknown }).skipped_note_ids,
  );
  const set = new Set(current);
  if (hidden) set.add(noteId);
  else set.delete(noteId);
  const next = [...set];

  const { error } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .update({ skipped_note_ids: next })
    .eq('attachment_id', (att as { attachment_id: string }).attachment_id);
  if (error) return { ok: false, error: error.message };

  await refreshFromUnit(supabase, (att as { unit_id: string }).unit_id);
  return { ok: true };
}

/**
 * "Make visible here" — widen a member note's visibility to include this
 * placement's programme. Identical to editing the note by hand to add the
 * programme: adds a row to nclex_tutor_library_note_visibility (the
 * same-tutor trigger validates ownership). Only ever ADDS — never narrows.
 * No-op (still ok) for a TUTOR_WIDE note, which is already visible.
 */
export async function makeNoteVisibleHereAction(
  activityId: string,
  noteId: string,
): Promise<UpdateResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Resolve this placement's programme from the attachment.
  const { data: att } = await supabase
    .from('nclex_tutor_library_note_attachments')
    .select('programme_id, unit_id')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!att) return { ok: false, error: 'Shelf attachment not found.' };
  const programmeId = (att as { programme_id: string }).programme_id;

  // The note must be the tutor's own (RLS scopes); a TUTOR_WIDE note
  // needs no row.
  const { data: note } = await supabase
    .from('nclex_tutor_library_notes')
    .select('note_id, visibility_mode')
    .eq('note_id', noteId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!note) return { ok: false, error: 'Note not found or not yours.' };
  if ((note as { visibility_mode: string }).visibility_mode === 'TUTOR_WIDE') {
    return { ok: true };
  }

  // Idempotent insert — skip if the row already exists.
  const { data: existing } = await supabase
    .from('nclex_tutor_library_note_visibility')
    .select('note_id')
    .eq('note_id', noteId)
    .eq('programme_id', programmeId)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase
      .from('nclex_tutor_library_note_visibility')
      .insert({ note_id: noteId, programme_id: programmeId });
    if (error) return { ok: false, error: error.message };
  }

  await refreshFromUnit(supabase, (att as { unit_id: string }).unit_id);
  return { ok: true };
}

// ── helpers ───────────────────────────────────────────────────────────

// skipped_note_ids is JSONB ('[]' default). Normalise whatever comes back
// (already-parsed array, or a JSON string) to a string[] of note ids.
function normalizeSkipped(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string');
}

async function refreshFromUnit(supabase: SupabaseClient, unitId: string) {
  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (unitRow) {
    refreshCurriculum((unitRow as { programme_id: string }).programme_id, unitId);
  }
}

// Next ordinal — block-scoped when inside a block, else across the whole
// unit body (blocks + loose activities share one ordinal space). Mirrors
// library-note-actions.ts.
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
