// mynclex/lib/home/student/overview-queries.ts
//
// Assembles the Student Overview (the programme/cohort home) from existing
// reads — no new tables, no migration. Everything is derived at read time
// from the same sources the other student surfaces already use:
//
//   • Headline progress + weeks + continue — the student curriculum tree
//     (lib/curriculum/student-queries). Overall % / activities done /
//     weeks done are aggregated from the unit rail; the "Pick up where you
//     left off" target reuses the tree's continueActivityId pointer.
//   • Next live session + attendance streak (cohort) — the student "My
//     sessions" read (lib/cohorts/student).
//   • Study streak (self-paced) — consecutive UTC days with ≥1 completed
//     activity in this programme, from the progress table's completed_at.
//
// Two entry points (one per route / delivery mode); a shared core builds
// the mode-agnostic fields. "Mode" is fixed by the route — see ./types.

import { createClient } from '@/lib/supabase/server';
import {
  getStudentSelfPacedCurriculum,
  getStudentCohortCurriculum,
} from '@/lib/curriculum/student-queries';
import { buildRail, activityTypeLabel } from '@/lib/curriculum/student-viewer';
import { ACTIVITY_TYPE_ICON, unitLabel } from '@/lib/curriculum/format';
import { getActivityProgressMap } from '@/lib/progress/queries';
import { getStudentCohortSessions } from '@/lib/cohorts/student/queries';
import {
  nextStudentSession,
  studentAttendanceRecord,
} from '@/lib/cohorts/student/sessions-format';
import type {
  StudentActivity,
  StudentCurriculumTree,
} from '@/lib/curriculum/types';
import type {
  OverviewContinue,
  OverviewStreak,
  StudentOverviewData,
} from './types';

const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────
// Public entry points (one per route / delivery mode)
// ─────────────────────────────────────────────────────────

/** Self-paced programme home. null → programme not readable (page 404s). */
export async function getStudentProgrammeOverview(
  programmeId: string,
): Promise<StudentOverviewData | null> {
  const tree = await getStudentSelfPacedCurriculum(programmeId);
  if (!tree) return null;

  const nowMs = Date.now();
  const [firstName, streak] = await Promise.all([
    readFirstName(),
    computeStudyStreak(tree, nowMs),
  ]);

  return {
    mode: 'self',
    ...coreFields(tree),
    firstName,
    heroStreak: streak.current,
    nextSession: null,
    studyStreak: streak,
    nowMs,
  };
}

/** Tutor-led cohort home. null → cohort not readable (page 404s). */
export async function getStudentCohortOverview(
  cohortId: string,
): Promise<StudentOverviewData | null> {
  const [tree, sessionsData] = await Promise.all([
    getStudentCohortCurriculum(cohortId),
    getStudentCohortSessions(cohortId),
  ]);
  if (!tree) return null;

  const nowMs = Date.now();
  const firstName = await readFirstName();
  const sessions = sessionsData?.sessions ?? [];
  const record = studentAttendanceRecord(sessions);
  const next = nextStudentSession(sessions, nowMs);

  return {
    mode: 'cohort',
    ...coreFields(tree),
    firstName,
    heroStreak: record.streak,
    nextSession: next
      ? {
          title: next.title,
          scheduledAt: next.scheduledAt,
          durationMinutes: next.durationMinutes,
          platform: next.platform,
          joinUrl: next.joinUrl,
        }
      : null,
    studyStreak: null,
    nowMs,
  };
}

// ─────────────────────────────────────────────────────────
// Shared core (mode-agnostic fields)
// ─────────────────────────────────────────────────────────

function coreFields(
  tree: StudentCurriculumTree,
): Omit<
  StudentOverviewData,
  | 'mode'
  | 'firstName'
  | 'heroStreak'
  | 'nextSession'
  | 'studyStreak'
  | 'nowMs'
> {
  const agg = aggregateProgress(tree);
  const basePath = tree.cohort
    ? `/student/cohort/${tree.cohort.cohort_id}`
    : `/student/programme/${tree.programme.programme_id}`;

  return {
    basePath,
    curriculumHref: `${basePath}/curriculum`,
    libraryBasePath: `${basePath}/library`,
    programmeTitle: tree.programme.title,
    cohortName: tree.cohort?.name ?? null,
    overallPct: agg.overallPct,
    activitiesDone: agg.done,
    activitiesTotal: agg.total,
    weeksDone: agg.weeksDone,
    weeksTotal: tree.units.length,
    unitNoun: tree.programme.unit_label === 'WEEK' ? 'week' : 'module',
    // "Your weeks" only earns its place with 2+ units; a single-unit
    // programme's lone row would just echo the hero ring. The curriculum
    // rail uses the same 2+ rule.
    weeks: tree.units.length >= 2 ? buildRail(tree) : [],
    continue: buildContinue(tree),
  };
}

