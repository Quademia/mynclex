// mynclex/lib/cohorts/live-session-queries.ts
//
// The cohort Live Session Planner (Slice 1b). Reads every live-session
// MARKER in the cohort's programme curriculum (template markers PLUS
// this cohort's own cohort-only markers) and joins each to this
// cohort's per-run schedule row (nclex_cohort_live_sessions). A marker
// with no schedule row is "unscheduled" for the cohort.
//
// RLS scopes both reads to the signed-in tutor (via the cohort's parent
// programme). Returns null when the cohort doesn't exist or the tutor
// doesn't own its parent programme.

import { createClient } from '@/lib/supabase/server';
import type {
  LiveSessionSchedule,
  LiveSessionPlatform,
} from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';

export type PlannerSession = {
  activityId: string;
  title: string;
  description: string | null;
  note: string | null;
  unitId: string;
  unitIndex: number;
  unitTitle: string | null;
  ordinal: number;
  typicalDurationMinutes: number | null;
  isCohortOnly: boolean;
  schedule: LiveSessionSchedule | null;
};

export type PlannerUnit = {
  unitId: string;
  unitIndex: number;
  title: string | null;
};

export type CohortSessionsPlanner = {
  cohort: { cohort_id: string; name: string | null; start_date: string };
  programme: { programme_id: string; title: string; unit_label: UnitLabel };
  // Weeks/modules in the programme — drives the "+ Add session" week picker.
  units: PlannerUnit[];
  sessions: PlannerSession[];
};

const PLATFORMS: ReadonlySet<string> = new Set([
  'ZOOM',
  'GOOGLE_MEET',
  'MS_TEAMS',
  'OTHER',
]);

type PlannerRow = {
  marker_activity_id: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  platform: string | null;
  join_url: string | null;
  meeting_id: string | null;
  passcode: string | null;
  joining_instructions: string | null;
  recording_url: string | null;
};

export function toLiveSessionSchedule(r: PlannerRow): LiveSessionSchedule {
  return {
    scheduledAt: r.scheduled_at,
    durationMinutes: r.duration_minutes,
    platform: PLATFORMS.has(r.platform ?? '')
      ? (r.platform as LiveSessionPlatform)
      : null,
    joinUrl: r.join_url,
    meetingId: r.meeting_id,
    passcode: r.passcode,
    joiningInstructions: r.joining_instructions,
    recordingUrl: r.recording_url,
  };
}

function typicalDurationOf(payload: unknown): number | null {
  if (payload && typeof payload === 'object') {
    const v = (payload as Record<string, unknown>).typical_duration_minutes;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export async function getCohortSessionsPlanner(
  cohortId: string
): Promise<CohortSessionsPlanner | null> {
  const supabase = await createClient();

  // Wave 1 — cohort + parent programme. RLS gates both.
  const { data: cohortRow, error: cohortError } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, name, start_date,
       nclex_programmes!inner( programme_id, title, unit_label )`
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (cohortError || !cohortRow) return null;

  const programmeRaw = (cohortRow as typeof cohortRow & {
    nclex_programmes:
      | { programme_id: string; title: string; unit_label: UnitLabel }
      | Array<{ programme_id: string; title: string; unit_label: UnitLabel }>
      | null;
  }).nclex_programmes;
  const programme = Array.isArray(programmeRaw) ? programmeRaw[0] : programmeRaw;
  if (!programme) return null;

  // Wave 2 — the live-session markers (template + this cohort's own) and
  // this cohort's planner rows. The `.or` scope keeps another cohort's
  // cohort-only markers out.
  const cohortScope = `cohort_id.is.null,cohort_id.eq.${cohortId}`;
  const [unitsRes, activitiesRes, plannerRes] = await Promise.all([
    supabase
      .from('nclex_programme_units')
      .select('unit_id, unit_index, title')
      .eq('programme_id', programme.programme_id)
      .order('unit_index', { ascending: true }),
    supabase
      .from('nclex_programme_activities')
      .select(
        `activity_id, unit_id, ordinal, title, description, note, payload,
         cohort_id,
         nclex_programme_units!inner( programme_id, unit_index, title )`
      )
      .eq('type', 'ONLINE_LIVE_SESSION')
      .eq('nclex_programme_units.programme_id', programme.programme_id)
      .or(cohortScope),
    supabase
      .from('nclex_cohort_live_sessions')
      .select(
        `marker_activity_id, scheduled_at, duration_minutes, platform,
         join_url, meeting_id, passcode, joining_instructions, recording_url`
      )
      .eq('cohort_id', cohortId),
  ]);

  const scheduleByMarker = new Map<string, LiveSessionSchedule>();
  for (const r of (plannerRes.data ?? []) as PlannerRow[]) {
    scheduleByMarker.set(r.marker_activity_id, toLiveSessionSchedule(r));
  }

  type ActivityRow = {
    activity_id: string;
    unit_id: string;
    ordinal: number;
    title: string;
    description: string | null;
    note: string | null;
    payload: unknown;
    cohort_id: string | null;
    nclex_programme_units:
      | { programme_id: string; unit_index: number; title: string | null }
      | Array<{ programme_id: string; unit_index: number; title: string | null }>
      | null;
  };

  const sessions: PlannerSession[] = (
    (activitiesRes.data ?? []) as ActivityRow[]
  ).map((a) => {
    const unitEmbed = Array.isArray(a.nclex_programme_units)
      ? a.nclex_programme_units[0]
      : a.nclex_programme_units;
    return {
      activityId: a.activity_id,
      title: a.title,
      description: a.description,
      note: a.note,
      unitId: a.unit_id,
      unitIndex: unitEmbed?.unit_index ?? 0,
      unitTitle: unitEmbed?.title ?? null,
      ordinal: a.ordinal,
      typicalDurationMinutes: typicalDurationOf(a.payload),
      isCohortOnly: a.cohort_id != null,
      schedule: scheduleByMarker.get(a.activity_id) ?? null,
    };
  });

  // Curriculum order: by week, then position within the week.
  sessions.sort((x, y) => x.unitIndex - y.unitIndex || x.ordinal - y.ordinal);

  const units: PlannerUnit[] = (
    (unitsRes.data ?? []) as Array<{
      unit_id: string;
      unit_index: number;
      title: string | null;
    }>
  ).map((u) => ({
    unitId: u.unit_id,
    unitIndex: u.unit_index,
    title: u.title,
  }));

  return {
    cohort: {
      cohort_id: cohortRow.cohort_id,
      name: cohortRow.name,
      start_date: cohortRow.start_date,
    },
    programme: {
      programme_id: programme.programme_id,
      title: programme.title,
      unit_label: programme.unit_label,
    },
    units,
    sessions,
  };
}
