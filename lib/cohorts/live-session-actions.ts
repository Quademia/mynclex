// mynclex/lib/cohorts/live-session-actions.ts
//
// Tutor server actions for the cohort Live Session Planner (Slice 1b):
// set (upsert) or clear a marker's per-run schedule. RLS on
// nclex_cohort_live_sessions enforces ownership (cohort -> programme ->
// tutor); these add field validation + a marker-type guard. The client
// modal calls router.refresh() on success (the pane is a server
// component), so no revalidatePath is needed here.

'use server';

import { createClient } from '@/lib/supabase/server';
import {
  validateHttpUrl,
  validateScheduledAt,
} from '@/lib/curriculum/activity-payload';
import type { LiveSessionPlatform } from '@/lib/curriculum/types';

const PLATFORMS: ReadonlySet<LiveSessionPlatform> = new Set<LiveSessionPlatform>([
  'ZOOM',
  'GOOGLE_MEET',
  'MS_TEAMS',
  'OTHER',
]);

export type LiveSessionScheduleInput = {
  scheduledAt: string | null; // UTC ISO, or null = no date set yet
  durationMinutes: number | null;
  platform: LiveSessionPlatform | null;
  joinUrl: string | null;
  meetingId: string | null;
  passcode: string | null;
  joiningInstructions: string | null;
  recordingUrl: string | null;
};

export type ScheduleResult = { ok: true } | { ok: false; error: string };

function cleanText(v: string | null, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
}

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

  // Validate the per-run fields. Everything is optional — a tutor can
  // save a partial schedule (e.g. a date now, the link later).
  let scheduledIso: string | null = null;
  if (input.scheduledAt != null && input.scheduledAt.trim() !== '') {
    const when = validateScheduledAt(input.scheduledAt);
    if (!when.ok) return { ok: false, error: when.error };
    scheduledIso = when.iso;
  }

  let duration: number | null = null;
  if (input.durationMinutes != null) {
    if (
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes <= 0
    ) {
      return {
        ok: false,
        error: 'Duration must be a positive whole number of minutes.',
      };
    }
    duration = input.durationMinutes;
  }

  let platform: LiveSessionPlatform | null = null;
  if (input.platform != null) {
    if (!PLATFORMS.has(input.platform)) {
      return { ok: false, error: 'Unknown meeting platform.' };
    }
    platform = input.platform;
  }

  let joinUrl: string | null = null;
  if (input.joinUrl != null && input.joinUrl.trim() !== '') {
    const u = validateHttpUrl(input.joinUrl, 'Join URL');
    if (!u.ok) return { ok: false, error: u.error };
    joinUrl = u.url;
  }

  let recordingUrl: string | null = null;
  if (input.recordingUrl != null && input.recordingUrl.trim() !== '') {
    const u = validateHttpUrl(input.recordingUrl, 'Recording URL');
    if (!u.ok) return { ok: false, error: u.error };
    recordingUrl = u.url;
  }

  const row = {
    cohort_id: cohortId,
    marker_activity_id: markerActivityId,
    scheduled_at: scheduledIso,
    duration_minutes: duration,
    platform,
    join_url: joinUrl,
    meeting_id: cleanText(input.meetingId, 200),
    passcode: cleanText(input.passcode, 200),
    joining_instructions: cleanText(input.joiningInstructions, 2000),
    recording_url: recordingUrl,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('nclex_cohort_live_sessions')
    .upsert(row, { onConflict: 'cohort_id,marker_activity_id' });
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
