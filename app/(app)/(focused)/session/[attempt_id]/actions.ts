// mynclex/app/(app)/(focused)/session/[attempt_id]/actions.ts
//
// Runner Server Actions — the bridge between client interactions and the
// database. Five actions:
//
//   • markStartedAction     — preflight Start. Anchors the timer to NOW().
//   • saveProgressAction    — universal save-on-tap (slice 4.5a). Persists
//                             every material answer change as a DRAFT row.
//                             Called debounced (~500ms) from runner.tsx
//                             onAnswerChange. Per runner.html §9.1.
//   • submitAnswerAction    — per-Q submit. Reads the unsealed key
//                             server-side, runs scoreAttempt() in TS,
//                             persists via nclex_submit_answer RPC (which
//                             promotes the existing DRAFT row from
//                             save-on-tap to SUBMITTED), and returns the
//                             unsealed projection for THAT one item back
//                             to the client (per runner.html §2.3.1).
//   • completeAttemptAction — Finish click. Aggregates final_score
//                             server-side, flips status to COMPLETED.
//   • expireAttemptAction   — timer expiry (slice 4.5a). Multi-step:
//                             fetches DRAFT rows + their snapshot keys,
//                             scores each in TS, AUTO_SUBMITs them via
//                             the existing submit RPC, then calls
//                             nclex_expire_attempt to insert SKIPPED rows
//                             for items with no answer + flip status to
//                             TIMED_OUT + compute final_score. Triggered
//                             by lazy detection in page.tsx OR by the
//                             client-side countdown hitting zero.

'use server';

import { createClient } from '@/lib/supabase/server';
import { expireCat } from '@/lib/practice/cat/expire';
import { makeCatExpireDb } from '@/lib/practice/cat/db';
import { scoreAttempt } from '@/lib/scoring';
import type { BankItemAnswer } from '@/lib/scoring';
import type { BankItemCorrect } from '@/lib/bank/types';
import type { QuestionType } from '@/lib/bank/classifications';
import type { SubmitAnswerResult } from '@/lib/practice/runner';

export type ActionResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };


