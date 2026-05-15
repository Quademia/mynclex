// mynclex/lib/curriculum/quiz-launch.ts
//
// Tutor-Quiz slice 3 — student-side server actions for the Mock /
// Practice quiz launch modal.
//
// Two exports:
//
//   getQuizLaunchContext(activityId) — called on modal open. Joins
//   the activity → quiz → quiz-items count, plus the student's own
//   attempts for the activity (terminal count for max_attempts; an
//   in-progress id for the Resume path). Returns everything the
//   modal renders in a single round trip.
//
//   startProgrammeQuizAction(activityId) — called when the student
//   clicks Start. Wraps the SECURITY DEFINER RPC
//   `nclex_create_programme_attempt` (slice 3 migration), which
//   does the real validation + snapshot. Returns the new attempt_id
//   on success.
//
// Access gate: the activity row is read under the STUDENT's own
// RLS. The slice-10.1 `nclex_programme_activities_student_select`
// policy only exposes activities under a PUBLISHED programme — so
// a readable row IS the permission (permissive v1; tightens with
// enrolment alongside the RLS clause). The quiz row goes through
// the SECURITY DEFINER RPC, not direct SELECT.

'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  QuizKind,
  QuizMode,
  QuizStatus,
} from '@/lib/tutor-quiz/types';

// The bundle the launch modal renders from. Computed in one
// server call so the modal mounts with all the data resolved.
export type QuizLaunchContext = {
  /** Quiz metadata the modal renders. */
  quiz: {
    quiz_id: string;
    title: string;
    description: string | null;
    quiz_kind: QuizKind;
    mode: QuizMode;
    duration_seconds: number | null;
    pass_score: number | null;
    max_attempts: number | null;
    status: QuizStatus;
    question_count: number;
  };
  /** Terminal attempts (COMPLETED + TIMED_OUT + ABANDONED) the
   *  student has on THIS activity. Drives the "Attempt N of M" /
   *  "No attempts remaining" line. */
  attempts_taken: number;
  /** null = unlimited; otherwise max_attempts - attempts_taken
   *  (clamped at 0). */
  attempts_remaining: number | null;
  /** The student's in-progress attempt for this activity, if any.
   *  Non-null → modal shows "Resume" instead of "Start" and
   *  navigates without calling the RPC. */
  in_progress_attempt_id: string | null;
};

export type QuizLaunchContextResult =
  | { ok: true; context: QuizLaunchContext }
  | { ok: false; error: string };

export async function getQuizLaunchContext(
  activityId: string
): Promise<QuizLaunchContextResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // 1. Activity row under student RLS. A missing row means "not a
  //    quiz activity the student can see" (doesn't exist, not under
  //    a PUBLISHED programme, etc.) — surface the same generic
  //    error so a client can't probe for ids.
  const { data: activity } = await supabase
    .from('nclex_programme_activities')
    .select('type, is_published, payload')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!activity) {
    return { ok: false, error: 'This quiz is not available right now.' };
  }
  if (activity.type !== 'MOCK' && activity.type !== 'PRACTICE_QUIZ') {
    return { ok: false, error: 'This activity is not a quiz.' };
  }
  if (!activity.is_published) {
    return { ok: false, error: 'This quiz is not available right now.' };
  }

  const payload = activity.payload as { quiz_id?: string | null } | null;
  const quizId = payload?.quiz_id ?? null;
  if (!quizId) {
    return {
      ok: false,
      error: 'No quiz has been linked to this activity yet.',
    };
  }

  // 2. Quiz row. RLS on nclex_tutor_quizzes is tutor-owned; students
  //    have no SELECT policy. We bypass with a SECURITY DEFINER read
  //    by going through the launch RPC indirectly — but for the
  //    modal preview we need quiz metadata before the student clicks
  //    Start. Use the service-role client for this read; the access
  //    gate above (a published activity referencing this quiz) is
  //    the real check, same shape as the PDF activity flow
  //    (student-actions.ts).
  const service = createServiceRoleClient();
  const { data: quiz } = await service
    .from('nclex_tutor_quizzes')
    .select(
      'quiz_id, title, description, quiz_kind, mode, duration_seconds, pass_score, max_attempts, status'
    )
    .eq('quiz_id', quizId)
    .maybeSingle();
  if (!quiz || quiz.status !== 'PUBLISHED') {
    return {
      ok: false,
      error: 'The quiz linked to this activity is not available.',
    };
  }

  // 3. Question count — also via service role (same RLS situation
  //    as the quiz row).
  const { count: questionCount } = await service
    .from('nclex_tutor_quiz_items')
    .select('quiz_item_id', { count: 'exact', head: true })
    .eq('quiz_id', quizId);

  if (!questionCount || questionCount === 0) {
    return {
      ok: false,
      error: 'This quiz has no questions yet.',
    };
  }

  // 4. Attempts on this activity for this student. RLS on
  //    nclex_attempts already scopes to auth.uid().
  //    Terminal count (drives max_attempts) — COMPLETED + TIMED_OUT
  //    + ABANDONED. IN_PROGRESS is excluded; resume handles it.
  const { count: takenCount } = await supabase
    .from('nclex_attempts')
    .select('attempt_id', { count: 'exact', head: true })
    .eq('programme_activity_id', activityId)
    .in('status', ['COMPLETED', 'TIMED_OUT', 'ABANDONED']);

  // In-progress lookup — scoped per activity (not global). The
  // bank's resume banner uses a global most-recent lookup; the
  // programme launch needs activity-scoped resume so a student
  // can have multiple in-progress quizzes across different
  // activities.
  const { data: inProgress } = await supabase
    .from('nclex_attempts')
    .select('attempt_id')
    .eq('programme_activity_id', activityId)
    .eq('status', 'IN_PROGRESS')
    .not('started_at', 'is', null)
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const attemptsTaken = takenCount ?? 0;
  const attemptsRemaining =
    quiz.max_attempts == null
      ? null
      : Math.max(0, quiz.max_attempts - attemptsTaken);

  return {
    ok: true,
    context: {
      quiz: {
        quiz_id: quiz.quiz_id,
        title: quiz.title,
        description: quiz.description,
        quiz_kind: quiz.quiz_kind as QuizKind,
        mode: quiz.mode as QuizMode,
        duration_seconds: quiz.duration_seconds,
        pass_score: quiz.pass_score == null ? null : Number(quiz.pass_score),
        max_attempts: quiz.max_attempts,
        status: quiz.status as QuizStatus,
        question_count: questionCount,
      },
      attempts_taken: attemptsTaken,
      attempts_remaining: attemptsRemaining,
      in_progress_attempt_id: inProgress?.attempt_id ?? null,
    },
  };
}

export type StartProgrammeQuizResult =
  | { ok: true; attempt_id: string }
  | { ok: false; error: string };

export async function startProgrammeQuizAction(
  activityId: string
): Promise<StartProgrammeQuizResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // The RPC handles all validation: activity exists + published,
  // quiz exists + published + linked, max_attempts not exceeded,
  // snapshots questions in position order. Errors come back as
  // Postgres exceptions — message strings only (no SQLSTATE
  // inspection in v1).
  const { data, error } = await supabase.rpc(
    'nclex_create_programme_attempt',
    { p_programme_activity_id: activityId }
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Could not start the quiz.' };
  }

  return { ok: true, attempt_id: data as string };
}
