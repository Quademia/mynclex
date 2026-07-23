// mynclex/lib/practice/cat/turn.ts
//
// The CAT core loop — server side. One call = one turn of the exam.
//
// Plan: bank-consumption-cat.html §10.2, §10.6, §19.4 Slice 4.
//
// THE §10.6 SPLIT. This module computes; `cat_next_item` persists and
// selects. Concretely, per turn:
//
//   1. load the attempt's response history   ← DB read
//   2. score the new answer                  ← @/lib/scoring, reused unchanged
//   3. re-estimate ability                   ← @/lib/cat (pure)
//   4. check termination                     ← @/lib/cat (pure)
//   5. hand all of it to cat_next_item       ← DB write, one transaction
//
// Steps 2-4 are pure functions: if any throws, nothing has been written.
// Every write happens inside step 5's single transaction, so §10.3's
// guarantee holds — either the answer is recorded and the next item
// snapshotted, or neither.
//
// WHY THE HISTORY READ EXISTS. §19.4.1's estimator recomputes from the full
// response history rather than nudging a running value, which is what makes
// an attempt exactly replayable. The original plan implied an incremental
// update inside the RPC and so never needed this read.
//
// THIS RUNS SERVER-SIDE ONLY. A student must never be able to post their own
// theta. The practice runner scores client-side with the RPC range-checking
// the result, which is fine for practice and not good enough for a
// high-stakes verdict (§10.6).

import 'server-only';

import { estimateAbility, checkTermination, readinessProbability } from '@/lib/cat';
import type { CatResponse } from '@/lib/cat';
import { scoreAttempt } from '@/lib/scoring';
import type { BankItemAnswer } from '@/lib/scoring';
// The answer-key shape is bank-owned schema (there is no lib/bank barrel).
// practice/ → bank/ is the allowed direction: consumers depend on producers,
// never the reverse (CLAUDE.md folder convention #11).
import type { BankItemCorrect } from '@/lib/bank/types';
import type { QuestionType } from '@/lib/bank/classifications';
import type { CatHistoryRow, CatTurnInput, CatTurnResult } from './types';

/**
 * Turn the stored history into the estimator's input.
 *
 * Rows with no recorded score are skipped rather than treated as zero: an
 * unanswered row is absence of evidence, and scoring it 0 would push the
 * student's estimate down for a question they were never marked on.
 *
 * A row with no snapshotted difficulty is also skipped — it carries no
 * position on the scale, so it cannot inform the estimate. (Selection
 * already requires a non-null difficulty, so this is defensive.)
 */
export function historyToResponses(rows: readonly CatHistoryRow[]): CatResponse[] {
  const out: CatResponse[] = [];
  for (const r of rows) {
    if (r.score_awarded === null || r.cat_item_difficulty === null) continue;
    if (!(r.marks_snapshot > 0)) continue;
    out.push({
      difficulty: r.cat_item_difficulty,
      // §4.5 Option 2 — the FRACTION correct, not a dichotomised right/wrong.
      // Clamped because a stored score should never exceed its own marks,
      // but a bad row must not produce a nonsense likelihood.
      score: Math.min(Math.max(r.score_awarded / r.marks_snapshot, 0), 1),
      weight: r.cat_weight ?? 1,
    });
  }
  return out;
}

/** Minimal client surface, so this module is testable without a live DB. */
export type CatDb = {
  /**
   * The attempt's own clock settings.
   *
   * The time limit is read from the ROW, never from TIME_LIMIT_SECONDS — the
   * constant only stamps the row at creation. See
   * `TerminationInput.timeLimitSeconds` for why.
   */
  loadAttempt(attemptId: string): Promise<{
    duration_seconds: number | null;
    started_at: string | null;
  }>;
  /** Prior administered items with their scores, position order. */
  loadHistory(attemptId: string): Promise<CatHistoryRow[]>;
  /** The current (highest-position) item's answer key + marks + weight. */
  loadCurrent(attemptId: string): Promise<{
    /** Passed back to the RPC as the idempotency guard — see nextItem. */
    attempt_item_id: string;
    correct:        BankItemCorrect;
    question_type:  string;
    marks_snapshot: number;
    cat_item_difficulty: number | null;
    cat_weight:     number | null;
  }>;
  /**
   * The persist-and-select RPC.
   *
   * `expectedItemId` is the idempotency guard: if it is no longer the
   * attempt's newest item, this turn already landed and the RPC replays the
   * current state instead of answering the NEW question with the OLD answer.
   * Without it, a lost response on a flaky connection would mark a student
   * on a question they never saw.
   */
  nextItem(args: {
    attemptId: string;
    expectedItemId: string;
    answer: BankItemAnswer;
    scoreAwarded: number;
    isCorrect: boolean;
    thetaAfter: number;
    seAfter: number;
    terminateReason: string | null;
    terminateVerdict: string | null;
  }): Promise<Record<string, unknown>>;
};

