// mynclex/lib/student-quizzes/queries.ts
//
// Producer for the student Quizzes page (Tutor Quiz Slice 6).
// Reads the programme's quiz junction, joins quiz metadata, and
// projects each row with the student's progress state + counter +
// routing target. Two entry points (programme-scoped + cohort-
// scoped) share a single internal builder — the cohort variant
// just resolves the parent programme and delegates.
//
// RLS surface:
//   - nclex_programme_quizzes — student SELECT policy allows reads
//     when the parent programme is PUBLISHED.
//   - nclex_tutor_quizzes — student SELECT policy added in Slice 5
//     allows reads when the quiz is PUBLISHED AND attached to a
//     PUBLISHED programme.
//   - nclex_tutor_quiz_items — no student SELECT; counts come via
//     service role (matches the launch-modal precedent).
//   - nclex_attempts — student_id-scoped RLS.

import {
  createClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import type {
  QuizKind,
  QuizMode,
  QuizStatus,
} from '@/lib/tutor-quiz/types';
import type { UnitLabel } from '@/lib/programmes/types';
import type {
  StudentQuizRow,
  StudentQuizSourceHint,
  StudentQuizState,
} from './types';

// =========================================================
// Activity hint map (shared with Slice 5's tutor side)
// =========================================================
// Walks every MOCK / PRACTICE_QUIZ activity in this programme,
// keyed to its primary placement (lowest unit_index, lowest
// ordinal). The result is used twice: once for the source-hint
// pill, once for routing (Option 2 — Slice 6 row routes through
// the primary activity when the quiz is curriculum-linked).
//
// Returns a flat map keyed by quiz_id; the value carries the
// hint + the activity_id so the row can route correctly.

type ActivityHint = {
  primary_activity_id: string;
  hint: StudentQuizSourceHint;
};

type StudentActivityRow = {
  activity_id: string;
  ordinal: number;
  payload: { quiz_id?: string | null } | null;
  type: 'MOCK' | 'PRACTICE_QUIZ';
  nclex_programme_units:
    | {
        unit_index: number;
        title: string;
        nclex_programmes:
          | { unit_label: UnitLabel }
          | Array<{ unit_label: UnitLabel }>;
      }
    | Array<{
        unit_index: number;
        title: string;
        nclex_programmes:
          | { unit_label: UnitLabel }
          | Array<{ unit_label: UnitLabel }>;
      }>;
};

async function loadActivityHintMap(
  programmeId: string,
): Promise<Map<string, ActivityHint>> {
  // Service role for the join — student RLS on programme_activities
  // requires is_published + cohort window scoping, but we want ALL
  // quiz activities the tutor authored against this programme for
  // the hint derivation (a draft activity-link still implies a
  // membership). The (programme PUBLISHED + quiz in junction)
  // RLS chain already gates access; this read is the join-level
  // refinement.
  const service = createServiceRoleClient();

  const { data } = await service
    .from('nclex_programme_activities')
    .select(
      `activity_id, ordinal, payload, type,
       nclex_programme_units!inner(
         programme_id, unit_index, title,
         nclex_programmes!inner(unit_label)
       )`,
    )
    .in('type', ['MOCK', 'PRACTICE_QUIZ'])
    .eq('nclex_programme_units.programme_id', programmeId);

  if (!data) return new Map();

  type Row = {
    activity_id: string;
    quiz_id: string;
    unit_index: number;
    ordinal: number;
    unit_title: string;
    unit_label: UnitLabel;
  };

  const rows: Row[] = [];
  for (const r of data as StudentActivityRow[]) {
    const quizId = r.payload?.quiz_id;
    if (!quizId) continue;
    const unit = Array.isArray(r.nclex_programme_units)
      ? r.nclex_programme_units[0]
      : r.nclex_programme_units;
    if (!unit) continue;
    const prog = Array.isArray(unit.nclex_programmes)
      ? unit.nclex_programmes[0]
      : unit.nclex_programmes;
    rows.push({
      activity_id: r.activity_id,
      quiz_id: quizId,
      unit_index: unit.unit_index,
      ordinal: r.ordinal,
      unit_title: unit.title,
      unit_label: prog?.unit_label ?? 'WEEK',
    });
  }

  // Sort so the primary placement per quiz is the first row.
  rows.sort(
    (a, b) =>
      a.unit_index - b.unit_index || a.ordinal - b.ordinal,
  );

  const out = new Map<string, ActivityHint>();
  for (const r of rows) {
    if (out.has(r.quiz_id)) continue;
    out.set(r.quiz_id, {
      primary_activity_id: r.activity_id,
      hint: {
        unit_index: r.unit_index,
        unit_label: r.unit_label,
        unit_title: r.unit_title,
      },
    });
  }
  return out;
}

// =========================================================
// Standalone-attempt count by (student, quiz, programme)
// =========================================================
// Drives the cap counter on standalone rows. RLS on nclex_attempts
// already scopes to auth.uid(); the partial index from the Slice 6
// migration makes this fast.

type StandaloneAttemptStats = {
  attempts_taken: number;
  in_progress_attempt_id: string | null;
};

async function loadStandaloneAttemptStats(
  programmeId: string,
  quizIds: string[],
): Promise<Map<string, StandaloneAttemptStats>> {
  const out = new Map<string, StandaloneAttemptStats>();
  if (quizIds.length === 0) return out;

  const supabase = await createClient();

  // Terminal attempts — drive the cap counter.
  const { data: terminal } = await supabase
    .from('nclex_attempts')
    .select('quiz_id, status')
    .eq('source', 'PROGRAMME_ASSIGNED')
    .is('programme_activity_id', null)
    .eq('programme_id', programmeId)
    .in('quiz_id', quizIds)
    .in('status', ['COMPLETED', 'TIMED_OUT', 'ABANDONED']);

  for (const row of (terminal ?? []) as Array<{
    quiz_id: string;
    status: string;
  }>) {
    const prev = out.get(row.quiz_id) ?? {
      attempts_taken: 0,
      in_progress_attempt_id: null,
    };
    out.set(row.quiz_id, {
      ...prev,
      attempts_taken: prev.attempts_taken + 1,
    });
  }

  // In-progress attempt per quiz — drive the Resume affordance.
  // Most-recent wins (defending against an edge case where a
  // student has multiple IN_PROGRESS — same caveat as
  // getInProgressQuizAttempts in lib/progress/queries.ts).
  const { data: inProgress } = await supabase
    .from('nclex_attempts')
    .select('quiz_id, attempt_id, last_activity_at')
    .eq('source', 'PROGRAMME_ASSIGNED')
    .is('programme_activity_id', null)
    .eq('programme_id', programmeId)
    .in('quiz_id', quizIds)
    .eq('status', 'IN_PROGRESS')
    .order('last_activity_at', { ascending: false });

  for (const row of (inProgress ?? []) as Array<{
    quiz_id: string;
    attempt_id: string;
    last_activity_at: string;
  }>) {
    const prev = out.get(row.quiz_id) ?? {
      attempts_taken: 0,
      in_progress_attempt_id: null,
    };
    if (prev.in_progress_attempt_id == null) {
      out.set(row.quiz_id, {
        ...prev,
        in_progress_attempt_id: row.attempt_id,
      });
    }
  }

  return out;
}

// =========================================================
// Activity-linked attempt count
// =========================================================
// Mirrors the existing getQuizLaunchContext counter — terminal
// attempts on THIS activity, plus the in-progress one if any.
// Used when a row routes through an activity (linked path).

type ActivityAttemptStats = {
  attempts_taken: number;
  in_progress_attempt_id: string | null;
};

async function loadActivityAttemptStats(
  activityIds: string[],
): Promise<Map<string, ActivityAttemptStats>> {
  const out = new Map<string, ActivityAttemptStats>();
  if (activityIds.length === 0) return out;

  const supabase = await createClient();

  const { data: terminal } = await supabase
    .from('nclex_attempts')
    .select('programme_activity_id, status')
    .eq('source', 'PROGRAMME_ASSIGNED')
    .in('programme_activity_id', activityIds)
    .in('status', ['COMPLETED', 'TIMED_OUT', 'ABANDONED']);

  for (const row of (terminal ?? []) as Array<{
    programme_activity_id: string;
    status: string;
  }>) {
    const prev = out.get(row.programme_activity_id) ?? {
      attempts_taken: 0,
      in_progress_attempt_id: null,
    };
    out.set(row.programme_activity_id, {
      ...prev,
      attempts_taken: prev.attempts_taken + 1,
    });
  }

  const { data: inProgress } = await supabase
    .from('nclex_attempts')
    .select('programme_activity_id, attempt_id, last_activity_at')
    .eq('source', 'PROGRAMME_ASSIGNED')
    .in('programme_activity_id', activityIds)
    .eq('status', 'IN_PROGRESS')
    .order('last_activity_at', { ascending: false });

  for (const row of (inProgress ?? []) as Array<{
    programme_activity_id: string;
    attempt_id: string;
    last_activity_at: string;
  }>) {
    const prev = out.get(row.programme_activity_id) ?? {
      attempts_taken: 0,
      in_progress_attempt_id: null,
    };
    if (prev.in_progress_attempt_id == null) {
      out.set(row.programme_activity_id, {
        ...prev,
        in_progress_attempt_id: row.attempt_id,
      });
    }
  }

  return out;
}

// =========================================================
// State derivation
// =========================================================
// DONE > IN_PROGRESS > EXHAUSTED > NOT_STARTED. UP_NEXT is reserved
// for activity-linked rows that ALSO match the progress engine's
// "next activity" pointer — not derived here (would require the
// upNextActivityId helper across the whole curriculum tree, which
// is more weight than this surface needs in v1). v1 collapses
// UP_NEXT into NOT_STARTED for the row pill; the curriculum side
// retains the distinction.

function deriveState(
  attemptsTaken: number,
  inProgress: boolean,
  isDone: boolean,
  maxAttempts: number | null,
): StudentQuizState {
  if (inProgress) return 'IN_PROGRESS';
  if (isDone) {
    if (maxAttempts != null && attemptsTaken >= maxAttempts) {
      return 'DONE'; // Done; the action button will show "No attempts left"
    }
    return 'DONE';
  }
  if (
    maxAttempts != null &&
    attemptsTaken >= maxAttempts &&
    !isDone
  ) {
    // All attempts terminal, none marked DONE in progress engine.
    // Rare — would happen if every attempt was ABANDONED or TIMED_OUT
    // without ever completing.
    return 'EXHAUSTED';
  }
  if (attemptsTaken > 0 && !isDone) {
    // Some terminal attempts but not flagged DONE — e.g. TIMED_OUT
    // or ABANDONED without a COMPLETED. Surface as NOT_STARTED
    // semantically (the runner can be reopened).
    return 'NOT_STARTED';
  }
  return 'NOT_STARTED';
}

// =========================================================
// Programme + Cohort entry points
// =========================================================
// Cohort variant resolves to the parent programme and delegates.
// Slice 9.9 (future) will give the cohort layer its own
// divergence; until then, cohort = programme passthrough.

export async function getStudentCohortQuizzes(
  cohortId: string,
): Promise<{ programmeId: string; rows: StudentQuizRow[] } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!data) return null;
  const programmeId = data.programme_id as string;
  const rows = await getStudentProgrammeQuizzes(programmeId);
  return { programmeId, rows };
}

