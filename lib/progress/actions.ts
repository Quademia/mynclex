// mynclex/lib/progress/actions.ts
//
// Progress engine — Slice 2 (manual completion).
//
// Two student-side server actions: mark / un-mark an activity as
// done. Used by the per-type viewers for the 4 MANUAL activity
// types (TEXT, PDF, EXTERNAL_LINK, ONLINE_LIVE_SESSION). Quiz
// types (MOCK, PRACTICE_QUIZ) are written by the DB trigger
// installed in Slice 1 — those types REJECT the manual server
// action so a "marked-done" quiz with zero attempts can't exist
// (would break tutor analytics and history). See
// docs/product-plan/progress-engine.md §5.2.
//
// Auth + visibility — caller's auth.uid() identifies the student;
// the nclex_student_activity_progress_student_own RLS policy
// scopes writes; the nclex_programme_activities student RLS gates
// SELECT (PUBLISHED programme only). A missing/invisible activity
// returns the same generic error as a wrong-type one, so a client
// can't probe for activity IDs.
//
// Window-state gating (LOCKED/CLOSED reject) — deferred to the
// enrolment slice. Today the curriculum viewer doesn't open the
// modal for non-OPEN activities anyway, so the v1 client path
// never reaches these actions in those states. Consistent with
// the existing permissive v1 pattern in lib/curriculum/student-
// actions.ts.

'use server';

import { createClient } from '@/lib/supabase/server';

const MANUAL_TYPES = new Set([
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'ONLINE_LIVE_SESSION',
]);

export type MarkResult = { ok: true } | { ok: false; error: string };

/**
 * Mark an activity DONE for the calling student.
 * Idempotent — re-marking a DONE row is a no-op success.
 * Rejects quiz types (DONE for those is bound to attempt truth).
 */
export async function markActivityDone(
  activityId: string
): Promise<MarkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Visibility + type check — read under student RLS. Missing /
  // wrong-type / invisible all return the same generic message.
  const { data: activity } = await supabase
    .from('nclex_programme_activities')
    .select('type')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!activity) {
    return { ok: false, error: 'Activity not found or not available.' };
  }
  if (!MANUAL_TYPES.has(activity.type)) {
    return {
      ok: false,
      error: 'This activity type is marked done automatically when completed.',
    };
  }

  // INSERT — ON CONFLICT means re-marking is a no-op success
  // (matches the idempotent shape of the QUIZ_ATTEMPT trigger from
  // Slice 1; lets the client retry safely).
  const { error: insertError } = await supabase
    .from('nclex_student_activity_progress')
    .upsert(
      {
        student_id: user.id,
        activity_id: activityId,
        completion_source: 'MANUAL',
        // attempt_id stays NULL (CHECK constraint enforces this for MANUAL).
        // completed_at + created_at default to NOW().
        // marked_by stays NULL (v1 always self-marked).
      },
      { onConflict: 'student_id,activity_id', ignoreDuplicates: true }
    );

  if (insertError) {
    return { ok: false, error: 'Could not mark this activity done.' };
  }

  return { ok: true };
}

/**
 * Un-mark an activity. DELETEs the matching MANUAL row only —
 * QUIZ_ATTEMPT rows are immune (the only way one of those goes
 * away is the void cascade from a deleted attempt). DELETE on a
 * non-existent or QUIZ_ATTEMPT row is a no-op success (idempotent
 * shape parallels the mark action).
 */
export async function unmarkActivityDone(
  activityId: string
): Promise<MarkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Same visibility check — no information leak between mark/unmark.
  const { data: activity } = await supabase
    .from('nclex_programme_activities')
    .select('type')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!activity) {
    return { ok: false, error: 'Activity not found or not available.' };
  }
  if (!MANUAL_TYPES.has(activity.type)) {
    return {
      ok: false,
      error: 'This activity type is marked done automatically when completed.',
    };
  }

  // DELETE scoped to (student, activity, MANUAL). A QUIZ_ATTEMPT
  // row at the same (student, activity) is invisible to this
  // WHERE — same as "no row exists" from the caller's perspective.
  // RLS limits to caller's own rows; the explicit student_id is
  // belt-and-braces.
  const { error: deleteError } = await supabase
    .from('nclex_student_activity_progress')
    .delete()
    .eq('student_id', user.id)
    .eq('activity_id', activityId)
    .eq('completion_source', 'MANUAL');

  if (deleteError) {
    return { ok: false, error: 'Could not un-mark this activity.' };
  }

  return { ok: true };
}
