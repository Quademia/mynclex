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
// Write-through to the progress engine (curriculum tick) only applies
// when the note was reached AS a unit activity — that path lands with
// slice 11.11 (note-as-activity). Until then "done" records the note's
// own state only; the wire-through is a documented stub below.

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
  // TODO(11.11): when reached via a Library Note activity, also call
  // markActivityDone / unmarkActivityDone so the curriculum tick fires.
  // No activity context exists until note-as-activity ships, so for now
  // this records the note's own done-state only.
  return toggleTimestamp(noteId, 'marked_done_at');
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
