// mynclex/lib/cohorts/live-session-queries.ts
//
// The cohort Live Session Planner (Slice 1b). Reads every live-session
// MARKER in the cohort's programme curriculum (template markers PLUS
// this cohort's own cohort-only markers) and joins each to this
// cohort's per-run schedule row (nclex_cohort_live_sessions). A marker
// with no schedule row is "unscheduled" for the cohort.
//
// ⚠ OWNERSHIP IS PROVED BY THE CALLER, NOT BY RLS — this said "RLS
// scopes both reads to the signed-in tutor", and it does not.
// nclex_cohorts and nclex_cohort_live_sessions each carry
// _student_select and _admin_all beside _self_select, so an unfiltered
// cohort lookup resolves for a cohort you are merely enrolled on, or
// for any cohort at all if you hold SUPER_ADMIN.
//
// What actually makes this safe is a chain of two proofs in the caller:
// the page runs getOwnedProgrammeForShell (which carries
// .eq('tutor_id', …)), and CohortDetail then refuses unless
// cohort.programme_id === that programme. Own the programme, and the
// cohort inside it is yours.
//
// ⭐ So this function is safe by COMPOSITION, and the guard it depends
// on lives in another file. Do not delete either half as redundant —
// audited 2026-08-27, when the sentence above was found to be false.
//
// Returns null when the cohort doesn't exist or is unreadable.

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
  /**
   * The reminder email's view of this row. Null when the session has no
   * schedule row at all (nothing to remind anyone about yet).
   *
   * ⭐ `manualSentAt` is what makes the tutor's button honest. The
   * allowance is one deliberate send per class OCCURRENCE, enforced by the
   * outbox fingerprint rather than a counter — so without reading it back,
   * a second press would insert nothing and look identical to a first.
   * A live control that does nothing and says nothing is the bug that has
   * now bitten this codebase twice.
   */
  reminder: { sessionId: string; manualSentAt: string | null } | null;
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

  // Wave 1 — cohort + parent programme. RLS is the floor here, not the
  // filter; the caller's ownership chain is what narrows this (header).
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
        `session_id, marker_activity_id, scheduled_at, duration_minutes, platform,
         join_url, meeting_id, passcode, joining_instructions, recording_url`
      )
      .eq('cohort_id', cohortId),
  ]);

  const scheduleByMarker = new Map<string, LiveSessionSchedule>();
  const sessionIdByMarker = new Map<string, string>();
  for (const r of (plannerRes.data ?? []) as PlannerRow[]) {
    scheduleByMarker.set(r.marker_activity_id, toLiveSessionSchedule(r));
    sessionIdByMarker.set(r.marker_activity_id, r.session_id);
  }

  // Which classes has the tutor already spent their one manual reminder on?
  //
  // ⚠ Its own round-trip, through a function, because the outbox is NOT
  // tutor-readable and should not become so — it holds every email the
  // product has ever sent to anyone. This one answers a single question
  // about a single cohort, for its owner.
  //
  // ⓘ A failure here is not fatal and deliberately not treated as one: the
  // button falls back to looking unsent, the tutor presses it, and the
  // fingerprint refuses the duplicate. The restriction lives in the
  // database; this map only decides what the button SAYS.
  const { data: reminderRows } = await supabase.rpc('nclex_tutor_cohort_reminder_state', {
    p_cohort_id: cohortId,
  });
  const manualSentByMarker = new Map<string, string>();
  for (const r of (reminderRows ?? []) as Array<{
    marker_activity_id: string;
    manual_sent_at: string | null;
  }>) {
    if (r.manual_sent_at) manualSentByMarker.set(r.marker_activity_id, r.manual_sent_at);
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
      reminder: sessionIdByMarker.has(a.activity_id)
        ? {
            sessionId: sessionIdByMarker.get(a.activity_id) as string,
            manualSentAt: manualSentByMarker.get(a.activity_id) ?? null,
          }
        : null,
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
