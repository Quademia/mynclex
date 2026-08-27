// mynclex/lib/cohorts/live-session-actions.ts
//
// Tutor server actions for the cohort Live Session Planner (Slice 1b):
// set (upsert) or clear a marker's per-run schedule. RLS on
// nclex_cohort_live_sessions enforces ownership (cohort -> programme ->
// tutor); these add a marker-type guard + the shared field validation
// (lib/cohorts/live-session-schedule.ts, which also handles the forgiving
// URL normalisation). The client modal calls router.refresh() on success.

'use server';

import { createClient } from '@/lib/supabase/server';
import { ownedCohortProgrammeId } from './tutor-scope';
import { validateScheduleInput } from './live-session-schedule';
import type { LiveSessionScheduleInput } from './live-session-schedule';

export type ScheduleResult = { ok: true } | { ok: false; error: string };

export async function setLiveSessionScheduleAction(
  cohortId: string,
  markerActivityId: string,
  input: LiveSessionScheduleInput
): Promise<ScheduleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // ⚠ The cohort gate is what makes this the tutor's own. The marker
  // lookup below cannot do it: nclex_programme_activities carries
  // _student_select, so "readable by this tutor" was never the same as
  // "in the tutor's own programmes", as the old comment here claimed.
  // Without this, the upsert's UPDATE branch matched zero rows and
  // raised nothing — a schedule that reported saved and was not.
  // See lib/programmes/tutor-scope.ts.
  const ownedProgrammeId = await ownedCohortProgrammeId(supabase, cohortId, user.id);
  if (!ownedProgrammeId) {
    return { ok: false, error: 'Live session not found.' };
  }

  // The marker must be a live-session activity — guards against
  // scheduling something that isn't one.
  const { data: marker } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, type')
    .eq('activity_id', markerActivityId)
    .maybeSingle();
  if (!marker || marker.type !== 'ONLINE_LIVE_SESSION') {
    return { ok: false, error: 'Live session not found.' };
  }

  const v = validateScheduleInput(input);
  if (!v.ok) return { ok: false, error: v.error };

  const { error } = await supabase
    .from('nclex_cohort_live_sessions')
    .upsert(
      {
        cohort_id: cohortId,
        marker_activity_id: markerActivityId,
        ...v.row,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cohort_id,marker_activity_id' }
    );
  if (error) {
    return { ok: false, error: 'Could not save the schedule.' };
  }
  return { ok: true };
}

export async function clearLiveSessionScheduleAction(
  cohortId: string,
  markerActivityId: string
): Promise<ScheduleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // ⚠ A DELETE matching zero rows is not an error in Postgres, and
  // this only checked `error` — so for a cohort the caller does not
  // own, the schedule "cleared" and nothing changed. The write itself
  // was always refused (owner-only policy); the lie was the outcome.
  // See lib/programmes/tutor-scope.ts.
  const ownedProgrammeId = await ownedCohortProgrammeId(supabase, cohortId, user.id);
  if (!ownedProgrammeId) {
    return { ok: false, error: 'Could not clear the schedule.' };
  }

  const { error } = await supabase
    .from('nclex_cohort_live_sessions')
    .delete()
    .eq('cohort_id', cohortId)
    .eq('marker_activity_id', markerActivityId);
  if (error) {
    return { ok: false, error: 'Could not clear the schedule.' };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// "Send reminder" — the one case the nightly pass cannot reach
// ─────────────────────────────────────────────────────────────────────
// A student who joins on the MORNING of a class is past last night's run,
// and no schedule covers "we start in 30 minutes and the link has
// changed". This is the escape valve for both.
//
// ⚠ ONCE PER OCCURRENCE (Sam, 2026-08-19). An always-open button is a
// tutor emailing twenty-five nurses four times about one lesson, and the
// first noisy transactional email is how people start ignoring the rest.
// The limit needs no counter: it IS the outbox fingerprint the nightly
// pass already uses, so a second press inserts nothing and returns 0.
//
// ⭐ The allowance refills when the CLASS MOVES, because the fingerprint
// carries the scheduled time. Otherwise the one person who most needs to
// speak after a reschedule would be the only one gagged.
//
// ⚠ THE COUNT IS RETURNED AND THE UI MUST SHOW IT. A tutor pressing a
// live button and seeing nothing is the third instance of one bug here:
// nclex_submit_enquiry reports success while dropping a repeat enquirer's
// message, and the pay-first receipt was refused by the fingerprint with
// nobody told. The gate itself lives in SQL — UX is in TS, security is in
// SQL — so this action is the message, not the guard.

// ⚠⚠ TWO NUMBERS COME BACK, BECAUSE "0" IS AMBIGUOUS AND THE TWO MEANINGS
// need opposite words:
//   queued 0, eligible > 0  → everyone has already been told. Fine.
//   eligible 0              → there is NOBODY we can email. The class is
//                             unannounced, and the tutor must know that.
//
// ⭐ The second is not an edge case. Tutors set the timetable when they
// create the cohort, before anyone enrols — that premise is the entire
// reason the reminder is a nightly pass rather than a scheduling trigger.
// So "send a reminder to a cohort with no students" is a thing a careful
// tutor does early, and answering it with "everyone has already been told"
// would tell her a class is announced when nobody has heard of it.
export type SendReminderResult =
  | { ok: true; queued: number; eligible: number }
  | { ok: false; error: string };

export async function sendSessionReminderAction(sessionId: string): Promise<SendReminderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase.rpc('nclex_tutor_send_session_reminder', {
    p_session_id: sessionId,
  });

  if (error) {
    // The RPC raises a sentence per refusal (not yours · no date yet ·
    // already happened), and each is worth showing verbatim — a tutor who
    // is told "already taken place" stops looking for a bug.
    return { ok: false, error: error.message || 'Could not send the reminder.' };
  }

  const r = (data ?? {}) as { queued?: number; eligible?: number };
  return { ok: true, queued: Number(r.queued ?? 0), eligible: Number(r.eligible ?? 0) };
}
