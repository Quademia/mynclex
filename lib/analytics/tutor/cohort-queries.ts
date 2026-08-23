// mynclex/lib/analytics/tutor/cohort-queries.ts
//
// Cohort analytics — Phase 1 (completion). Assembles the cohort's effective
// curriculum (included + student-visible activities, with release state),
// reads completion across the activity types — including live sessions,
// which fold in per-student via held + tutor-marked attendance (Slice 4) —
// and derives the per-student and per-activity rollups the dashboard renders.
//
// Completion has three sources, fused here into one done/not-done grid:
//   • 6 "normal" types  → a row in nclex_student_activity_progress
//                         (tutor reads all students' rows via the
//                          *_tutor_read RLS policy — progress-engine.md §6.2).
//   • LIBRARY_NOTE       → nclex_library_note_state.marked_done_at for the
//                          attached note (tutor read added in migration
//                          20260627120000).
//   • SHELF              → rolls up: done when every non-skipped member note
//                          is marked done (same note_state source).
//
// All roll-ups are derived at read time (no cached aggregates — §1/§7).
// Returns null when the cohort isn't readable/owned (page → 404), mirroring
// getCohortRoster / getCohortForShell.

import { createClient } from '@/lib/supabase/server';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { getCohortForShell } from '@/lib/cohorts/queries';
import { getCohortRoster } from '@/lib/enrolments/queries';
import { isVisibleToStudents, activityOpenState } from '@/lib/curriculum/format';
import type { ActivityType } from '@/lib/curriculum/types';
import type { AttendanceStatus } from '@/lib/cohorts/attendance-format';
import type {
  ActivityAnalyticsRow,
  CohortAnalytics,
  CohortQuizPerformance,
  CompletionStatus,
  QuestionMissRate,
  QuizPerfRow,
  StudentAnalyticsRow,
  StudentQuizPerf,
} from './types';

// The progress-engine types counted in completion via a progress row.
// LIBRARY_NOTE and SHELF are derived from note-state; ONLINE_LIVE_SESSION
// is derived from tutor-marked attendance (Slice 4 — held + marked folds
// into the per-student denominator). All three are handled separately
// below, so ONLINE_LIVE_SESSION is intentionally absent from this set.
// See docs/product-plan/live-session-planner.md.
const PROGRESS_TYPES = new Set<ActivityType>([
  'TEXT',
  'PDF',
  'EXTERNAL_LINK',
  'MOCK',
  'PRACTICE_QUIZ',
]);

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// Balanced thresholds (CD handoff) — shipped hardcoded, no UI control in v1.
function classify(pct: number, doneReleased: number): CompletionStatus {
  if (doneReleased === 0) return 'notstarted';
  if (pct >= 75) return 'ontrack';
  if (pct >= 40) return 'behind';
  return 'risk';
}

interface VisibleActivity {
  activityId: string;
  type: ActivityType;
  title: string;
  /** Quiz this activity launches (MOCK / PRACTICE_QUIZ payload quiz_id). */
  quizId: string | null;
  unitId: string;
  unitIndex: number;
  unitTitle: string;
  ordinal: number;
  released: boolean;
}

// Live-session markers fold into completion per-student (held + marked),
// so they're kept out of the uniform `visible` denominator and handled
// separately. See live-session-planner.md (Slice 4 — attendance into %).
interface LiveVisibleActivity {
  activityId: string;
  title: string;
  unitIndex: number;
  unitTitle: string;
  ordinal: number;
  typicalMinutes: number | null;
}

const LIVE_SESSION_DEFAULT_MIN = 90;

