// mynclex/lib/practice/runner/results-actions.ts
//
// Slice 3a — server actions for the end-of-quiz results popup.
//
//   • getResultsContext(attemptId)
//       Single round-trip on popup mount. Returns the exit URL and
//       retake availability per source. Bank → /student/bank, unlimited
//       retake. Programme → curriculum URL derived from the attempt's
//       programme_activity_id; retake availability gated by the linked
//       quiz's max_attempts (terminal statuses count; IN_PROGRESS does
//       not — resume is a separate concern).
//
//   • restartAttemptAction(attemptId)
//       Source-aware "Take again" / "Build another". Reads the source
//       attempt and re-creates a fresh one:
//         CUSTOM_BUILT       → nclex_create_attempt with the same
//                              filters_json + mode + intent + count
//         PROGRAMME_ASSIGNED → nclex_create_programme_attempt with the
//                              same programme_activity_id (RPC re-checks
//                              max_attempts server-side)
//       Returns the new attempt_id for client-side navigation.

'use server';

import { createClient } from '@/lib/supabase/server';
import { resolveAttemptExitHref } from './resolve-exit-href';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ResultsContext {
  /** Where "Exit" navigates. Source-derived. */
  exitHref:        string;
  /** Label for the Exit button. Tracks the destination. */
  exitLabel:       string;
  /** Label for the retake button. "Take again" for programme, "Build another" for bank. */
  retakeLabel:     string;
  /** True when the retake button should render. False when attempts exhausted. */
  retakeAvailable: boolean;
  /** Programme only: "Attempt 1 of 3" / null for unlimited / null for bank. */
  attemptsLine:    string | null;
  /** Readiness only: the permanent per-sitting report page. When set, the
   *  popup renders the readiness variant — a "See your full report" CTA in
   *  place of the inline review + retake (review is reached from the report).
   *  Null for every other source. */
  reportHref:      string | null;
}

/**
 * Resolve the popup's source-specific bits on mount.
 */
export async function getResultsContext(
  attemptId: string,
): Promise<ActionResult<ResultsContext>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: attempt, error: aErr } = await supabase
    .from('nclex_attempts')
    .select('source, programme_activity_id')
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (aErr || !attempt) return { ok: false, error: 'Attempt not found.' };

  // Exit URL — shared resolver (same one the page calls server-side
  // to wire the runner topbar's ← Exit button).
  const exitHref = await resolveAttemptExitHref(supabase, {
    source:                attempt.source,
    programme_activity_id: attempt.programme_activity_id,
  });

  // Bank Builder — retake always allowed (re-running the same filter
  // is a fresh build, never blocked).
  if (attempt.source === 'CUSTOM_BUILT') {
    return {
      ok: true,
      data: {
        exitHref,
        exitLabel:       'Exit to bank',
        retakeLabel:     'Build another',
        retakeAvailable: true,
        attemptsLine:    null,
        reportHref:      null,
      },
    };
  }

  // Readiness Pack — one-shot, no retake ever. The popup points at the
  // permanent per-sitting report page (the report is the hub; per-question
  // review is reached from there, window-gated). "Sat = closed forever"
  // (§2 r4), so retakeAvailable is always false.
  if (attempt.source === 'READINESS_PACK') {
    return {
      ok: true,
      data: {
        exitHref,
        exitLabel:       'Back to packs',
        retakeLabel:     '',
        retakeAvailable: false,
        attemptsLine:    null,
        reportHref:      `/student/bank/packs/report/${attemptId}`,
      },
    };
  }

  // Programme — pull the linked quiz to check max_attempts.
  if (attempt.source === 'PROGRAMME_ASSIGNED' && attempt.programme_activity_id) {
    const { data: activity, error: actErr } = await supabase
      .from('nclex_programme_activities')
      .select('payload')
      .eq('activity_id', attempt.programme_activity_id)
      .maybeSingle();
    if (actErr || !activity) {
      return { ok: false, error: 'Activity not found.' };
    }

    // Check max_attempts via the linked quiz (RLS on tutor_quizzes is
    // tutor-owned, but we're only reading max_attempts — the safe path
    // is service-role for this one field. For now do the simple read
    // and accept "unknown" if RLS blocks; UI degrades to retakeAvailable=true).
    const quizId = (activity.payload as { quiz_id?: string } | null)?.quiz_id;
    let retakeAvailable = true;
    let attemptsLine: string | null = null;

    if (quizId) {
      // Count terminal attempts on this activity for this student.
      const { count: terminalCount } = await supabase
        .from('nclex_attempts')
        .select('attempt_id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('programme_activity_id', attempt.programme_activity_id)
        .in('status', ['COMPLETED', 'TIMED_OUT', 'ABANDONED']);

      const taken = terminalCount ?? 0;

      // Read quiz max_attempts via a service-role client — RLS on
      // nclex_tutor_quizzes is tutor-owned, but the student needs to
      // see their own cap. Same pattern as quiz-launch.ts (Slice 3).
      const { createClient: createServiceClient } = await import('@supabase/supabase-js');
      const svc = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const { data: quiz } = await svc
        .from('nclex_tutor_quizzes')
        .select('max_attempts')
        .eq('quiz_id', quizId)
        .maybeSingle();

      const max = quiz?.max_attempts ?? null;
      if (max === null) {
        attemptsLine = `Attempt ${taken} · unlimited`;
        retakeAvailable = true;
      } else {
        attemptsLine = `Attempt ${taken} of ${max}`;
        retakeAvailable = taken < max;
      }
    }

    return {
      ok: true,
      data: {
        exitHref,
        exitLabel:       'Exit to curriculum',
        retakeLabel:     'Take again',
        retakeAvailable,
        attemptsLine,
        reportHref:      null,
      },
    };
  }

  // Any other source — sensible fallback so the popup still works.
  return {
    ok: true,
    data: {
      exitHref,
      exitLabel:       'Exit',
      retakeLabel:     'Take again',
      retakeAvailable: false,
      attemptsLine:    null,
      reportHref:      null,
    },
  };
}


/**
 * Source-aware retake. Returns the new attempt_id for navigation.
 */
export async function restartAttemptAction(
  attemptId: string,
): Promise<ActionResult<{ attempt_id: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: attempt, error: aErr } = await supabase
    .from('nclex_attempts')
    .select('source, programme_activity_id, filters_json, mode, intent, requested_question_count')
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (aErr || !attempt) return { ok: false, error: 'Attempt not found.' };

  if (attempt.source === 'CUSTOM_BUILT') {
    const { data, error } = await supabase.rpc('nclex_create_attempt', {
      p_filters:         attempt.filters_json ?? {},
      p_mode:            attempt.mode,
      p_intent:          attempt.intent,
      p_requested_count: attempt.requested_question_count,
      p_source:          'CUSTOM_BUILT',
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { attempt_id: data as string } };
  }

  if (attempt.source === 'PROGRAMME_ASSIGNED' && attempt.programme_activity_id) {
    // RPC re-validates max_attempts server-side. If the cap was hit
    // since the popup opened, the RPC errors and we surface it.
    const { data, error } = await supabase.rpc('nclex_create_programme_attempt', {
      p_programme_activity_id: attempt.programme_activity_id,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { attempt_id: data as string } };
  }

  return { ok: false, error: 'Retake not supported for this attempt source.' };
}
