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

  // The marker must be a live session readable by this tutor (RLS scopes
  // SELECT to the tutor's own programmes). Guards against scheduling a
  // non-live-session activity, or one outside the tutor's programmes.
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

export type SendReminderResult =
  | { ok: true; queued: number }
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

  return { ok: true, queued: Number(data ?? 0) };
}