/**
 * Play one turn.
 *
 * Ordering note: the current item is scored and folded into the history
 * BEFORE termination is checked, because the decision must account for the
 * answer just given — otherwise the exam would always run one question past
 * the point it was already sure.
 */
export async function playTurn(db: CatDb, input: CatTurnInput): Promise<CatTurnResult> {
  const [attempt, history, current] = await Promise.all([
    db.loadAttempt(input.attemptId),
    db.loadHistory(input.attemptId),
    db.loadCurrent(input.attemptId),
  ]);

  // 2. Score — reused unchanged from the shared engine (§10.2).
  const scored = scoreAttempt(
    current.question_type as QuestionType,
    current.correct,
    input.answer,
  );

  // 3. Re-estimate over history + this answer.
  const responses = historyToResponses(history);
  if (current.cat_item_difficulty !== null && current.marks_snapshot > 0) {
    responses.push({
      difficulty: current.cat_item_difficulty,
      score: Math.min(Math.max(scored.score_awarded / current.marks_snapshot, 0), 1),
      weight: current.cat_weight ?? 1,
    });
  }
  const { theta, se } = estimateAbility(responses);

  // 4. Termination. itemsAdministered counts everything served INCLUDING the
  // one just answered — history holds the earlier items, this is the latest.
  const itemsAdministered = history.length + 1;
  const decision = checkTermination({
    theta,
    se,
    itemsAdministered,
    elapsedSeconds: input.elapsedSeconds,
    // From the row, not the constant. A CAT always has a duration
    // (nclex_create_cat_attempt stamps one); the fallback exists only so a
    // malformed row cannot crash a live exam mid-turn, and it errs toward
    // letting the student continue rather than cutting them off.
    timeLimitSeconds: attempt.duration_seconds ?? Number.POSITIVE_INFINITY,
  });

  // 5. Persist (+ select, when continuing). One transaction.
  //
  // expectedItemId is the CLIENT's — the item it displayed as it submitted,
  // NOT current.attempt_item_id (the server's newest). Passing newest here is
  // what made the guard inert: it could never differ from what the RPC reads
  // as newest in the same transaction. See CatTurnInput.expectedItemId.
  const raw = await db.nextItem({
    attemptId: input.attemptId,
    expectedItemId: input.expectedItemId,
    answer: input.answer,
    scoreAwarded: scored.score_awarded,
    isCorrect: scored.is_correct,
    thetaAfter: theta,
    seAfter: se,
    terminateReason: decision.stop ? decision.reason : null,
    terminateVerdict: decision.stop ? decision.verdict : null,
  });

  // A replay means the turn had already landed — the RPC wrote nothing and
  // re-served the current state, because the answer we just scored was for an
  // item that is no longer newest (the lost-response retry). Our locally
  // computed score AND termination decision are for that stale item, so
  // discard them: honour what the server actually did, not what we intended.
  // Without this, a replay whose stale decision happened to be `stop` would
  // return COMPLETE to a client whose attempt is still IN_PROGRESS.
  const replayed = Boolean((raw as { replayed?: boolean }).replayed);

  if (!replayed && decision.stop) {
    return {
      status: 'COMPLETE',
      theta,
      se,
      verdict: decision.verdict,
      reason: decision.reason,
      itemsAdministered,
      // Computed, never stored (§12.7.12) — a recomputable value should not
      // also be persisted, because the copy can drift from its formula.
      readinessProbability: readinessProbability(theta, se),
    };
  }

  const next = (raw as { next_item_payload?: Record<string, unknown> }).next_item_payload ?? {};
  return {
    status: 'CONTINUE',
    theta,
    se,
    exposureRelaxed: Boolean((raw as { exposure_relaxed?: boolean }).exposure_relaxed),
    nextItem: next as CatTurnResult extends { nextItem: infer N } ? N : never,
  };
}
