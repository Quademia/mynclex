// mynclex/app/(app)/(focused)/session/[attempt_id]/actions.ts
//
// Runner Server Actions — the bridge between client interactions and the
// database. Three actions in 4.1:
//
//   • markStartedAction    — preflight Start. Anchors the timer to NOW().
//   • submitAnswerAction   — per-Q submit. Reads the unsealed key
//                            server-side, runs scoreAttempt() in TS,
//                            persists via nclex_submit_answer RPC, and
//                            returns the unsealed projection for THAT
//                            one item back to the client (per
//                            runner.html §2.3.1 — the per-Q unseal).
//   • completeAttemptAction — Finish click. Aggregates final_score
//                            server-side, flips status to COMPLETED.

'use server';

import { createClient } from '@/lib/supabase/server';
import { scoreAttempt } from '@/lib/scoring';
import type { BankItemAnswer } from '@/lib/scoring';
import type { BankItemCorrect } from '@/lib/bank/types';
import type { QuestionType } from '@/lib/bank/classifications';
import type { SubmitAnswerResult } from '@/lib/bank/runner';

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


export async function completeAttemptAction(
  attemptId: string,
): Promise<ActionResult<{ final_score: number }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase.rpc('nclex_complete_attempt', {
    p_attempt_id: attemptId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { final_score: Number(data) } };
}