function typicalDurationOf(payload: unknown): number | null {
  if (payload && typeof payload === 'object') {
    const v = (payload as Record<string, unknown>).typical_duration_minutes;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

// Pull the quiz_id out of a quiz activity's payload (jsonb).
function quizIdOf(type: ActivityType, payload: unknown): string | null {
  if (type !== 'MOCK' && type !== 'PRACTICE_QUIZ') return null;
  if (payload && typeof payload === 'object') {
    const q = (payload as Record<string, unknown>).quiz_id;
    if (typeof q === 'string') return q;
  }
  return null;
}

/**
 * Full cohort completion analytics for the Analytics tab. Returns null if
 * the cohort isn't owned/readable by the caller.
 */
export async function getCohortAnalytics(
  cohortId: string,
  opts: { includePerformance?: boolean } = {},
): Promise<CohortAnalytics | null> {
  const ctx = await getCohortForShell(cohortId);
  if (!ctx) return null;

  const roster = await getCohortRoster(cohortId);
  if (roster === null) return null;

  // The counted class = actively ENROLLED students. (PAUSED / pending /
  // terminal are excluded — pace expectations don't apply to them.)
  const students = roster.filter((r) => r.status === 'ENROLLED');
  const studentIds = students.map((s) => s.user_id);
  const studentIdSet = new Set(studentIds);

  const supabase = await createClient();
  const programmeId = ctx.cohort.programme_id;

  // ── Effective curriculum: units, blocks, checklist→activities ──────────
  const [unitsRes, blocksRes, rowsRes] = await Promise.all([
    supabase
      .from('nclex_programme_units')
      .select('unit_id, unit_index, title, is_published')
      .eq('programme_id', programmeId)
      .order('unit_index', { ascending: true }),
    supabase
      .from('nclex_programme_blocks')
      .select(
        'block_id, is_published, nclex_programme_units!inner(programme_id)',
      )
      .eq('nclex_programme_units.programme_id', programmeId),
    supabase
      .from('nclex_cohort_checklist_items')
      .select(
        `is_included, release_date, close_date,
         nclex_programme_activities!inner(
           activity_id, unit_id, block_id, ordinal, type, title, is_published, payload
         )`,
      )
      .eq('cohort_id', cohortId),
  ]);

  const units = (unitsRes.data ?? []) as Array<{
    unit_id: string;
    unit_index: number;
    title: string;
    is_published: boolean;
  }>;
  const unitById = new Map(units.map((u) => [u.unit_id, u]));
  const blocks = (blocksRes.data ?? []) as Array<{
    block_id: string;
    is_published: boolean;
  }>;
  const blockPublishedById = new Map(
    blocks.map((b) => [b.block_id, b.is_published]),
  );

  type ActEmbed = {
    activity_id: string;
    unit_id: string;
    block_id: string | null;
    ordinal: number;
    type: ActivityType;
    title: string;
    is_published: boolean;
    payload: unknown;
  };
  const rawRows = (rowsRes.data ?? []) as Array<{
    is_included: boolean;
    release_date: string;
    close_date: string | null;
    nclex_programme_activities: ActEmbed | ActEmbed[];
  }>;

  const visible: VisibleActivity[] = [];
  const liveVisible: LiveVisibleActivity[] = [];
  for (const r of rawRows) {
    const a = Array.isArray(r.nclex_programme_activities)
      ? r.nclex_programme_activities[0]
      : r.nclex_programme_activities;
    if (!a) continue;
    const unit = unitById.get(a.unit_id);
    if (!unit) continue;
    const blockPublished =
      a.block_id === null
        ? null
        : blockPublishedById.get(a.block_id) ?? false;
    if (
      !isVisibleToStudents({
        programmeStatus: 'PUBLISHED',
        unitPublished: unit.is_published,
        blockPublished,
        activityPublished: a.is_published,
        cohortIncluded: r.is_included,
      })
    ) {
      continue;
    }
    // Live sessions fold into completion per-student (held + marked) — kept
    // out of the uniform `visible` denominator and added in the rollup below.
    if (a.type === 'ONLINE_LIVE_SESSION') {
      liveVisible.push({
        activityId: a.activity_id,
        title: a.title,
        unitIndex: unit.unit_index,
        unitTitle: unit.title,
        ordinal: a.ordinal,
        typicalMinutes: typicalDurationOf(a.payload),
      });
      continue;
    }
    const released = activityOpenState(r.release_date, r.close_date) !== 'LOCKED';
    visible.push({
      activityId: a.activity_id,
      type: a.type,
      title: a.title,
      quizId: quizIdOf(a.type, a.payload),
      unitId: a.unit_id,
      unitIndex: unit.unit_index,
      unitTitle: unit.title,
      ordinal: a.ordinal,
      released,
    });
  }

  // ── Resolve note / shelf pointers for the derived types ────────────────
  const noteActivityIds = visible
    .filter((a) => a.type === 'LIBRARY_NOTE')
    .map((a) => a.activityId);
  const shelfActivityIds = visible
    .filter((a) => a.type === 'SHELF')
    .map((a) => a.activityId);

  const noteIdByActivity = new Map<string, string>();
  const shelfByActivity = new Map<
    string,
    { shelfId: string; skipped: Set<string> }
  >();

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

  // Shelf members (the tutor's own notes) per shelf.
  const membersByActivity = new Map<string, string[]>();
  const shelfIds = [...shelfByActivity.values()].map((v) => v.shelfId);
  if (shelfIds.length) {
    const { data: members } = await supabase
      .from('nclex_tutor_library_shelf_memberships')
      .select('shelf_id, note_id')
      .in('shelf_id', shelfIds);
    const byShelf = new Map<string, string[]>();
    for (const m of (members ?? []) as Array<{
      shelf_id: string;
      note_id: string;
    }>) {
      const arr = byShelf.get(m.shelf_id) ?? [];
      arr.push(m.note_id);
      byShelf.set(m.shelf_id, arr);
    }
    for (const [activityId, { shelfId, skipped }] of shelfByActivity) {
      const memberNotes = (byShelf.get(shelfId) ?? []).filter(
        (n) => !skipped.has(n),
      );
      membersByActivity.set(activityId, memberNotes);
    }
  }

  // ── Completion reads ───────────────────────────────────────────────────
  // Progress rows (6 types). RLS *_tutor_read returns every student's rows
  // for the tutor's activities; we scope to this cohort's roster in JS.
  const progressActivityIds = visible
    .filter((a) => PROGRESS_TYPES.has(a.type))
    .map((a) => a.activityId);

  // All note ids whose state we need (library notes + shelf members).
  const allNoteIds = new Set<string>();
  for (const n of noteIdByActivity.values()) allNoteIds.add(n);
  for (const members of membersByActivity.values())
    for (const n of members) allNoteIds.add(n);

  const [progressRes, noteStateRes] = await Promise.all([
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
  ]);

  // (student|activity) → completed_at, for the 6 progress types.
  const progressDone = new Map<string, string>();
  for (const r of (progressRes.data ?? []) as ProgressRow[]) {
    if (!studentIdSet.has(r.student_id)) continue;
    progressDone.set(`${r.student_id}|${r.activity_id}`, r.completed_at);
  }
  // (student|note) → marked_done_at (only "done" rows).
  const noteDone = new Map<string, string>();
  for (const r of (noteStateRes.data ?? []) as NoteStateRow[]) {
    if (!studentIdSet.has(r.student_id) || r.marked_done_at == null) continue;
    noteDone.set(`${r.student_id}|${r.note_id}`, r.marked_done_at);
  }

  // ── Live-session attendance (Slice 4 — attendance into the %) ───────────
  // held state per marker + each student's PRESENT/ABSENT/EXCUSED. Bridges
  // attendance (keyed by the planner session) to the marker via the
  // planner's marker_activity_id; the tutor reads both via their own RLS.
  const liveHeldByActivity = new Map<string, boolean>();
  const liveStatus = new Map<string, AttendanceStatus>(); // `${student}|${activityId}`
  if (liveVisible.length > 0) {
    const liveIds = liveVisible.map((l) => l.activityId);
    const typicalById = new Map(
      liveVisible.map((l) => [l.activityId, l.typicalMinutes]),
    );
    const { data: plannerRows } = await supabase
      .from('nclex_cohort_live_sessions')
      .select('session_id, marker_activity_id, scheduled_at, duration_minutes')
      .eq('cohort_id', cohortId)
      .in('marker_activity_id', liveIds);

    const markerBySession = new Map<string, string>();
    const sessionIds: string[] = [];
    const nowMs = Date.now();
    for (const p of (plannerRows ?? []) as Array<{
      session_id: string;
      marker_activity_id: string;
      scheduled_at: string | null;
      duration_minutes: number | null;
    }>) {
      markerBySession.set(p.session_id, p.marker_activity_id);
      sessionIds.push(p.session_id);
      const start = p.scheduled_at ? new Date(p.scheduled_at).getTime() : NaN;
      const dur =
        p.duration_minutes ??
        typicalById.get(p.marker_activity_id) ??
        LIVE_SESSION_DEFAULT_MIN;
      if (!Number.isNaN(start) && start + dur * 60_000 < nowMs) {
        liveHeldByActivity.set(p.marker_activity_id, true);
      }
    }

    if (sessionIds.length > 0) {
      const { data: attRows } = await supabase
        .from('nclex_cohort_session_attendance')
        .select('session_id, student_id, status')
        .in('session_id', sessionIds);
      for (const r of (attRows ?? []) as Array<{
        session_id: string;
        student_id: string;
        status: AttendanceStatus;
      }>) {
        if (!studentIdSet.has(r.student_id)) continue;
        const marker = markerBySession.get(r.session_id);
        if (marker) liveStatus.set(`${r.student_id}|${marker}`, r.status);
      }
    }
  }

  // Resolve done + timestamp for one (student, activity) across all sources.
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
      if (members.length === 0) return false; // empty shelf is never "done"
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

  // ── Per-student + per-activity rollups in one pass ─────────────────────
  const releasedActivities = visible.filter((a) => a.released);
  const releasedCount = releasedActivities.length;
  const totalCount = visible.length;

  const activityDoneCount = new Map<string, number>(); // activityId → done
  const studentRows: StudentAnalyticsRow[] = [];
  const allDoneTimestamps: string[] = [];

  for (const s of students) {
    let doneReleased = 0;
    let doneAll = 0;
    let lastTs: string | null = null;
    const doneAt: Record<string, string | null> = {};

    for (const a of visible) {
      const res = doneFor(s.user_id, a);
      if (res === false) continue;
      // done
      doneAll += 1;
      doneAt[a.activityId] = res; // string | null
      if (typeof res === 'string') {
        allDoneTimestamps.push(res);
        if (!lastTs || res > lastTs) lastTs = res;
      }
      if (a.released) {
        doneReleased += 1;
        activityDoneCount.set(
          a.activityId,
          (activityDoneCount.get(a.activityId) ?? 0) + 1,
        );
      }
    }

    // Live sessions (Slice 4) — held + marked fold into the denominator
    // per-student: PRESENT counts done, ABSENT counts toward the denominator
    // only, EXCUSED / not-yet-held / unmarked are excluded (never drag down).
    let liveDenom = 0;
    let liveDone = 0;
    for (const ls of liveVisible) {
      if (!liveHeldByActivity.get(ls.activityId)) continue;
      const st = liveStatus.get(`${s.user_id}|${ls.activityId}`);
      if (st === 'PRESENT') {
        liveDenom += 1;
        liveDone += 1;
        doneAt[ls.activityId] = null;
        activityDoneCount.set(
          ls.activityId,
          (activityDoneCount.get(ls.activityId) ?? 0) + 1,
        );
      } else if (st === 'ABSENT') {
        liveDenom += 1;
      }
    }

    const denom = releasedCount + liveDenom;
    const doneCount = doneReleased + liveDone;
    const completionPct = denom ? Math.round((doneCount / denom) * 100) : 0;
    const programmePct = totalCount
      ? Math.round((doneAll / totalCount) * 100)
      : 0;
    const lastActiveDays =
      lastTs == null
        ? null
        : Math.max(0, Math.floor((Date.now() - new Date(lastTs).getTime()) / DAY_MS));

    studentRows.push({
      userId: s.user_id,
      name: s.name,
      email: s.email,
      doneCount,
      releasedCount: denom,
      completionPct,
      programmePct,
      status: classify(completionPct, doneCount),
      // Self-paced-only fields. A cohort paces against its own calendar,
      // so it has no use for a per-student join date or access clock.
      engagement: null,
      joinedDays: null,
      accessDaysLeft: null,
      endingSoon: false,
      lastActiveDays,
      doneAt,
    });
  }

  // ── Per-activity rows (week-banded by unit) ────────────────────────────
  // Normal + live activities interleaved in curriculum order. A live row's
  // doneCount = students marked PRESENT; total = class size (so it reads as
  // an attendance rate); released = held.
  const studentCount = students.length;
  type ActSortable =
    | { kind: 'normal'; unitIndex: number; ordinal: number; a: VisibleActivity }
    | { kind: 'live'; unitIndex: number; ordinal: number; l: LiveVisibleActivity };
  const actSortables: ActSortable[] = [
    ...visible.map((a) => ({
      kind: 'normal' as const,
      unitIndex: a.unitIndex,
      ordinal: a.ordinal,
      a,
    })),
    ...liveVisible.map((l) => ({
      kind: 'live' as const,
      unitIndex: l.unitIndex,
      ordinal: l.ordinal,
      l,
    })),
  ].sort((x, y) => x.unitIndex - y.unitIndex || x.ordinal - y.ordinal);

  const activities: ActivityAnalyticsRow[] = actSortables.map((e) => {
    if (e.kind === 'normal') {
      const a = e.a;
      const doneC = activityDoneCount.get(a.activityId) ?? 0;
      return {
        activityId: a.activityId,
        title: a.title,
        type: a.type,
        quizId: a.quizId,
        unitIndex: a.unitIndex,
        unitTitle: a.unitTitle,
        released: a.released,
        doneCount: doneC,
        total: studentCount,
        pct: studentCount ? Math.round((doneC / studentCount) * 100) : 0,
      };
    }
    const l = e.l;
    const doneC = activityDoneCount.get(l.activityId) ?? 0;
    return {
      activityId: l.activityId,
      title: l.title,
      type: 'ONLINE_LIVE_SESSION' as ActivityType,
      quizId: null,
      unitIndex: l.unitIndex,
      unitTitle: l.unitTitle,
      released: liveHeldByActivity.get(l.activityId) ?? false,
      doneCount: doneC,
      total: studentCount,
      pct: studentCount ? Math.round((doneC / studentCount) * 100) : 0,
    };
  });

  // ── Summary + headline figures ─────────────────────────────────────────
  const buckets: Record<CompletionStatus, number> = {
    ontrack: 0,
    behind: 0,
    risk: 0,
    notstarted: 0,
  };
  for (const r of studentRows) buckets[r.status] += 1;
  const avgCompletion = studentCount
    ? Math.round(
        studentRows.reduce((acc, r) => acc + r.completionPct, 0) / studentCount,
      )
    : 0;
  const stale = studentRows.filter(
    (r) => r.lastActiveDays != null && r.lastActiveDays >= 7,
  ).length;

  const currentUnit = releasedActivities.reduce(
    (mx, a) => Math.max(mx, a.unitIndex),
    0,
  ) || 1;
  const totalUnits =
    ctx.programme.length_units ||
    units.reduce((mx, u) => Math.max(mx, u.unit_index), 0) ||
    1;

  // ── Phase 2 — quiz performance (only when the tab asks for it) ─────────
  // Quizzes are keyed by quiz_id, deduped across activities (the same quiz
  // can be placed as more than one activity). Representative title/unit =
  // the first released quiz activity referencing it, in curriculum order.
  let performance: CohortQuizPerformance | null = null;
  if (opts.includePerformance) {
    const quizDefs = new Map<string, QuizDef>();
    // activity_id → quiz_id, so activity-launched attempts (which carry only
    // programme_activity_id) resolve to their quiz.
    const activityToQuiz = new Map<string, string>();
    for (const a of activities) {
      if (!a.released || !a.quizId) continue;
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
      ctx.cohort.programme_id,
      studentIds,
      [...quizDefs.values()],
      activityToQuiz,
    );
  }

  return {
    mode: 'COHORT',
    meta: {
      cohortName: ctx.cohort.name ?? formatRange(ctx.cohort.start_date, ctx.cohort.end_date),
      programmeTitle: ctx.programme.title,
      unitLabel: ctx.programme.unit_label,
      currentUnit,
      totalUnits,
      releasedCount,
      totalCount,
    },
    summary: {
      studentCount,
      avgCompletion,
      buckets,
      stale,
      engagement: null,
      endingSoon: null,
    },
    students: studentRows,
    activities,
    completionTrend: weeklyTrend(allDoneTimestamps, ctx.cohort.start_date, totalUnits),
    performance,
  };
}

interface QuizDef {
  quizId: string;
  title: string;
  type: 'MOCK' | 'PRACTICE_QUIZ';
  unitIndex: number;
}

// ── Phase 2 — quiz performance computation ───────────────────────────────
// Reads terminal (scored) PROGRAMME_ASSIGNED attempts for the cohort's quizzes
// (tutor reads them via the *_tutor_read policy from migration 20260628120000),
// then derives per-quiz + per-student standing from each student's BEST attempt
// per quiz (answers "have they demonstrated a pass"). Keyed by quiz_id — which
// every attempt carries — so it captures both activity-launched and standalone
// attempts, and treats a quiz placed as several activities as one quiz.
export async function computePerformance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programmeId: string,
  studentIds: string[],
  quizDefs: QuizDef[],
  activityToQuiz: Map<string, string>,
): Promise<CohortQuizPerformance> {
  const empty: CohortQuizPerformance = {
    quizzes: [],
    byStudent: {},
    missRates: [],
    summary: { avgQuizScore: null, passRate: null, attempts: 0, passes: 0, perfRisk: 0 },
  };
  const quizIds = quizDefs.map((q) => q.quizId);
  if (quizIds.length === 0 || studentIds.length === 0) return empty;
  const studentIdSet = new Set(studentIds);
  const activityIds = [...activityToQuiz.keys()];

  type AttRow = {
    attempt_id: string;
    student_id: string;
    programme_activity_id: string | null;
    quiz_id: string | null;
    final_score: number | null;
    pass_score: number | null;
    ended_at: string | null;
    status: string;
  };

  // PROGRAMME_ASSIGNED attempts come in two mutually-exclusive shapes
  // (nclex_attempts_source_refs) — read both, then map each to its quiz.
  const cols =
    'attempt_id, student_id, programme_activity_id, quiz_id, final_score, pass_score, ended_at, status';
  const [actRes, standaloneRes] = await Promise.all([
    activityIds.length
      ? supabase
          .from('nclex_attempts')
          .select(cols)
          .in('programme_activity_id', activityIds)
          .in('status', ['COMPLETED', 'TIMED_OUT'])
      : Promise.resolve({ data: [] as AttRow[] }),
    supabase
      .from('nclex_attempts')
      .select(cols)
      .eq('programme_id', programmeId)
      .in('quiz_id', quizIds)
      .in('status', ['COMPLETED', 'TIMED_OUT']),
  ]);

  type BestEntry = { score: number; passScore: number | null; attemptId: string };
  // best[student|quiz] = the highest-scoring terminal attempt.
  const best = new Map<string, BestEntry>();
  // latest[student] = the student's most recent terminal attempt (any quiz).
  const latest = new Map<string, { score: number; passScore: number | null; endedAt: string }>();

  const ingest = (rows: AttRow[]) => {
    for (const r of rows) {
      if (!studentIdSet.has(r.student_id)) continue;
      if (r.final_score == null) continue;
      // Resolve the quiz: standalone carries quiz_id; activity-launched
      // resolves through its activity.
      const quizId =
        r.quiz_id ??
        (r.programme_activity_id ? activityToQuiz.get(r.programme_activity_id) ?? null : null);
      if (!quizId) continue;
      const score = r.final_score;
      const bk = `${r.student_id}|${quizId}`;
      const prevBest = best.get(bk);
      if (!prevBest || score > prevBest.score) {
        best.set(bk, { score, passScore: r.pass_score, attemptId: r.attempt_id });
      }
      const endedAt = r.ended_at ?? '';
      const prevLatest = latest.get(r.student_id);
      if (!prevLatest || endedAt > prevLatest.endedAt) {
        latest.set(r.student_id, { score, passScore: r.pass_score, endedAt });
      }
    }
  };
  ingest((actRes.data ?? []) as AttRow[]);
  ingest((standaloneRes.data ?? []) as AttRow[]);

  // attempt_id → quiz_id for the best attempts (the per-question miss-rate
  // 2b signal reads each student's best attempt's answers).
  const attemptToQuizId = new Map<string, string>();
  for (const [key, entry] of best) {
    const quizId = key.slice(key.indexOf('|') + 1);
    attemptToQuizId.set(entry.attemptId, quizId);
  }

  const pct = (frac: number) => Math.round(frac * 100);
  const passedOf = (score: number, passScore: number | null) =>
    passScore != null && score >= passScore;

  // Per-quiz rows.
  const quizzes: QuizPerfRow[] = quizDefs.map((q) => {
    const entries = studentIds
      .map((sid) => best.get(`${sid}|${q.quizId}`))
      .filter((e): e is BestEntry => !!e);
    const attempted = entries.length;
    const graded = entries.some((e) => e.passScore != null);
    const passed = entries.filter((e) => passedOf(e.score, e.passScore)).length;
    const avgScore = attempted
      ? pct(entries.reduce((a, e) => a + e.score, 0) / attempted)
      : 0;
    return {
      quizId: q.quizId,
      title: q.title,
      type: q.type,
      unitIndex: q.unitIndex,
      attempted,
      passed,
      passRate: graded && attempted ? Math.round((passed / attempted) * 100) : null,
      avgScore,
      graded,
    };
  });

  // Per-student standing.
  const byStudent: Record<string, StudentQuizPerf> = {};
  for (const sid of studentIds) {
    const bestScores: number[] = [];
    const scores: Record<string, { score: number; pass: boolean | null }> = {};
    for (const q of quizDefs) {
      const e = best.get(`${sid}|${q.quizId}`);
      if (e) {
        bestScores.push(e.score);
        scores[q.quizId] = {
          score: pct(e.score),
          pass: e.passScore != null ? passedOf(e.score, e.passScore) : null,
        };
      }
    }
    const lt = latest.get(sid);
    byStudent[sid] = {
      avgScore: bestScores.length
        ? pct(bestScores.reduce((a, b) => a + b, 0) / bestScores.length)
        : null,
      latestScore: lt ? pct(lt.score) : null,
      latestPass: lt && lt.passScore != null ? passedOf(lt.score, lt.passScore) : null,
      failedLatest: !!lt && lt.passScore != null && !passedOf(lt.score, lt.passScore),
      scores,
    };
  }

  // Cohort summary — over every best (student × quiz) entry.
  const allBest = [...best.values()];
  const attempts = allBest.length;
  const gradedBest = allBest.filter((e) => e.passScore != null);
  const passes = gradedBest.filter((e) => passedOf(e.score, e.passScore)).length;
  const avgQuizScore = attempts
    ? pct(allBest.reduce((a, e) => a + e.score, 0) / attempts)
    : null;
  const perfRisk = Object.values(byStudent).filter((p) => p.failedLatest).length;

  // Per-question miss-rate (2b) — from each student's best attempt's answers.
  const quizTitleById = new Map(quizDefs.map((q) => [q.quizId, q.title]));
  const missRates = await computeMissRates(
    supabase,
    [...attemptToQuizId.keys()],
    attemptToQuizId,
    quizTitleById,
  );

  return {
    quizzes,
    byStudent,
    missRates,
    summary: {
      avgQuizScore,
      passRate: gradedBest.length ? Math.round((passes / gradedBest.length) * 100) : null,
      attempts,
      passes,
      perfRisk,
    },
  };
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

// skipped_note_ids / seen sets are JSONB — normalise (array or JSON string)
// to string[]. Mirrors the helper in lib/curriculum/student-queries.ts.
export function normalizeIds(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string');
}

// Weekly completion volume since cohort start — momentum sparkline. Buckets
// each completion timestamp into its week index from start. Bounded to the
// weeks elapsed so far (≥1), capped at the programme length.
function weeklyTrend(
  timestamps: string[],
  startDate: string,
  totalUnits: number,
): number[] {
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  if (Number.isNaN(startMs)) return [];
  const elapsed = Math.floor((Date.now() - startMs) / WEEK_MS) + 1;
  const len = Math.max(1, Math.min(totalUnits || elapsed, elapsed));
  const counts = new Array(len).fill(0) as number[];
  for (const ts of timestamps) {
    const wk = Math.floor((new Date(ts).getTime() - startMs) / WEEK_MS);
    if (wk >= 0 && wk < len) counts[wk] += 1;
  }
  return counts;
}

// ── Phase 2b — per-question miss-rate ("re-teach signal") ─────────────────
// For each student's best attempt per quiz, join its items (item_id = the
// question, stem_snapshot = its text) to its answers (is_correct), and
// aggregate per question across the cohort. Tutor reads items/answers via the
// *_tutor_read policies (migration 20260629120000). Returns the hardest
// questions cohort-wide, sorted by miss-rate, capped to a useful few.
async function computeMissRates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attemptIds: string[],
  attemptToQuizId: Map<string, string>,
  quizTitleById: Map<string, string>,
): Promise<QuestionMissRate[]> {
  if (attemptIds.length === 0) return [];

  type ItemRow = {
    attempt_item_id: string;
    attempt_id: string;
    item_id: string | null;
    stem_snapshot: string | null;
    question_type: string | null;
  };
  type AnswerRow = { attempt_item_id: string; is_correct: boolean | null };

  const [itemsRes, answersRes] = await Promise.all([
    supabase
      .from('nclex_attempt_items')
      .select('attempt_item_id, attempt_id, item_id, stem_snapshot, question_type')
      .in('attempt_id', attemptIds),
    supabase
      .from('nclex_attempt_answers')
      .select('attempt_item_id, is_correct')
      .in('attempt_id', attemptIds),
  ]);

  // attempt_item_id → is_correct (only graded answers).
  const correctByItem = new Map<string, boolean>();
  for (const a of (answersRes.data ?? []) as AnswerRow[]) {
    if (a.is_correct != null) correctByItem.set(a.attempt_item_id, a.is_correct);
  }

  // Aggregate per (quiz, question).
  type Agg = {
    itemId: string;
    stem: string;
    questionType: string;
    quizId: string;
    answered: number;
    wrong: number;
  };
  const agg = new Map<string, Agg>();
  for (const it of (itemsRes.data ?? []) as ItemRow[]) {
    if (!it.item_id) continue;
    const graded = correctByItem.get(it.attempt_item_id);
    if (graded === undefined) continue; // not answered/graded on this attempt
    const quizId = attemptToQuizId.get(it.attempt_id);
    if (!quizId) continue;
    const key = `${quizId}|${it.item_id}`;
    const row =
      agg.get(key) ??
      {
        itemId: it.item_id,
        stem: richTextToPlainLabel(it.stem_snapshot ?? '') || 'Untitled question',
        questionType: it.question_type ?? '',
        quizId,
        answered: 0,
        wrong: 0,
      };
    row.answered += 1;
    if (graded === false) row.wrong += 1;
    agg.set(key, row);
  }

  return [...agg.values()]
    .filter((r) => r.answered > 0 && r.wrong > 0)
    .map((r) => ({
      itemId: r.itemId,
      stem: r.stem,
      questionType: r.questionType,
      quizId: r.quizId,
      quizTitle: quizTitleById.get(r.quizId) ?? 'Quiz',
      answered: r.answered,
      wrong: r.wrong,
      missRate: Math.round((r.wrong / r.answered) * 100),
    }))
    .sort((a, b) => b.missRate - a.missRate || b.wrong - a.wrong)
    .slice(0, 12);
}

function formatRange(start: string, end: string): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  return `${f(start)} → ${f(end)}`;
}
