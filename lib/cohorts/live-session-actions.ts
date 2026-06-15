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
import {
  validateScheduleInput,
  type LiveSessionScheduleInput,
} from './live-session-schedule';

// Re-export so existing importers keep their path.
export type { LiveSessionScheduleInput };

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
