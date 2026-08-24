// mynclex/lib/analytics/tutor/programme-queries.ts
//
// Self-paced programme analytics — the sibling of cohort-queries.ts, and
// the surface behind /tutor/programme/[id]/progress.
//
// ⭐ THE MODEL. A self-paced programme is one cohort with late joins (Sam,
// 2026-08-23). Every member has their own start date (the day they bought),
// their own end date (their access window), no release gates, and no live
// sessions. Everything downstream falls out of that:
//
//   • WHO IS IN SCOPE — programme enrollees with cohort_id NULL, which is
//     what getProgrammeRoster already returns for a self-paced programme.
//     No new permission was needed for any of this: the tutor_read policies
//     on progress rows and attempts walk activity → unit → programme →
//     tutor and never touch cohort, so a cohortless student's data was
//     always readable. Hence no migration.
//
//   • THE DENOMINATOR — a self-paced student gets the whole curriculum on
//     day one (student-queries.ts hardcodes releaseDate: null), so there is
//     no released/locked split and every activity counts from the start.
//     The cohort version's entire locked branch simply does not arise.
//
//   • THE STATUS — ⚠ and this is the part that could NOT be ported. The
//     cohort classifier buckets on completion % of RELEASED material, which
//     is fair only because a cohort in week 2 has released weeks 1–2. Here
//     everything is released from the start, so the denominator is the
//     whole programme, and a student who joined yesterday and did two
//     activities would be labelled "At risk" on day one. Every new student
//     would be flagged as failing the moment they arrived. So self-paced
//     uses EngagementStatus (time-based) instead — see types.ts.
//
//   • LIVE SESSIONS — excluded outright. Self-paced has no cohort, so no
//     planner rows and no attendance can ever exist; a live-session
//     activity left in the template could never be completed by anybody and
//     would sit in the denominator dragging every student down forever.
//
// Quiz performance and the JSONB id normaliser are imported from
// cohort-queries.ts rather than copied: both are keyed on programme +
// students + quizzes, none of which are cohort concepts.

import { createClient } from '@/lib/supabase/server';
import { getProgrammeRoster } from '@/lib/enrolments/queries';
import { isVisibleToStudents } from '@/lib/curriculum/format';
import type { ActivityType } from '@/lib/curriculum/types';
import type { UnitLabel } from '@/lib/programmes/types';
import { computePerformance, normalizeIds } from './cohort-queries';
import {
  getProgrammeLastActive,
  getProgrammeNudgeHistory,
  daysSince,
} from './last-active';
import {
  ACCESS_SOON_DAYS,
  STALLED_AFTER_DAYS,
  type ActivityAnalyticsRow,
  type CohortQuizPerformance,
  type EngagementStatus,
  type StudentAnalyticsRow,
  type TutorAnalytics,
} from './types';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** How many recent weeks the momentum sparkline covers. The cohort version
 *  bands from the cohort's start date; a self-paced programme has no shared
 *  start, so it reads a rolling calendar window instead. */
const TREND_WEEKS = 12;

/** The activity types whose completion is a progress row. LIBRARY_NOTE and
 *  SHELF derive from note-state; ONLINE_LIVE_SESSION cannot occur here. */
const PROGRESS_TYPES = new Set<ActivityType>([
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'MOCK',
  'PRACTICE_QUIZ',
]);

interface VisibleActivity {
  activityId: string;
  type: ActivityType;
  title: string;
  quizId: string | null;
  unitIndex: number;
  unitTitle: string;
  ordinal: number;
}

interface ProgressRow {
  student_id: string;
  activity_id: string;
  completed_at: string;
}
interface NoteStateRow {
  student_id: string;
  note_id: string;
  marked_done_at: string | null;
}

function quizIdOf(type: ActivityType, payload: unknown): string | null {
  if (type !== 'MOCK' && type !== 'PRACTICE_QUIZ') return null;
  if (payload && typeof payload === 'object') {
    const q = (payload as Record<string, unknown>).quiz_id;
    if (typeof q === 'string') return q;
  }
  return null;
}

/**
 * The four self-paced states. Order matters: "done" outranks everything (a
 * finished student is not stalled, however long ago they finished), and
 * "never engaged" outranks recency (there is no recency to measure).
 */
