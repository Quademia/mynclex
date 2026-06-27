// mynclex/lib/library/student/note-read-actions.ts
//
// Student-side writes for per-note reading state (slice 11.13a),
// persisted in nclex_library_note_state (PK student_id+note_id). RLS
// restricts every row to the caller (student_id = auth.uid()); we set
// student_id explicitly so the INSERT WITH CHECK passes.
//
// Three actions:
//   • toggleNoteBookmarkAction — flips bookmarked_at (set NOW / clear)
//   • toggleNoteDoneAction      — flips marked_done_at (set NOW / clear)
//   • updateReadingPositionAction — records the deepest heading scrolled
//     past (resume + "section N of M"); fire-and-forget, debounced caller
//
// Progress-engine write-through (2026-06-27). Marking a note done now
// ALSO mirrors a MANUAL row in nclex_student_activity_progress for every
// curriculum activity that points at the note (and clears them on
// un-mark). Why: a LIBRARY_NOTE activity's completion is read two ways —
//   • the student curriculum % + the tutor cohort-analytics DERIVE it from
//     the note's marked_done_at (unchanged here), but
//   • the Student Overview study streak + "recent activity" feed read the
//     progress table DIRECTLY (no per-type derivation), so reading-only
//     days never counted toward the streak.
// Mirroring the row closes that gap with no change to those consumers.
// The note's own marked_done_at stays the student-facing source of truth;
// the mirror is best-effort (a failure never fails the toggle). Resolved
// from the note id alone (no activity context needed), so it works from
// any entry point — the curriculum, the library, or My practice.

'use server';

import { createClient } from '@/lib/supabase/server';

type ToggleResult =
  | { ok: true; active: boolean }
  | { ok: false; error: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

// Shared flip: read the current timestamp column, set it to NOW when
// null / clear it when set. Upserts so the first interaction creates the
// row. RLS still gates the write to the caller's own row.
async function toggleTimestamp(
  noteId: string,
  column: 'bookmarked_at' | 'marked_done_at',
): Promise<ToggleResult> {
  const uid = await currentUserId();
  if (!uid) return { ok: false, error: 'You must be signed in.' };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('nclex_library_note_state')
    .select(column)
    .eq('note_id', noteId)
    .maybeSingle();

  const current = (existing as Record<string, string | null> | null)?.[column];
  const nextActive = current == null;
  const nextValue = nextActive ? new Date().toISOString() : null;

  const { error } = await supabase.from('nclex_library_note_state').upsert(
    {
      student_id: uid,
      note_id: noteId,
      [column]: nextValue,
      last_visited_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,note_id' },
  );

  if (error) return { ok: false, error: 'Could not save. Try again.' };
  return { ok: true, active: nextActive };
}

export async function toggleNoteBookmarkAction(
  noteId: string,
): Promise<ToggleResult> {
  return toggleTimestamp(noteId, 'bookmarked_at');
}

export async function toggleNoteDoneAction(
  noteId: string,
): Promise<ToggleResult> {
  const result = await toggleTimestamp(noteId, 'marked_done_at');
  if (!result.ok) return result;

  // Mirror the curriculum progress row(s) so the Overview streak + recent
  // feed credit reading. Best-effort: the note's own done-state (above) is
  // the student-facing truth and already saved.
  const uid = await currentUserId();
  if (uid) {
    const supabase = await createClient();
    await syncNoteActivityProgress(supabase, uid, noteId, result.active);
  }
  return result;
}

// Mirror a note's done-state into the progress engine for every curriculum
// activity pointing at it. `active` = the note's new done-state (true =
// just marked done → upsert MANUAL rows; false = un-marked → delete them).
// Reads are RLS-scoped to the caller; only PUBLISHED-programme, visible
// LIBRARY_NOTE activities get a row. Swallows its own errors — a mirror
// failure must never fail the user-facing toggle.
async function syncNoteActivityProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string,
  noteId: string,
  active: boolean,
): Promise<void> {
  try {
    // Activities that attach this note. RLS on the attachments + activities
    // reads scopes to the student's visible (PUBLISHED-programme) rows.
    const { data: atts } = await supabase
      .from('nclex_tutor_library_note_attachments')
      .select('activity_id')
      .eq('note_id', noteId);
    const ids = [
      ...new Set(
        ((atts ?? []) as Array<{ activity_id: string | null }>)
          .map((r) => r.activity_id)
          .filter((x): x is string => x != null),
      ),
    ];
    if (ids.length === 0) return;

    const { data: acts } = await supabase
      .from('nclex_programme_activities')
      .select('activity_id')
      .in('activity_id', ids)
      .eq('type', 'LIBRARY_NOTE');
    const visibleIds = ((acts ?? []) as Array<{ activity_id: string }>).map(
      (a) => a.activity_id,
    );
    if (visibleIds.length === 0) return;

    if (active) {
      await supabase.from('nclex_student_activity_progress').upsert(
        visibleIds.map((activity_id) => ({
          student_id: uid,
          activity_id,
          completion_source: 'MANUAL',
        })),
        { onConflict: 'student_id,activity_id', ignoreDuplicates: true },
      );
    } else {
      await supabase
        .from('nclex_student_activity_progress')
        .delete()
        .eq('student_id', uid)
        .eq('completion_source', 'MANUAL')
        .in('activity_id', visibleIds);
    }
  } catch (err) {
    console.error('syncNoteActivityProgress failed', err);
  }
}

export async function updateReadingPositionAction(
  noteId: string,
  headingId: string | null,
): Promise<{ ok: boolean }> {
  const uid = await currentUserId();
  if (!uid) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from('nclex_library_note_state').upsert(
    {
      student_id: uid,
      note_id: noteId,
      last_heading_id: headingId,
      last_visited_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,note_id' },
  );
  return { ok: !error };
}