export async function markStartedAction(
  attemptId: string,
): Promise<ActionResult<{ started_at: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase.rpc('nclex_mark_attempt_started', {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { started_at: data as string } };
}


// Readiness preflight Start (step 2b-ii). Distinct from markStartedAction:
// starting a readiness sitting IS spending the one-shot credit, so this goes
// through nclex_start_readiness_attempt, which atomically stamps the credit's
// used_at + attempt_id AND anchors the timer (§2 r1). Idempotent on re-entry.
export async function startReadinessAttemptAction(
  attemptId: string,
): Promise<ActionResult<{ started_at: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase.rpc('nclex_start_readiness_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { started_at: data as string } };
}


export async function submitAnswerAction(
  attemptItemId: string,
  answerJson:    BankItemAnswer,
): Promise<ActionResult<SubmitAnswerResult>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Server-side read of the unsealed snapshot. RLS enforces ownership.
  // Scoring runs here in TS (lib/scoring/scoreAttempt) — see the slice
  // 2.3 migration header for why we don't duplicate the math in PG.
  const { data, error: iErr } = await supabase
    .from('nclex_attempt_items')
    .select(
      'question_type, marks_snapshot, ' +
      'correct_answer_snapshot_json, rationale_snapshot, rationale_img_snapshot',
    )
    .eq('attempt_item_id', attemptItemId)
    .maybeSingle();
  if (iErr || !data) return { ok: false, error: 'Item not found.' };

  // The select-string-with-concat above defeats supabase-js's row-shape
  // inference (returns GenericStringError); cast through unknown.
  const item = data as unknown as {
    question_type:                string;
    marks_snapshot:               number;
    correct_answer_snapshot_json: BankItemCorrect;
    rationale_snapshot:           string | null;
    rationale_img_snapshot:       string | null;
  };

  const correct = item.correct_answer_snapshot_json;
  const { score_awarded, is_correct } = scoreAttempt(
    item.question_type as QuestionType,
    correct,
    answerJson,
  );

  const { error: rErr } = await supabase.rpc('nclex_submit_answer', {
    p_attempt_item_id: attemptItemId,
    p_answer_json:     answerJson as unknown,
    p_score_awarded:   score_awarded,
    p_is_correct:      is_correct,
  });
  if (rErr) return { ok: false, error: rErr.message };

  return {
    ok: true,
    data: {
      attempt_item_id:              attemptItemId,
      score_awarded,
      is_correct,
      marks_max:                    item.marks_snapshot,
      correct_answer_snapshot_json: correct,
      rationale_snapshot:           item.rationale_snapshot,
      rationale_img_snapshot:       item.rationale_img_snapshot,
    },
  };
}


// Internal: flush every DRAFT row for an attempt as `terminalStatus`
// (SUBMITTED for deliberate Finish, AUTO_SUBMITTED for timer expiry).
// Reads each DRAFT's snapshot key, scores in TS via scoreAttempt(),
// then calls nclex_submit_answer with the terminal status. The submit
// RPC's promotion-from-DRAFT path handles the row update.
//
// Sequential (not Promise.all) so first failure aborts cleanly. The
// caller can then surface the error without leaving half-flushed
// state.
async function _flushDrafts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  attemptId: string,
  terminalStatus: 'SUBMITTED' | 'AUTO_SUBMITTED',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: itemsRaw, error: iErr } = await supabase
    .from('nclex_attempt_items')
    .select('attempt_item_id, question_type, marks_snapshot, correct_answer_snapshot_json')
    .eq('attempt_id', attemptId);
  if (iErr) return { ok: false, error: iErr.message };

  const items = (itemsRaw ?? []) as unknown as Array<{
    attempt_item_id:              string;
    question_type:                string;
    marks_snapshot:               number;
    correct_answer_snapshot_json: BankItemCorrect;
  }>;
  const itemMap = new Map(items.map((it) => [it.attempt_item_id, it]));

  const { data: draftsRaw, error: dErr } = await supabase
    .from('nclex_attempt_answers')
    .select('attempt_item_id, answer_json')
    .eq('attempt_id', attemptId)
    .eq('submission_status', 'DRAFT');
  if (dErr) return { ok: false, error: dErr.message };

  const drafts = (draftsRaw ?? []) as unknown as Array<{
    attempt_item_id: string;
    answer_json:     BankItemAnswer;
  }>;

  for (const draft of drafts) {
    const item = itemMap.get(draft.attempt_item_id);
    if (!item) continue;

    // Skip time-only placeholders — a DRAFT with a NULL answer_json is a
    // read-then-skip row created by the per-question time engine
    // (nclex_add_answer_time), not a real answer to submit. The complete /
    // expire RPCs convert these to SKIPPED, preserving time_spent_sec.
    if (draft.answer_json === null || draft.answer_json === undefined) continue;

    const { score_awarded, is_correct } = scoreAttempt(
      item.question_type as QuestionType,
      item.correct_answer_snapshot_json,
      draft.answer_json,
    );

    const { error: sErr } = await supabase.rpc('nclex_submit_answer', {
      p_attempt_item_id:   draft.attempt_item_id,
      p_answer_json:       draft.answer_json as unknown,
      p_score_awarded:     score_awarded,
      p_is_correct:        is_correct,
      p_submission_status: terminalStatus,
    });
    if (sErr) return { ok: false, error: sErr.message };
  }

  return { ok: true };
}


// Deliberate Finish (Free-batched + Sequential have DRAFTs to flush;
// UL has all SUBMITTEDs already because per-Q submit was wired in
// 4.1.5). _flushDrafts is a no-op when no DRAFTs exist, so we can call
// it unconditionally.
export async function completeAttemptAction(
  attemptId: string,
): Promise<ActionResult<{ final_score: number }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const flush = await _flushDrafts(supabase, attemptId, 'SUBMITTED');
  if (!flush.ok) return { ok: false, error: flush.error };

  const { data, error } = await supabase.rpc('nclex_complete_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { final_score: Number(data) } };
}