function classifyEngagement(
  lastActiveDays: number | null,
  doneAll: number,
  totalCount: number,
): EngagementStatus {
  if (totalCount > 0 && doneAll >= totalCount) return 'done';
  if (lastActiveDays == null) return 'notstarted';
  return lastActiveDays >= STALLED_AFTER_DAYS ? 'stalled' : 'active';
}

/** Rolling completion volume over the last TREND_WEEKS weeks, oldest first. */
function rollingTrend(timestamps: string[], nowMs: number): number[] {
  const counts = new Array(TREND_WEEKS).fill(0) as number[];
  for (const ts of timestamps) {
    const ago = nowMs - new Date(ts).getTime();
    if (ago < 0) continue;
    const weeksAgo = Math.floor(ago / WEEK_MS);
    if (weeksAgo >= TREND_WEEKS) continue;
    counts[TREND_WEEKS - 1 - weeksAgo] += 1;
  }
  return counts;
}

/**
 * Full self-paced analytics for one programme. Returns null when the
 * programme isn't owned/readable by the caller (page → 404), mirroring
 * getCohortAnalytics.
 *
 * ⚠ The caller must only invoke this on a SELF_PACED programme — it reads
 * the cohortless roster, which on a tutor-led programme is empty by
 * definition. The route and the sidebar both gate on delivery_mode.
 */