// Fused headline numbers — sum the per-unit counts the curriculum already
// computed (live sessions fold in there per the verified-completion rule).
function aggregateProgress(tree: StudentCurriculumTree): {
  done: number;
  total: number;
  overallPct: number;
  weeksDone: number;
} {
  let done = 0;
  let total = 0;
  let weeksDone = 0;
  for (const u of tree.units) {
    done += u.progressDone;
    total += u.progressTotal;
    if (u.progressTotal > 0 && u.progressPct === 100) weeksDone += 1;
  }
  const overallPct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, overallPct, weeksDone };
}

// The "Pick up where you left off" target — resolve the tree's continue
// pointer to its activity + unit so the banner can launch it. null when
// there's nothing to do next (all done / nothing open).
function buildContinue(tree: StudentCurriculumTree): OverviewContinue | null {
  if (!tree.continueActivityId) return null;
  const hit = indexActivities(tree).get(tree.continueActivityId);
  if (!hit) return null;
  const { activity, unitIndex } = hit;
  return {
    activity,
    unitLabel: unitLabel(unitIndex, tree.programme.unit_label),
    typeLabel: activityTypeLabel(activity.type),
    icon: ACTIVITY_TYPE_ICON[activity.type],
    isResume: tree.continueIsResume,
  };
}

// Flatten the tree to activity_id → { activity, unitIndex } (loose +
// in-block, every unit).
function indexActivities(
  tree: StudentCurriculumTree,
): Map<string, { activity: StudentActivity; unitIndex: number }> {
  const map = new Map<string, { activity: StudentActivity; unitIndex: number }>();
  for (const u of tree.units) {
    for (const entry of u.body) {
      const acts = entry.kind === 'block' ? entry.activities : [entry.activity];
      for (const a of acts) {
        map.set(a.activity_id, { activity: a, unitIndex: u.unit.unit_index });
      }
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────
// Study streak (self-paced)
// ─────────────────────────────────────────────────────────

// Consecutive UTC days with ≥1 completed activity in this programme. UTC
// day buckets match the calendar day for the core audience (Ghana, UTC+0).
//
// v1 scope: counts completions in nclex_student_activity_progress (TEXT /
// PDF / link / quizzes). LIBRARY_NOTE / SHELF "done" lives elsewhere
// (note-state) and isn't folded in yet — a minor undercount for
// reading-heavy days; revisit if it matters.
async function computeStudyStreak(
  tree: StudentCurriculumTree,
  nowMs: number,
): Promise<OverviewStreak> {
  const ids: string[] = [];
  for (const u of tree.units) {
    for (const entry of u.body) {
      const acts = entry.kind === 'block' ? entry.activities : [entry.activity];
      for (const a of acts) {
        if (a.type !== 'ONLINE_LIVE_SESSION') ids.push(a.activity_id);
      }
    }
  }
  const map = await getActivityProgressMap(ids);
  const times: string[] = [];
  for (const row of map.values()) {
    if (row.completed_at) times.push(row.completed_at);
  }
  return studyStreak(times, nowMs);
}

// Pure: bucket completion timestamps into UTC day numbers, then derive the
// current run (held if the latest study day is today or yesterday — a day's
// grace so "haven't studied yet today" doesn't read as a broken streak) and
// the longest run ever.
function studyStreak(completedAtIso: string[], nowMs: number): OverviewStreak {
  const days = new Set<number>();
  for (const iso of completedAtIso) {
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) days.add(Math.floor(t / DAY_MS));
  }
  if (days.size === 0) return { current: 0, best: 0 };

  const sorted = [...days].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  const today = Math.floor(nowMs / DAY_MS);
  let cursor: number;
  if (days.has(today)) cursor = today;
  else if (days.has(today - 1)) cursor = today - 1;
  else return { current: 0, best };

  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { current, best };
}

// ─────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────

// Greeting forename from the caller's own profile row. '' when absent —
// the view falls back to a neutral "Welcome back".
async function readFirstName(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return '';
  const { data: prof } = await supabase
    .from('nclex_users')
    .select('forename')
    .eq('id', user.id)
    .maybeSingle();
  return (prof?.forename ?? '').trim();
}