// Universal save-on-tap. Called debounced (~500ms) from runner.tsx whenever
// a student materially changes their answer. Persists as a DRAFT row and
// appends a {at, from, to} entry to answer_changes_json per
// attempt-creation §6.3.3. RPC is no-op when the answer is unchanged from
// the existing DRAFT — defensive against debounce edge cases.
export async function saveProgressAction(
  attemptItemId: string,
  answerJson:    BankItemAnswer,
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase.rpc('nclex_save_progress', {
    p_attempt_item_id: attemptItemId,
    p_answer_json:     answerJson as unknown,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}


// Per-question time flush (per-question time engine, attempt-creation
// §6.3.2). Called fire-and-forget from the runner's useQuestionTimer hook
// on each engaged-segment end — one additive "+seconds on item" write.
// Deliberately returns void and swallows failures: a dropped time flush
// must never disrupt the sitting. The additive model self-heals on the
// next flush, and flushActive() awaits this before finish so the last
// segment lands. `seconds` is whole seconds; the RPC clamps for sanity.
export async function recordQuestionTimeAction(
  attemptItemId: string,
  seconds:       number,
): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc('nclex_add_answer_time', {
    p_attempt_item_id: attemptItemId,
    p_delta_sec:       Math.floor(seconds),
  });
}


// Timer expiry. Triggered by lazy detection (page.tsx mounts and notices
// `now() >= started_at + duration_seconds`) or by the client-side
// countdown hitting zero. Two-step finalisation:
//
//   1. Flush DRAFT rows as AUTO_SUBMITTED (shared with completeAttemptAction
//      via _flushDrafts helper).
//   2. Call nclex_expire_attempt to insert SKIPPED rows for items with
//      no answer at all, compute final_score, and flip status to
//      TIMED_OUT (with ended_at = started_at + duration_seconds — the
//      true expiry, not the detection moment, per §6.1.3).
//
// Idempotent end-to-end: if the attempt is already terminal, the expire
// RPC short-circuits and returns the stored final_score; _flushDrafts
// runs over an empty set in that case.
//
// CAT TAKES A DIFFERENT ROUTE (§19.4.6, 2026-07-22). Both expiry triggers —
// the countdown hitting zero in runner.tsx and the lazy catch-up in page.tsx
// — call THIS function, which is why the branch lives here rather than at
// either trigger. Putting it in the client runner would also mean trusting
// the browser to say which path a high-stakes verdict takes.
//
// nclex_expire_attempt is mode-blind: it flips a CAT to TIMED_OUT and writes
// none of the cat_* columns, which left every timed-out CAT with no verdict
// at all. See lib/practice/cat/expire.ts for the full write-up.
export async function expireAttemptAction(
  attemptId: string,
): Promise<ActionResult<{ final_score: number | null }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const flush = await _flushDrafts(supabase, attemptId, 'AUTO_SUBMITTED');
  if (!flush.ok) return { ok: false, error: flush.error };

  const { data: attempt, error: attemptErr } = await supabase
    .from('nclex_attempts')
    .select('mode, started_at, duration_seconds')
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (attemptErr) return { ok: false, error: attemptErr.message };
  if (!attempt)   return { ok: false, error: 'That attempt could not be found.' };

  if (attempt.mode === 'CAT') {
    // Elapsed is derived from the ROW, server-side. The turn path takes it
    // from the client (pre-existing, and there a wrong value only shortens
    // the student's own exam) — but this call decides a verdict with no
    // answer behind it, so it must not be influenceable from the browser.
    if (!attempt.started_at || attempt.duration_seconds === null) {
      return { ok: false, error: 'That exam has no clock to expire.' };
    }
    const elapsedSeconds = Math.floor((Date.now() - Date.parse(attempt.started_at)) / 1000);

    try {
      await expireCat(makeCatExpireDb(supabase), { attemptId, elapsedSeconds });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // "has not timed out" / "timer has not yet expired" mean the caller
      // raced the clock. Surface it rather than silently falling through to
      // the generic path, which would strip the verdict off a live exam.
      if (msg.includes('has not timed out') || msg.includes('timer has not yet expired')) {
        return { ok: false, error: 'This exam has not run out of time yet.' };
      }
      return { ok: false, error: 'Could not finalise this exam. Please reload.' };
    }

    // A CAT has no final_score by design — §13.5 forbids showing one, and
    // the engine's own terminal branch does not write one either.
    return { ok: true, data: { final_score: null } };
  }

  const { data, error } = await supabase.rpc('nclex_expire_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { final_score: Number(data) } };
}
