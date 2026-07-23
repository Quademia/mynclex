// mynclex/lib/practice/cat/types.ts
//
// Wire types for the CAT turn handler.
//
// This folder is the SERVER-SIDE ORCHESTRATOR: it touches the database.
// The pure maths lives in `@/lib/cat` and must stay pure — that purity is
// what makes it unit-testable in isolation (§10.6).

import type { CatTerminationReason, CatVerdict } from '@/lib/cat';
import type { BankItemAnswer } from '@/lib/scoring';

/** One administered item, as loaded back for re-estimation. */
export type CatHistoryRow = {
  attempt_item_id: string;
  position:        number;
  item_id:         string;
  question_type:   string;
  /** Snapshotted at selection — never re-read from the bank (§12.7.4). */
  cat_item_difficulty: number | null;
  /** 1.0 standalone, 0.5 case child (§7.4 / §12.7.12). */
  cat_weight:      number | null;
  marks_snapshot:  number;
  score_awarded:   number | null;
};

/** What the caller hands in for one turn. */
export type CatTurnInput = {
  attemptId: string;
  /** The student's answer to the CURRENT (highest-position) item. */
  answer:    BankItemAnswer;
  /** Seconds since the exam clock started — supplied, never read from a clock here. */
  elapsedSeconds: number;
  /**
   * The `attempt_item_id` of the question the CLIENT is looking at as it
   * submits — the idempotency guard (§19.4.4). It MUST come from the client,
   * not be recomputed server-side from "the newest item", because the whole
   * point is to detect the case where those two differ.
   *
   * The scenario: a turn commits (answer recorded, next question inserted) but
   * the response is lost, so the client retries still showing the OLD
   * question. By then the newest item is the NEW question. If the server
   * inferred "newest = the one being answered", the retry would record the old
   * answer against the new question — marking a student on a question they
   * never saw. The client sends the id it actually displayed; the RPC replays
   * instead of advancing when that is no longer newest.
   *
   * Wired inert before 2026-07-21: `turn.ts` set this from its own
   * `loadCurrent` (= newest), so within a request it always equalled newest
   * and the guard could never fire. Slice 6c's Retry button is what makes the
   * lost-response retry a routine action, so it had to be fixed first.
   */
  expectedItemId: string;
};

/** What a turn produces. */
export type CatTurnResult =
  | {
      status: 'CONTINUE';
      theta: number;
      se: number;
      exposureRelaxed: boolean;
      nextItem: {
        attempt_item_id: string;
        position:        number;
        item_id:         string;
        question_type:   string;
        difficulty_irt:  number | null;
      };
    }
  | {
      status: 'COMPLETE';
      theta: number;
      se: number;
      verdict: CatVerdict;
      reason: CatTerminationReason;
      itemsAdministered: number;
      readinessProbability: number;
    };
