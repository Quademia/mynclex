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
import { getProgrammeHistoryAttempts } from '@/lib/practice/history/programme-queries';
import { getStudentProgrammeQuizzes } from '@/lib/student-quizzes/queries';
import { getStudentLibrarySnapshot } from '@/lib/library/student/queries';
import { getStudentLibraryHomeData } from '@/lib/library/student/home-queries';
import { studyStreak } from './streak';
import type { ProgrammeHistoryAttempt } from '@/lib/practice/history/programme-types';
import type { StudentQuizRow } from '@/lib/student-quizzes/types';
import type {
  ActivityProgressMap,
} from '@/lib/progress/types';
import type {
  StudentActivity,
  StudentCurriculumTree,
} from '@/lib/curriculum/types';
import type {
  OverviewContinue,
  OverviewLibrary,
  OverviewQuizzes,
  OverviewRecentItem,
  OverviewStreak,
  StudentOverviewData,
} from './types';

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
  const basePath = basePathFor(tree);
  const [firstName, progressMap, attempts, quizRows, library] =
    await Promise.all([
      readFirstName(),
      getActivityProgressMap(collectActivityIds(tree)),
      getProgrammeHistoryAttempts(programmeId),
      getStudentProgrammeQuizzes(programmeId),
      buildLibrary(programmeId, `${basePath}/library`),
    ]);

  const streak = studyStreakFromMap(progressMap, nowMs);

  return {
    mode: 'self',
    ...coreFields(tree),
    firstName,
    heroStreak: streak.current,
    nextSession: null,
    studyStreak: streak,
    recent: buildRecentActivity(tree, progressMap, attempts),
    quizzes: buildQuizzes(quizRows, attempts, basePath),
    library,
    attendance: null,
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
  const programmeId = tree.programme.programme_id;
  const basePath = basePathFor(tree);

  // Quiz / library / history reads scope to the PROGRAMME (attempts attach
  // to the template programme via the activity, not the cohort; the library
  // is tutor-keyed) — so the same programme-level helpers serve both modes.
  const [firstName, progressMap, attempts, quizRows, library] =
    await Promise.all([
      readFirstName(),
      getActivityProgressMap(collectActivityIds(tree)),
      getProgrammeHistoryAttempts(programmeId),
      getStudentProgrammeQuizzes(programmeId),
      buildLibrary(programmeId, `${basePath}/library`),
    ]);

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
    recent: buildRecentActivity(tree, progressMap, attempts),
    quizzes: buildQuizzes(quizRows, attempts, basePath),
    library,
    // The card only earns its place once the cohort actually has live
    // sessions; otherwise it would read "0 attended" forever.
    attendance:
      sessions.length > 0
        ? {
            attended: record.attended,
            held: record.held,
            streak: record.streak,
          }
        : null,
    nowMs,
  };
}

// ─────────────────────────────────────────────────────────
// Shared core (mode-agnostic fields)
// ─────────────────────────────────────────────────────────

// basePath for either delivery mode: /student/cohort/<id> (tutor-led) or
// /student/programme/<id> (self-paced).
function basePathFor(tree: StudentCurriculumTree): string {
  return tree.cohort
    ? `/student/cohort/${tree.cohort.cohort_id}`
    : `/student/programme/${tree.programme.programme_id}`;
}

function coreFields(
  tree: StudentCurriculumTree,
): Omit<
  StudentOverviewData,
  | 'mode'
  | 'firstName'
  | 'heroStreak'
  | 'nextSession'
  | 'studyStreak'
  | 'recent'
  | 'quizzes'
  | 'library'
  | 'attendance'
  | 'nowMs'
