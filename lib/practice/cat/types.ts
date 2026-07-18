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
