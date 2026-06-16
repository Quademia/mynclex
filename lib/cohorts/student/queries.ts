// mynclex/lib/cohorts/student/queries.ts
//
// Student "My sessions" read (Slice 3b). Reads this cohort's scheduled
// live sessions (the planner) joined to their markers, plus the calling
// student's OWN attendance rows, into the shape the student Sessions page
// renders. All RLS-gated on the authed client:
//   • cohort + programme meta — student-readable (PUBLISHED programme).
//   • planner rows — nclex_cohort_live_sessions_student_select (active
//     cohort enrolment).
//   • attendance — nclex_cohort_session_attendance_student_select
//     (student_id = auth.uid()), so only the caller's own rows return.
// Returns null when the cohort isn't readable (page → 404). The cohort
// layout already gates STUDENT role + enrolment before this runs.

import { createClient } from '@/lib/supabase/server';
import type { LiveSessionPlatform } from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';
import type {
  AttendanceStatus,
  StudentSession,
  StudentSessionsData,
} from './sessions-format';

// Mirrors the local set in live-session-queries.ts (the constant isn't
// exported from types.ts).
const PLATFORMS: ReadonlySet<string> = new Set([
  'ZOOM',
  'GOOGLE_MEET',
  'MS_TEAMS',
  'OTHER',
]);

function typicalDurationOf(payload: unknown): number | null {
  if (payload && typeof payload === 'object') {
    const v = (payload as Record<string, unknown>).typical_duration_minutes;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

type MarkerEmbed = {
  title: string;
  payload: unknown;
  nclex_programme_units:
    | { unit_index: number }
    | Array<{ unit_index: number }>
    | null;
};

type PlannerRow = {
  session_id: string;
  marker_activity_id: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  platform: string | null;
  join_url: string | null;
  meeting_id: string | null;
  passcode: string | null;
  joining_instructions: string | null;
  recording_url: string | null;
  nclex_programme_activities: MarkerEmbed | MarkerEmbed[] | null;
};

export async function getStudentCohortSessions(
  cohortId: string,
): Promise<StudentSessionsData | null> {
  const supabase = await createClient();

  // Cohort + programme meta (RLS: student-readable when enrolled in a
  // PUBLISHED programme). Null → not readable → page 404s.
  const { data: cohortRow } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, name,
       nclex_programmes!inner( title, unit_label )`,
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!cohortRow) return null;

  const progRaw = (cohortRow as typeof cohortRow & {
    nclex_programmes:
      | { title: string; unit_label: UnitLabel }
      | Array<{ title: string; unit_label: UnitLabel }>
      | null;
  }).nclex_programmes;
  const programme = Array.isArray(progRaw) ? progRaw[0] : progRaw;
  if (!programme) return null;

  // Planner rows for the cohort + their markers.
  const { data: plannerData } = await supabase
    .from('nclex_cohort_live_sessions')
    .select(
      `session_id, marker_activity_id, scheduled_at, duration_minutes, platform,
       join_url, meeting_id, passcode, joining_instructions, recording_url,
       nclex_programme_activities!inner(
         title, payload,
         nclex_programme_units!inner( unit_index )
       )`,
    )
    .eq('cohort_id', cohortId);

  const plannerRows = (plannerData ?? []) as PlannerRow[];
  const sessionIds = plannerRows.map((r) => r.session_id);

  // The caller's OWN attendance (RLS scopes to student_id = auth.uid()).
  const myStatusBySession = new Map<string, AttendanceStatus>();
  if (sessionIds.length > 0) {
    const { data: attData } = await supabase
      .from('nclex_cohort_session_attendance')
      .select('session_id, status')
      .in('session_id', sessionIds);
    for (const a of (attData ?? []) as Array<{
      session_id: string;
      status: AttendanceStatus;
    }>) {
      myStatusBySession.set(a.session_id, a.status);
    }
  }

  const sessions: StudentSession[] = plannerRows.map((r) => {
    const act = Array.isArray(r.nclex_programme_activities)
      ? r.nclex_programme_activities[0]
      : r.nclex_programme_activities;
    const unitEmbed = act
      ? Array.isArray(act.nclex_programme_units)
        ? act.nclex_programme_units[0]
        : act.nclex_programme_units
      : null;
    return {
      sessionId: r.session_id,
      title: act?.title ?? 'Live session',
      unitIndex: unitEmbed?.unit_index ?? 0,
      scheduledAt: r.scheduled_at,
      durationMinutes: r.duration_minutes ?? typicalDurationOf(act?.payload),
      platform: PLATFORMS.has(r.platform ?? '')
        ? (r.platform as LiveSessionPlatform)
        : null,
      joinUrl: r.join_url,
      meetingId: r.meeting_id,
      passcode: r.passcode,
      joiningInstructions: r.joining_instructions,
      recordingUrl: r.recording_url,
      myStatus: myStatusBySession.get(r.session_id) ?? null,
    };
  });

  // Curriculum order: by week, then time within the week.
  sessions.sort(
    (a, b) =>
      a.unitIndex - b.unitIndex ||
      (a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0) -
        (b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0),
  );

  return {
    cohort: {
      cohortId,
      name: cohortRow.name,
      programmeTitle: programme.title,
    },
    unitLabel: programme.unit_label,
    sessions,
    nowMs: Date.now(),
  };
}
