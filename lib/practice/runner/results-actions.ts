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
import { TIME_LIMIT_SECONDS } from '@/lib/cat';
import { itemsAdministeredLine } from '@/lib/practice/cat/report-derive';
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
  /** Readiness + CAT: the permanent per-sitting report page. When set, the
   *  popup renders a "see your report" CTA in place of the inline review +
   *  retake (review is reached from the report). Null for every other kind. */
  reportHref:      string | null;
  /** CAT only; null for every other kind.
   *
   *  Grouped rather than parallel nullable fields so the two cases can't
   *  drift apart: a CAT can end WITH a verdict (the engine ran its stop
   *  rule) or WITHOUT one (the exam was ended from outside — the wall
   *  clock expiring it, or abandonment). Those need different sentences
   *  AND different surrounding copy, so `hasVerdict` travels with the
   *  line that depends on it. */
  cat: {
    /** One sentence saying HOW the exam ended. A CAT stops without warning,
     *  so this is the popup's whole job — it's the difference between "this
     *  ended on purpose" and "something broke". */
    reasonLine:  string;
    /** True when the engine produced a measurement. False when the exam
     *  ended from outside and there is no result to show. */
    hasVerdict:  boolean;
  } | null;
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
    .select(
      'source, mode, status, programme_activity_id, filters_json, cat_verdict, cat_termination_reason, cat_items_administered',
    )
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (aErr || !attempt) return { ok: false, error: 'Attempt not found.' };

  // Exit URL — shared resolver (same one the page calls server-side
  // to wire the runner topbar's ← Exit button).
  const exitHref = await resolveAttemptExitHref(supabase, {
    source:                attempt.source,
    programme_activity_id: attempt.programme_activity_id,
    mode:                  attempt.mode,
    filters_json:          attempt.filters_json,
  });

  // CAT — branch on MODE, not source. A CAT attempt is stored with
  // source = 'CUSTOM_BUILT' (there is no 'CAT' source value; see
  // 20260809120000_cat_slice3_create_attempt.sql), so without this branch a
  // finished CAT falls into the bank-Builder case below and gets the wrong
  // popup entirely: a raw "X of N correct" score — the one number §13.5
  // forbids — under a "Session complete" eyebrow, with a "Build another"
  // button that would run the exam through the Builder's RPC.
  //
  // `mode` is the authoritative CAT marker and is set on the same insert, so
  // this stays correct whether or not a 'CAT' source value is added later.
  //
  // exitHref needs no override here — the shared resolver above is itself
  // CAT-aware, which is what keeps this popup's Exit and the runner topbar's
  // Exit pointing at the same place.
  if (attempt.mode === 'CAT') {
    // A verdict means the ENGINE ended the exam — it ran its stop rule and
    // wrote cat_verdict / cat_termination_reason / cat_items_administered
    // together in playTurn. No verdict means the exam was ended from
    // OUTSIDE it: the runner's generic auto-expire flipping the attempt to
    // TIMED_OUT on the wall clock, or abandonment. That path writes none of
    // the CAT columns, so they are all NULL and there is nothing measured.
    //
    // The distinction is load-bearing, and getting it wrong is not a
    // cosmetic failure. itemsAdministeredLine()'s fall-through branch
    // asserts "the engine reached confidence at question N" — safe on the
    // report, which only calls it once a verdict exists, but called here
    // with NULLs it told a student who answered 49 questions and ran out of
    // time that they answered 0 and the engine was confident. Seen on dev.
    const hasVerdict = attempt.cat_verdict !== null;

    let reasonLine: string;
    if (hasVerdict) {
      // Reuses the report's own sentence, so the popup and the page one tap
      // later cannot describe the same ending two different ways.
      reasonLine = itemsAdministeredLine(
        attempt.cat_items_administered ?? 0,
        attempt.cat_termination_reason,
        TIME_LIMIT_SECONDS / 3600,
      );
    } else {
      // cat_items_administered is NULL here by definition, so count the
      // snapshotted questions instead — the same figure the report's
      // abandoned view shows, so the two agree.
      const { count } = await supabase
        .from('nclex_attempt_items')
        .select('attempt_item_id', { count: 'exact', head: true })
        .eq('attempt_id', attemptId);
      const seen = count ?? 0;
      const qs = `${seen} ${seen === 1 ? 'question' : 'questions'}`;
      reasonLine = attempt.status === 'TIMED_OUT'
        ? `Your exam ran out of time after ${qs}.`
        : `Your exam ended after ${qs}.`;
    }

    return {
      ok: true,
      data: {
        exitHref,
        exitLabel:       'Back to CAT home',
        retakeLabel:     '',
        retakeAvailable: false,
        attemptsLine:    null,
        reportHref:      `/student/bank/cat/result/${attemptId}`,
        cat: { reasonLine, hasVerdict },
      },
    };
  }

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
        cat:             null,
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
        cat:             null,
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
        cat:             null,
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
      cat:             null,
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

  // A CAT is stored as source = 'CUSTOM_BUILT', so without this guard it
  // would fall into the Builder branch below and hand mode = 'CAT' to
  // nclex_create_attempt — the wrong RPC entirely (a CAT is created by
  // nclex_create_cat_attempt, which also spends the student's allowance).
  // The CAT popup renders no retake button, so this is unreachable from the
  // UI today; it is guarded anyway because a Server Action is callable
  // directly and "unreachable" is a UI fact, not a server one.
  if (attempt.mode === 'CAT') {
    return { ok: false, error: 'A CAT cannot be retaken from here. Start a new one from CAT home.' };
  }

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
