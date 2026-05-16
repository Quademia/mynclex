// mynclex/lib/curriculum/standalone-quiz-launch.ts
//
// Server actions for the STANDALONE quiz launch path (Tutor Quiz
// Slice 6). Sibling to `quiz-launch.ts`, which handles activity-
// linked launches. Both expose the same `QuizLaunchContext` shape
// so the launch-modal body + actions can be reused unchanged.
//
// Two exports:
//
//   getStandaloneQuizLaunchContext(programmeId, quizId)
//   - Called on modal open. Returns quiz metadata + attempt
//     stats scoped per §9.7-B: per-(student, quiz, programme)
//     terminal count + in-progress lookup on standalone rows.
//
//   startStandaloneQuizAttemptAction(programmeId, quizId)
//   - Called when the student clicks Start. Wraps the new
//     SECURITY DEFINER RPC `nclex_create_standalone_quiz_attempt`
//     (Slice 6 migration). Returns the new attempt_id.
//
// Access gate: the (programme PUBLISHED + quiz attached) chain is
// enforced by the junction's student SELECT policy + the new
// `nclex_tutor_quizzes_student_select` policy from Slice 5. A
// missing row collapses to a generic "not available" error so a
// client can't probe for ids.

'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type {
  QuizKind,
  QuizMode,
  QuizStatus,
} from '@/lib/tutor-quiz/types';
import type { QuizLaunchContext } from './quiz-launch';

export type StandaloneQuizLaunchContextResult =
  | { ok: true; context: QuizLaunchContext }
  | { ok: false; error: string };

export async function getStandaloneQuizLaunchContext(
  programmeId: string,
  quizId: string,
): Promise<StandaloneQuizLaunchContextResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // 1. Junction row — the access permission. Without it the
  //    student has no business launching this quiz here.
  const { data: junction } = await supabase
    .from('nclex_programme_quizzes')
    .select('programme_id, quiz_id')
    .eq('programme_id', programmeId)
    .eq('quiz_id', quizId)
    .maybeSingle();
  if (!junction) {
    return { ok: false, error: 'This quiz is not available right now.' };
  }

  // 2. Quiz row. The Slice 5 student_select policy allows reads
  //    when the quiz is PUBLISHED AND attached to a PUBLISHED
  //    programme — both checks pass for a junction-resolved row,
  //    so the SELECT goes through user auth (no service role
  //    needed for the metadata).
  const { data: quiz } = await supabase
    .from('nclex_tutor_quizzes')
    .select(
      'quiz_id, title, description, quiz_kind, mode, duration_seconds, pass_score, max_attempts, status',
    )
    .eq('quiz_id', quizId)
    .maybeSingle();
  if (!quiz) {
    return { ok: false, error: 'This quiz is not available right now.' };
  }
  if (quiz.status !== 'PUBLISHED') {
    return { ok: false, error: 'This quiz is not available right now.' };
  }

  // 3. Question count — no student SELECT on quiz_items, so this
  //    needs the service role (matches the activity-linked path).
  const service = createServiceRoleClient();
  const { count: questionCount } = await service
    .from('nclex_tutor_quiz_items')
    .select('quiz_item_id', { count: 'exact', head: true })
    .eq('quiz_id', quizId);
  if (!questionCount || questionCount === 0) {
    return { ok: false, error: 'This quiz has no questions yet.' };
  }

  // 4. Attempts on THIS standalone (programme, quiz) pair for
  //    THIS student. Same filter shape as the RPC's cap check —
  //    the two queries must agree on what "this row's attempts"
  //    means. Activity-linked attempts of the same quiz live in
  //    a separate scope (Option 2 routing — they'd come through
  //    getQuizLaunchContext).
  const { count: takenCount } = await supabase
    .from('nclex_attempts')
    .select('attempt_id', { count: 'exact', head: true })
    .eq('source', 'PROGRAMME_ASSIGNED')
    .is('programme_activity_id', null)
    .eq('programme_id', programmeId)
    .eq('quiz_id', quizId)
    .in('status', ['COMPLETED', 'TIMED_OUT', 'ABANDONED']);

  const { data: inProgress } = await supabase
    .from('nclex_attempts')
    .select('attempt_id')
    .eq('source', 'PROGRAMME_ASSIGNED')
    .is('programme_activity_id', null)
    .eq('programme_id', programmeId)
    .eq('quiz_id', quizId)
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
        pass_score:
          quiz.pass_score == null ? null : Number(quiz.pass_score),
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

export type StartStandaloneQuizAttemptResult =
  | { ok: true; attempt_id: string }
  | { ok: false; error: string };

export async function startStandaloneQuizAttemptAction(
  programmeId: string,
  quizId: string,
): Promise<StartStandaloneQuizAttemptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // RPC handles all validation + snapshot. See migration comments
  // for the exhaustive list of pre-conditions checked.
  const { data, error } = await supabase.rpc(
    'nclex_create_standalone_quiz_attempt',
    { p_programme_id: programmeId, p_quiz_id: quizId },
  );

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Could not start the quiz.' };
  return { ok: true, attempt_id: data as string };
}