export async function getSelfPacedProgrammeAnalytics(
  programmeId: string,
  opts: { includePerformance?: boolean } = {},
): Promise<TutorAnalytics | null> {
  const supabase = await createClient();

  // Ownership gate — RLS returns the row only for the owning tutor (or a
  // SUPER_ADMIN, per the intentional v1 bypass).
  const { data: prog } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title, delivery_mode, unit_label, length_units')
    .eq('programme_id', programmeId)
    .maybeSingle();
  if (!prog) return null;

  const programme = prog as {
    programme_id: string;
    title: string;
    delivery_mode: string;
    unit_label: UnitLabel;
    length_units: number | null;
  };

  const roster = await getProgrammeRoster(programmeId);
  if (roster === null) return null;

  // The counted roster = actively ENROLLED students, matching the cohort
  // rule. PAUSED / pending / terminal are excluded: a paused student is not
  // stalled, they are locked out, and mixing the two would send a tutor to
  // chase somebody the product is deliberately holding at the door.
  const students = roster.filter((r) => r.status === 'ENROLLED');
  const studentIds = students.map((s) => s.user_id);
  const studentIdSet = new Set(studentIds);

  const nowMs = Date.now();

  // ── Access windows ─────────────────────────────────────────────────────
  // Not carried on the roster row, so read directly. The tutor holds a
  // programme-scoped SELECT on nclex_enrolments; ⚠ the explicit .eq()
  // matters because a SUPER_ADMIN's admin-all policy would otherwise OR in
  // every enrolment in the product.
  const accessByStudent = new Map<string, string | null>();
  if (studentIds.length) {
    const { data: accessRows } = await supabase
      .from('nclex_enrolments')
      .select('user_id, access_expires_at')
      .eq('programme_id', programmeId)
      .is('cohort_id', null);
    for (const r of (accessRows ?? []) as Array<{
      user_id: string;
      access_expires_at: string | null;
    }>) {
      if (!studentIdSet.has(r.user_id)) continue;
      accessByStudent.set(r.user_id, r.access_expires_at);
    }
  }

  // ── Effective curriculum ───────────────────────────────────────────────
  // The programme TEMPLATE, exactly as getStudentSelfPacedCurriculum builds
  // it — including the cohort_id IS NULL filter, so a cohort-only activity
  // authored on some tutor-led run can never leak in.
  const [unitsRes, blocksRes, actsRes] = await Promise.all([
    supabase
      .from('nclex_programme_units')
      .select('unit_id, unit_index, title, is_published')
      .eq('programme_id', programmeId)
      .order('unit_index', { ascending: true }),
    supabase
      .from('nclex_programme_blocks')
      .select('block_id, is_published, nclex_programme_units!inner(programme_id)')
      .eq('nclex_programme_units.programme_id', programmeId),
    supabase
      .from('nclex_programme_activities')
      .select(
        'activity_id, unit_id, block_id, ordinal, type, title, is_published, payload, nclex_programme_units!inner(programme_id)',
      )
      .eq('nclex_programme_units.programme_id', programmeId)
      .is('cohort_id', null)
      .order('ordinal', { ascending: true }),
  ]);

  const units = (unitsRes.data ?? []) as Array<{
    unit_id: string;
    unit_index: number;
    title: string;
    is_published: boolean;
  }>;
  const unitById = new Map(units.map((u) => [u.unit_id, u]));
  const blockPublishedById = new Map(
    (
      (blocksRes.data ?? []) as Array<{ block_id: string; is_published: boolean }>
    ).map((b) => [b.block_id, b.is_published]),
  );

  const visible: VisibleActivity[] = [];
  for (const a of (actsRes.data ?? []) as Array<{
    activity_id: string;
    unit_id: string;
    block_id: string | null;
    ordinal: number;
    type: ActivityType;
    title: string;
    is_published: boolean;
    payload: unknown;
  }>) {
    const unit = unitById.get(a.unit_id);
    if (!unit) continue;
    // ⚠ 'PUBLISHED' is asserted, not read — the question this surface
    // answers is "what would a student see", and the cohort sibling makes
    // the same assertion for the same reason.
    if (
      !isVisibleToStudents({
        programmeStatus: 'PUBLISHED',
        unitPublished: unit.is_published,
        blockPublished:
          a.block_id === null ? null : blockPublishedById.get(a.block_id) ?? false,
        activityPublished: a.is_published,
      })
    ) {
      continue;
    }
    // Live sessions cannot happen without a cohort — see the header note.
    if (a.type === 'ONLINE_LIVE_SESSION') continue;
    visible.push({
      activityId: a.activity_id,
      type: a.type,
      title: a.title,
      quizId: quizIdOf(a.type, a.payload),
      unitIndex: unit.unit_index,
      unitTitle: unit.title,
      ordinal: a.ordinal,
    });
  }
  visible.sort((x, y) => x.unitIndex - y.unitIndex || x.ordinal - y.ordinal);

  // ── Note / shelf pointers for the derived completion types ─────────────
  const noteActivityIds = visible
    .filter((a) => a.type === 'LIBRARY_NOTE')
    .map((a) => a.activityId);
  const shelfActivityIds = visible
    .filter((a) => a.type === 'SHELF')
    .map((a) => a.activityId);

  const noteIdByActivity = new Map<string, string>();
  const shelfByActivity = new Map<string, { shelfId: string; skipped: Set<string> }>();

  if (noteActivityIds.length || shelfActivityIds.length) {
    const { data: atts } = await supabase
      .from('nclex_tutor_library_note_attachments')
      .select('activity_id, note_id, shelf_id, skipped_note_ids')
      .in('activity_id', [...noteActivityIds, ...shelfActivityIds]);
    for (const r of (atts ?? []) as Array<{
      activity_id: string;
      note_id: string | null;
      shelf_id: string | null;
      skipped_note_ids: unknown;
    }>) {
      if (r.note_id) noteIdByActivity.set(r.activity_id, r.note_id);
      if (r.shelf_id) {
        shelfByActivity.set(r.activity_id, {
          shelfId: r.shelf_id,
          skipped: new Set(normalizeIds(r.skipped_note_ids)),
        });
      }
    }
  }

  const membersByActivity = new Map<string, string[]>();
  const shelfIds = [...shelfByActivity.values()].map((v) => v.shelfId);
  if (shelfIds.length) {
    const { data: members } = await supabase
      .from('nclex_tutor_library_shelf_memberships')
      .select('shelf_id, note_id')
      .in('shelf_id', shelfIds);
    const byShelf = new Map<string, string[]>();
    for (const m of (members ?? []) as Array<{ shelf_id: string; note_id: string }>) {
      const arr = byShelf.get(m.shelf_id) ?? [];
      arr.push(m.note_id);
      byShelf.set(m.shelf_id, arr);
    }
    for (const [activityId, { shelfId, skipped }] of shelfByActivity) {
      membersByActivity.set(
        activityId,
        (byShelf.get(shelfId) ?? []).filter((n) => !skipped.has(n)),
      );
    }
  }

  // ── Completion reads ───────────────────────────────────────────────────
  const progressActivityIds = visible
    .filter((a) => PROGRESS_TYPES.has(a.type))
    .map((a) => a.activityId);

  const allNoteIds = new Set<string>();
  for (const n of noteIdByActivity.values()) allNoteIds.add(n);
  for (const members of membersByActivity.values()) {
    for (const n of members) allNoteIds.add(n);
  }

  const [progressRes, noteStateRes, lastActiveByStudent, nudgedByEnrolment] =
    await Promise.all([
    progressActivityIds.length
      ? supabase
          .from('nclex_student_activity_progress')
          .select('student_id, activity_id, completed_at')
          .in('activity_id', progressActivityIds)
      : Promise.resolve({ data: [] as ProgressRow[] }),
    allNoteIds.size
      ? supabase
          .from('nclex_library_note_state')
          .select('student_id, note_id, marked_done_at')
          .in('note_id', [...allNoteIds])
      : Promise.resolve({ data: [] as NoteStateRow[] }),
    // ⭐ The SAME SQL function the nightly inactivity sweep calls, so the
    // "Stalled" pill on this page and the email that chases the student
    // cannot describe different people.
    getProgrammeLastActive(supabase, programmeId),
    getProgrammeNudgeHistory(supabase, programmeId),
  ]);

  const progressDone = new Map<string, string>();
  for (const r of (progressRes.data ?? []) as ProgressRow[]) {
    if (!studentIdSet.has(r.student_id)) continue;
    progressDone.set(`${r.student_id}|${r.activity_id}`, r.completed_at);
  }
  const noteDone = new Map<string, string>();
  for (const r of (noteStateRes.data ?? []) as NoteStateRow[]) {
    if (!studentIdSet.has(r.student_id) || r.marked_done_at == null) continue;
    noteDone.set(`${r.student_id}|${r.note_id}`, r.marked_done_at);
  }

  function doneFor(studentId: string, a: VisibleActivity): string | null | false {
    if (PROGRESS_TYPES.has(a.type)) {
      return progressDone.get(`${studentId}|${a.activityId}`) ?? false;
    }
    if (a.type === 'LIBRARY_NOTE') {
      const noteId = noteIdByActivity.get(a.activityId);
      if (!noteId) return false;
      return noteDone.get(`${studentId}|${noteId}`) ?? false;
    }
    if (a.type === 'SHELF') {
      const members = membersByActivity.get(a.activityId) ?? [];
      if (members.length === 0) return false; // an empty shelf is never "done"
      let latest = '';
      for (const noteId of members) {
        const ts = noteDone.get(`${studentId}|${noteId}`);
        if (!ts) return false; // a member not done → shelf not done
        if (ts > latest) latest = ts;
      }
      return latest || null;
    }
    return false;
  }

  // ── Per-student + per-activity rollups ─────────────────────────────────
  const totalCount = visible.length;
  const activityDoneCount = new Map<string, number>();
  const studentRows: StudentAnalyticsRow[] = [];
  const allDoneTimestamps: string[] = [];

  for (const s of students) {
    let doneAll = 0;
    const doneAt: Record<string, string | null> = {};

    for (const a of visible) {
      const res = doneFor(s.user_id, a);
      if (res === false) continue;
      doneAll += 1;
      doneAt[a.activityId] = res;
      if (typeof res === 'string') allDoneTimestamps.push(res);
      activityDoneCount.set(
        a.activityId,
        (activityDoneCount.get(a.activityId) ?? 0) + 1,
      );
    }

    // ⭐ One definition, computed in SQL, shared with the nightly sweep. It
    // already fuses completions, note completions and quiz-attempt
    // heartbeats — a student halfway through a sitting they never submitted
    // has completed nothing and is plainly not stalled, and completion alone
    // cannot tell them apart from somebody who left in March.
    const engagedTs = lastActiveByStudent.get(s.user_id) ?? null;
    const lastActiveDays = engagedTs == null ? null : daysSince(engagedTs, nowMs);

    const nudgedTs = nudgedByEnrolment.get(s.enrolment_id) ?? null;

    const completionPct = totalCount ? Math.round((doneAll / totalCount) * 100) : 0;
    const joinedDays = Math.max(
      0,
      Math.floor((nowMs - new Date(s.enrolled_at).getTime()) / DAY_MS),
    );
    const expiresAt = accessByStudent.get(s.user_id) ?? null;
    const accessDaysLeft =
      expiresAt == null
        ? null
        : Math.max(0, Math.ceil((new Date(expiresAt).getTime() - nowMs) / DAY_MS));
    const engagement = classifyEngagement(lastActiveDays, doneAll, totalCount);

    studentRows.push({
      userId: s.user_id,
      name: s.name,
      email: s.email,
      doneCount: doneAll,
      // No released/locked split here, so both denominators are the whole
      // curriculum and the two percentages are the same number.
      releasedCount: totalCount,
      completionPct,
      programmePct: completionPct,
      // Kept for shape compatibility; the self-paced view never reads it.
      status: 'notstarted',
      engagement,
      joinedDays,
      accessDaysLeft,
      endingSoon:
        accessDaysLeft != null &&
        accessDaysLeft <= ACCESS_SOON_DAYS &&
        engagement !== 'done',
      lastActiveDays,
      lastNudgedDays: nudgedTs == null ? null : daysSince(nudgedTs, nowMs),
      doneAt,
    });
  }

  const studentCount = students.length;
  const activities: ActivityAnalyticsRow[] = visible.map((a) => {
    const doneC = activityDoneCount.get(a.activityId) ?? 0;
    return {
      activityId: a.activityId,
      title: a.title,
      type: a.type,
      quizId: a.quizId,
      unitIndex: a.unitIndex,
      unitTitle: a.unitTitle,
      released: true, // self-paced unlocks everything on day one
      doneCount: doneC,
      total: studentCount,
      pct: studentCount ? Math.round((doneC / studentCount) * 100) : 0,
    };
  });

  // ── Summary ────────────────────────────────────────────────────────────
  const engagementBuckets: Record<EngagementStatus, number> = {
    notstarted: 0,
    active: 0,
    stalled: 0,
    done: 0,
  };
  for (const r of studentRows) {
    if (r.engagement) engagementBuckets[r.engagement] += 1;
  }
  const avgCompletion = studentCount
    ? Math.round(
        studentRows.reduce((acc, r) => acc + r.completionPct, 0) / studentCount,
      )
    : 0;
  const stale = studentRows.filter(
    (r) => r.lastActiveDays != null && r.lastActiveDays >= 7,
  ).length;
  const endingSoon = studentRows.filter((r) => r.endingSoon).length;

  // ── Quiz performance (only when the page asks for it) ──────────────────
  let performance: CohortQuizPerformance | null = null;
  if (opts.includePerformance) {
    const quizDefs = new Map<
      string,
      {
        quizId: string;
        title: string;
        type: 'MOCK' | 'PRACTICE_QUIZ';
        unitIndex: number;
      }
    >();
    const activityToQuiz = new Map<string, string>();
    for (const a of activities) {
      if (!a.quizId) continue;
      if (a.type !== 'MOCK' && a.type !== 'PRACTICE_QUIZ') continue;
      activityToQuiz.set(a.activityId, a.quizId);
      if (!quizDefs.has(a.quizId)) {
        quizDefs.set(a.quizId, {
          quizId: a.quizId,
          title: a.title,
          type: a.type,
          unitIndex: a.unitIndex,
        });
      }
    }
    performance = await computePerformance(
      supabase,
      programmeId,
      studentIds,
      [...quizDefs.values()],
      activityToQuiz,
    );
  }

  return {
    mode: 'SELF_PACED',
    meta: {
      // No cohort to name — the programme IS the delivery unit.
      cohortName: programme.title,
      programmeTitle: programme.title,
      unitLabel: programme.unit_label,
      // ⚠ 0, not 1. Unit indexes are 1-based, so this can never match one —
      // which is exactly the point: there is no "current week" when every
      // student is on their own clock, and the view's "this week" band must
      // never light up.
      currentUnit: 0,
      totalUnits:
        programme.length_units ||
        units.reduce((mx, u) => Math.max(mx, u.unit_index), 0) ||
        1,
      releasedCount: totalCount,
      totalCount,
    },
    summary: {
      studentCount,
      avgCompletion,
      // The cohort pace buckets are meaningless here; engagement replaces
      // them. Zeroed rather than omitted so the payload keeps one shape.
      buckets: { ontrack: 0, behind: 0, risk: 0, notstarted: 0 },
      stale,
      engagement: engagementBuckets,
      endingSoon,
    },
    students: studentRows,
    activities,
    completionTrend: rollingTrend(allDoneTimestamps, nowMs),
    performance,
  };
}