export async function getStudentProgrammeQuizzes(
  programmeId: string,
): Promise<StudentQuizRow[]> {
  const supabase = await createClient();

  // 1. Junction rows JOINed to quiz metadata. RLS scopes to
  //    PUBLISHED programmes (junction policy) AND PUBLISHED quizzes
  //    (Slice 5's student_select policy on nclex_tutor_quizzes).
  const { data: junctionRows, error } = await supabase
    .from('nclex_programme_quizzes')
    .select(
      `added_at, quiz_id,
       nclex_tutor_quizzes!inner(
         quiz_id, title, description, quiz_kind, mode,
         duration_seconds, pass_score, max_attempts, status
       )`,
    )
    .eq('programme_id', programmeId)
    .order('added_at', { ascending: false });

  if (error || !junctionRows || junctionRows.length === 0) return [];

  type QuizCore = {
    quiz_id: string;
    title: string;
    description: string | null;
    quiz_kind: QuizKind;
    mode: QuizMode;
    duration_seconds: number | null;
    pass_score: number | null;
    max_attempts: number | null;
    status: QuizStatus;
  };

  const quizzes: Array<QuizCore & { added_at: string }> = [];
  for (const row of junctionRows) {
    const raw = row as typeof row & {
      nclex_tutor_quizzes: QuizCore | QuizCore[] | null;
    };
    const q = Array.isArray(raw.nclex_tutor_quizzes)
      ? raw.nclex_tutor_quizzes[0]
      : raw.nclex_tutor_quizzes;
    if (!q) continue;
    quizzes.push({ ...q, added_at: raw.added_at });
  }
  if (quizzes.length === 0) return [];

  const quizIds = quizzes.map((q) => q.quiz_id);

  // 2. Item counts — service role (no student SELECT on items).
  const service = createServiceRoleClient();
  const { data: itemRows } = await service
    .from('nclex_tutor_quiz_items')
    .select('quiz_id')
    .in('quiz_id', quizIds);

  const itemCounts = new Map<string, number>();
  for (const r of (itemRows ?? []) as Array<{ quiz_id: string }>) {
    itemCounts.set(r.quiz_id, (itemCounts.get(r.quiz_id) ?? 0) + 1);
  }

  // 3. Activity-hint map — which quizzes are activity-linked and
  //    their primary placement.
  const hintMap = await loadActivityHintMap(programmeId);

  // 4. Per-launch-path attempt stats. Linked rows count via the
  //    primary activity_id; standalone rows count via (programme,
  //    quiz). Two parallel reads to keep the per-path scopes
  //    distinct.
  const linkedActivityIds: string[] = [];
  const standaloneQuizIds: string[] = [];
  for (const q of quizzes) {
    const hint = hintMap.get(q.quiz_id);
    if (hint) linkedActivityIds.push(hint.primary_activity_id);
    else standaloneQuizIds.push(q.quiz_id);
  }

  const [linkedStats, standaloneStats] = await Promise.all([
    loadActivityAttemptStats(linkedActivityIds),
    loadStandaloneAttemptStats(programmeId, standaloneQuizIds),
  ]);

  // 5. Done map for activity-linked rows — progress engine reads
  //    are keyed by activity_id. Standalone rows derive DONE from
  //    attempt status directly (any COMPLETED → done).
  const { data: progressRows } =
    linkedActivityIds.length > 0
      ? await supabase
          .from('nclex_student_activity_progress')
          .select('activity_id')
          .in('activity_id', linkedActivityIds)
      : { data: [] };
  const doneActivityIds = new Set(
    (progressRows ?? []).map((r) => r.activity_id as string),
  );

  // For standalone rows, "Done" = any COMPLETED attempt for this
  // (programme, quiz) pair. Already counted in terminal stats by
  // status, but we need to distinguish COMPLETED from
  // TIMED_OUT/ABANDONED for the Done flag. One more read.
  const { data: standaloneCompleted } =
    standaloneQuizIds.length > 0
      ? await supabase
          .from('nclex_attempts')
          .select('quiz_id')
          .eq('source', 'PROGRAMME_ASSIGNED')
          .is('programme_activity_id', null)
          .eq('programme_id', programmeId)
          .in('quiz_id', standaloneQuizIds)
          .eq('status', 'COMPLETED')
          .limit(1000)
      : { data: [] };
  const doneStandaloneQuizIds = new Set(
    (standaloneCompleted ?? []).map((r) => r.quiz_id as string),
  );

  // 6. Build rows.
  const out: StudentQuizRow[] = [];
  for (const q of quizzes) {
    const hint = hintMap.get(q.quiz_id);
    const linked = hint != null;
    const stats = linked
      ? linkedStats.get(hint.primary_activity_id) ?? {
          attempts_taken: 0,
          in_progress_attempt_id: null,
        }
      : standaloneStats.get(q.quiz_id) ?? {
          attempts_taken: 0,
          in_progress_attempt_id: null,
        };

    const isDone = linked
      ? doneActivityIds.has(hint.primary_activity_id)
      : doneStandaloneQuizIds.has(q.quiz_id);

    const attemptsRemaining =
      q.max_attempts == null
        ? null
        : Math.max(0, q.max_attempts - stats.attempts_taken);

    const state = deriveState(
      stats.attempts_taken,
      stats.in_progress_attempt_id != null,
      isDone,
      q.max_attempts,
    );

    out.push({
      quiz_id: q.quiz_id,
      title: q.title,
      description: q.description,
      quiz_kind: q.quiz_kind,
      mode: q.mode,
      duration_seconds: q.duration_seconds,
      pass_score: q.pass_score,
      max_attempts: q.max_attempts,
      item_count: itemCounts.get(q.quiz_id) ?? 0,
      status: q.status,
      source_hint: hint?.hint ?? null,
      primary_activity_id: hint?.primary_activity_id ?? null,
      state,
      attempts_taken: stats.attempts_taken,
      attempts_remaining: attemptsRemaining,
      in_progress_attempt_id: stats.in_progress_attempt_id,
    });
  }

  return out;
}