> {
  const agg = aggregateProgress(tree);
  const basePath = basePathFor(tree);

  return {
    basePath,
    curriculumHref: `${basePath}/curriculum`,
    libraryBasePath: `${basePath}/library`,
    quizHistoryHref: `${basePath}/history`,
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

// Every non-live activity id in the tree — the set whose progress rows we
// read once and reuse for both the study streak and the recent feed. Live
// sessions never get a progress row, so they're excluded.
function collectActivityIds(tree: StudentCurriculumTree): string[] {
  const ids: string[] = [];
  for (const u of tree.units) {
    for (const entry of u.body) {
      const acts = entry.kind === 'block' ? entry.activities : [entry.activity];
      for (const a of acts) {
        if (a.type !== 'ONLINE_LIVE_SESSION') ids.push(a.activity_id);
      }
    }
  }
  return ids;
}

// ─────────────────────────────────────────────────────────
// Study streak (self-paced)
// ─────────────────────────────────────────────────────────

// Consecutive UTC days with ≥1 completed activity in this programme, from
// an already-fetched progress map. UTC day buckets match the calendar day
// for the core audience (Ghana, UTC+0).
//
// Counts completions in nclex_student_activity_progress (TEXT / PDF /
// link / quizzes). LIBRARY_NOTE done is now folded in too: marking a note
// done mirrors a MANUAL progress row per pointing activity (see
// note-read-actions.ts → syncNoteActivityProgress), so reading-heavy days
// count. SHELF "done" (a member rollup) still lives only in shelf-state
// and isn't folded in — a minor remaining undercount.
function studyStreakFromMap(
  progressMap: ActivityProgressMap,
  nowMs: number,
): OverviewStreak {
  const times: string[] = [];
  for (const row of progressMap.values()) {
    if (row.completed_at) times.push(row.completed_at);
  }
  return studyStreak(times, nowMs);
}

// The streak maths itself now lives in ./streak (pure, shared with the
// Bank dashboard) — see the note there on why there is only one copy.

// ─────────────────────────────────────────────────────────
// Recent activity (both modes)
// ─────────────────────────────────────────────────────────

// Merge quiz attempts (score / in-progress) with non-quiz activity
// completions into one feed, newest first, capped at 5. Quiz activities
// are represented by their attempts (which carry the score); their
// progress completion is skipped so they don't double up.
function buildRecentActivity(
  tree: StudentCurriculumTree,
  progressMap: ActivityProgressMap,
  attempts: ProgrammeHistoryAttempt[],
): OverviewRecentItem[] {
  const label = tree.programme.unit_label;
  const events: Array<{ ts: string; item: OverviewRecentItem }> = [];

  // Quiz attempts — in-progress (resume signal) + scored terminal.
  // Abandoned attempts with no score are dropped (noise).
  for (const a of attempts) {
    let pill: string;
    let pillKind: OverviewRecentItem['pillKind'];
    if (a.status === 'IN_PROGRESS') {
      pill = 'In progress';
      pillKind = 'prog';
    } else if (
      a.final_score != null &&
      (a.status === 'COMPLETED' || a.status === 'TIMED_OUT')
    ) {
      pill = `${Math.round(a.final_score * 100)}%`;
      pillKind =
        a.pass_score != null
          ? a.final_score >= a.pass_score
            ? 'score-pass'
            : 'score-fail'
          : 'score';
    } else {
      continue;
    }
    events.push({
      ts: a.created_at,
      item: {
        key: `att-${a.attempt_id}`,
        icon: ACTIVITY_TYPE_ICON[a.activity_type],
        title: a.activity_title,
        meta: `${unitLabel(a.unit_index, label)} · ${activityTypeLabel(a.activity_type)}`,
        pill,
        pillKind,
      },
    });
  }

  // Non-quiz completions — from the progress map, joined to the tree for
  // title / type / unit. Quiz + live-session types excluded (quizzes are
  // covered by attempts above; live sessions aren't "completions").
  const idx = indexActivities(tree);
  for (const [activityId, row] of progressMap) {
    const hit = idx.get(activityId);
    if (!hit) continue;
    const t = hit.activity.type;
    if (t === 'MOCK' || t === 'PRACTICE_QUIZ' || t === 'ONLINE_LIVE_SESSION') {
      continue;
    }
    events.push({
      ts: row.completed_at,
      item: {
        key: `done-${activityId}`,
        icon: ACTIVITY_TYPE_ICON[t],
        title: hit.activity.title,
        meta: `${unitLabel(hit.unitIndex, label)} · ${activityTypeLabel(t)}`,
        pill: 'Done',
        pillKind: 'done',
      },
    });
  }

  events.sort((a, b) => b.ts.localeCompare(a.ts));
  return events.slice(0, 5).map((e) => e.item);
}

// ─────────────────────────────────────────────────────────
// Quizzes snapshot (both modes)
// ─────────────────────────────────────────────────────────

// Counts + resume target from the student quiz rows; last-mock score from
// the attempt history (newest first). null when no quizzes are attached.
function buildQuizzes(
  quizRows: StudentQuizRow[],
  attempts: ProgrammeHistoryAttempt[],
  basePath: string,
): OverviewQuizzes | null {
  if (quizRows.length === 0) return null;

  let done = 0;
  let inProgress = 0;
  let resume: OverviewQuizzes['resume'] = null;
  for (const r of quizRows) {
    if (r.state === 'DONE') done += 1;
    else if (r.state === 'IN_PROGRESS') {
      inProgress += 1;
      // The quizzes page carries the actual Resume affordance; deep-link
      // there rather than re-implement attempt routing here.
      if (!resume) resume = { title: r.title, href: `${basePath}/quizzes` };
    }
  }

  let lastMockScore: number | null = null;
  let lastMockPassed: boolean | null = null;
  for (const a of attempts) {
    if (
      a.activity_type === 'MOCK' &&
      a.status === 'COMPLETED' &&
      a.final_score != null
    ) {
      lastMockScore = Math.round(a.final_score * 100);
      lastMockPassed =
        a.pass_score != null ? a.final_score >= a.pass_score : null;
      break;
    }
  }

  return {
    total: quizRows.length,
    done,
    inProgress,
    resume,
    lastMockScore,
    lastMockPassed,
    allHref: `${basePath}/quizzes`,
  };
}

// ─────────────────────────────────────────────────────────
// Library snapshot (both modes)
// ─────────────────────────────────────────────────────────

// Continue-reading note + bookmarked / recently-opened counts, reusing the
// student library snapshot + Study-Home derivation. null when no notes are
// visible to this student. Library is tutor-keyed, so the programme id
// resolves the right library for both delivery modes.
async function buildLibrary(
  programmeId: string,
  libraryHref: string,
): Promise<OverviewLibrary | null> {
  const snapshot = await getStudentLibrarySnapshot(programmeId);
  if (!snapshot || snapshot.notes.length === 0) return null;

  const home = await getStudentLibraryHomeData(snapshot);
  const states = Object.values(home.stateByNote);
  const bookmarked = states.filter((s) => s.bookmarkedAt != null).length;
  const recentlyOpened = states.filter((s) => s.lastVisitedAt != null).length;

  let continueTitle: string | null = null;
  if (home.continueProgress) {
    const note = snapshot.notes.find(
      (n) => n.note_id === home.continueProgress!.noteId,
    );
    continueTitle = note?.title ?? null;
  }

  return { continueTitle, bookmarked, recentlyOpened, href: libraryHref };
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
