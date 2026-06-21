// mynclex/lib/cohorts/attendance-queries.ts
//
// Server reads for the cohort Sessions → Attendance sub-tab (Slice 3).
// Assembles the cohort's scheduled live sessions (the per-cohort planner
// rows), the enrolled roster, and every attendance row, into the shape the
// Attendance pane + roster drawer render. Pure derivations (held/summary/
// engagement) live in ./attendance-format.
//
// Ownership: getCohortForShell + getCohortRoster both RLS-gate to the
// owning tutor (null → caller 404s). Student profiles are self-read-only
// under RLS, so the roster comes through getCohortRoster's service-role
// path (it proves ownership first). Attendance + planner rows are read on
// the authed client — the tutor's *_tutor_all / *_self_select policies
// return their own cohort's rows.

import { createClient } from '@/lib/supabase/server';
import { getCohortForShell } from './queries';
import { getCohortRoster } from '@/lib/enrolments/queries';
import type {
  AttendanceSession,
  AttendanceStatus,
  AttendanceStudent,
  CohortAttendanceData,
} from './attendance-format';

// typical_duration_minutes off the marker payload (jsonb). Mirrors the
// helper in live-session-queries.ts (kept local — that one isn't exported).
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
  recording_url: string | null;
  nclex_programme_activities: MarkerEmbed | MarkerEmbed[] | null;
};

export async function getCohortAttendance(
  cohortId: string,
): Promise<CohortAttendanceData | null> {
  const ctx = await getCohortForShell(cohortId);
  if (!ctx) return null;

  const roster = await getCohortRoster(cohortId);
  if (roster === null) return null;

  // The markable roster = actively ENROLLED students (matches the cohort
  // analytics' "counted class"; paused / pending / terminal excluded).
  const students: AttendanceStudent[] = roster
    .filter((r) => r.status === 'ENROLLED')
    .map((r) => ({ userId: r.user_id, name: r.name }));

  const supabase = await createClient();

  // Planner rows (the scheduled sessions) joined to their marker for title
  // + week + typical duration. Unscheduled markers have no planner row, so
  // they can't be marked — exactly right; they stay on the Schedule tab.
  const { data: plannerData } = await supabase
    .from('nclex_cohort_live_sessions')
    .select(
      `session_id, marker_activity_id, scheduled_at, duration_minutes, recording_url,
       nclex_programme_activities!inner(
         title, payload,
         nclex_programme_units!inner( unit_index )
       )`,
    )
    .eq('cohort_id', cohortId);

  const plannerRows = (plannerData ?? []) as PlannerRow[];
  const sessionIds = plannerRows.map((r) => r.session_id);

  // Every attendance row for these sessions, bucketed by session.
  const statusesBySession = new Map<string, Record<string, AttendanceStatus>>();
  if (sessionIds.length > 0) {
    const { data: attData } = await supabase
      .from('nclex_cohort_session_attendance')
      .select('session_id, student_id, status')
      .in('session_id', sessionIds);
    for (const a of (attData ?? []) as Array<{
      session_id: string;
      student_id: string;
      status: AttendanceStatus;
    }>) {
      const m = statusesBySession.get(a.session_id) ?? {};
      m[a.student_id] = a.status;
      statusesBySession.set(a.session_id, m);
    }
  }

  const sessions: AttendanceSession[] = plannerRows.map((r) => {
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
      markerActivityId: r.marker_activity_id,
      title: act?.title ?? 'Live session',
      unitIndex: unitEmbed?.unit_index ?? 0,
      scheduledAt: r.scheduled_at,
      durationMinutes: r.duration_minutes ?? typicalDurationOf(act?.payload),
      recordingUrl: r.recording_url,
      statuses: statusesBySession.get(r.session_id) ?? {},
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
      cohort_id: ctx.cohort.cohort_id,
      name: ctx.cohort.name,
      start_date: ctx.cohort.start_date,
    },
    programme: { unit_label: ctx.programme.unit_label },
    students,
    sessions,
    nowMs: Date.now(),
  };
}
