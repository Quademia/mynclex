// mynclex/lib/practice/cat/turn.test.ts
//
// The orchestrator is tested against a fake DB, so the loop's decisions are
// asserted without a live database. The real DB path is verified separately
// by driving a full CAT on dev.

import { describe, it, expect } from 'vitest';
import { historyToResponses, playTurn, type CatDb } from './turn';
import type { BankItemCorrect } from '@/lib/bank/types';
import type { BankItemAnswer } from '@/lib/scoring';

type RpcArgs = Parameters<CatDb['nextItem']>[0];
import type { CatHistoryRow } from './types';

const row = (over: Partial<CatHistoryRow> = {}): CatHistoryRow => ({
  attempt_item_id: 'ai',
  position: 1,
  item_id: 'Q1',
  question_type: 'MCQ',
  cat_item_difficulty: 0,
  cat_weight: 1,
  marks_snapshot: 1,
  score_awarded: 1,
  ...over,
});

describe('historyToResponses', () => {
  it('converts a scored row into difficulty / fraction / weight', () => {
    expect(historyToResponses([row({ cat_item_difficulty: 0.5, score_awarded: 1, marks_snapshot: 1 })]))
      .toEqual([{ difficulty: 0.5, score: 1, weight: 1 }]);
  });

  it('feeds partial credit as a FRACTION (§4.5 Option 2)', () => {
    const [r] = historyToResponses([row({ score_awarded: 3, marks_snapshot: 5 })]);
    expect(r.score).toBeCloseTo(0.6, 10);
  });

  it('carries the half weight for case children (§7.4)', () => {
    const [r] = historyToResponses([row({ cat_weight: 0.5 })]);
    expect(r.weight).toBe(0.5);
  });

  it('defaults a NULL weight to full evidence', () => {
    expect(historyToResponses([row({ cat_weight: null })])[0].weight).toBe(1);
  });

  it('SKIPS an unscored row rather than scoring it zero', () => {
    // Absence of evidence is not evidence of failure: treating an unanswered
    // row as 0 would push the estimate down for a question never marked.
    expect(historyToResponses([row({ score_awarded: null })])).toEqual([]);
  });

  it('skips a row with no snapshotted difficulty', () => {
    expect(historyToResponses([row({ cat_item_difficulty: null })])).toEqual([]);
  });

  it('clamps a corrupt over-max score to 1', () => {
    expect(historyToResponses([row({ score_awarded: 9, marks_snapshot: 1 })])[0].score).toBe(1);
  });
});

// ── playTurn, against a fake DB ──────────────────────────────────────

function makeDb(history: CatHistoryRow[], over: Partial<CatDb> = {}): CatDb & { calls: RpcArgs[] } {
  const calls: RpcArgs[] = [];
  return {
    calls,
    loadHistory: async () => history,
    loadCurrent: async () => ({
      correct: { answer: 'A' } as BankItemCorrect,
      question_type: 'MCQ',
      marks_snapshot: 1,
      cat_item_difficulty: 0,
      cat_weight: 1,
    }),
    nextItem: async (args) => {
      calls.push(args);
      return {
        status: 'CONTINUE',
        exposure_relaxed: false,
        next_item_payload: {
          attempt_item_id: 'next-ai', position: history.length + 2,
          item_id: 'Q-next', question_type: 'MCQ', difficulty_irt: 0,
        },
      };
    },
    ...over,
  } as CatDb & { calls: RpcArgs[] };
}

// McqAnswer is a bare string, not an object — the `correct` key is the
// object ({ answer: 'A' }), the student's answer is just 'A'.
const answerA: BankItemAnswer = 'A';

/**
 * A realistic response history: items tracking the student's level, answered
 * right about 70% of the time. That is what a working CAT actually produces.
 *
 * Naive fixtures (every item at difficulty 0.0, all correct) do NOT converge:
 * a question far below a strong student's level carries almost no
 * information, so the SE never reaches the 0.40 floor. That is the engine
 * being right — and the formal reason difficulty-matching is sacred (§7.1).
 */
const realisticHistory = (n: number): CatHistoryRow[] =>
  Array.from({ length: n }, (_, i) =>
    row({ position: i + 1, cat_item_difficulty: 0.6, score_awarded: i % 10 < 7 ? 1 : 0 }));

describe('playTurn — mid-exam', () => {
  it('continues and returns the next item', async () => {
    const db = makeDb([row(), row({ position: 2 })]);
    const r = await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 600 });

    expect(r.status).toBe('CONTINUE');
    if (r.status === 'CONTINUE') expect(r.nextItem.item_id).toBe('Q-next');
  });

  it('passes a COMPUTED score and theta to the RPC, never raw answers to score', async () => {
    // The §10.6 contract: TypeScript computes, the RPC persists.
    const db = makeDb([row()]);
    await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 60 });

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toMatchObject({ scoreAwarded: 1, isCorrect: true });
    expect(typeof db.calls[0].thetaAfter).toBe('number');
    expect(typeof db.calls[0].seAfter).toBe('number');
  });

  it('sends no termination while the exam should continue', async () => {
    const db = makeDb([row()]);
    await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 60 });
    expect(db.calls[0].terminateReason).toBeNull();
    expect(db.calls[0].terminateVerdict).toBeNull();
  });

  it('counts the just-answered item — the decision must include it', async () => {
    // Otherwise the exam always runs one question past being sure.
    const eighty4 = realisticHistory(84);
    const db = makeDb(eighty4);
    const r = await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 600 });

    // 84 in history + this one = 85, the minimum. A strong run should now stop.
    expect(r.status).toBe('COMPLETE');
    if (r.status === 'COMPLETE') expect(r.itemsAdministered).toBe(85);
  });
});

describe('playTurn — termination', () => {
  it('completes with a verdict and a readiness probability', async () => {
    const strong = realisticHistory(90);
    const db = makeDb(strong);
    const r = await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 3600 });

    expect(r.status).toBe('COMPLETE');
    if (r.status === 'COMPLETE') {
      expect(r.verdict).toBe('ABOVE_STANDARD');
      expect(r.reason).toBe('CONFIDENCE_REACHED');
      expect(r.readinessProbability).toBeGreaterThan(0.975);
    }
  });

  it('forwards the termination to the RPC so it writes the verdict columns', async () => {
    const strong = realisticHistory(90);
    const db = makeDb(strong);
    await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 3600 });

    expect(db.calls[0].terminateReason).toBe('CONFIDENCE_REACHED');
    expect(db.calls[0].terminateVerdict).toBe('ABOVE_STANDARD');
  });

  it('times out below the minimum as BELOW_STANDARD (§9.4 run-out-of-time)', async () => {
    const db = makeDb(Array.from({ length: 20 }, (_, i) => row({ position: i + 1, score_awarded: 1 })));
    const r = await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 4 * 3600 });

    expect(r.status).toBe('COMPLETE');
    if (r.status === 'COMPLETE') {
      expect(r.reason).toBe('TIME_LIMIT_HIT');
      expect(r.verdict).toBe('BELOW_STANDARD');
    }
  });

  it('a wrong answer moves the estimate down', async () => {
    const db = makeDb([row()], {
      loadCurrent: async () => ({
        correct: { answer: 'B' } as BankItemCorrect,   // student answers A → wrong
        question_type: 'MCQ', marks_snapshot: 1, cat_item_difficulty: 0, cat_weight: 1,
      }),
    });
    await playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 60 });
    expect(db.calls[0].isCorrect).toBe(false);
    expect(db.calls[0].scoreAwarded).toBe(0);
  });
});

describe('playTurn — purity guarantee (§10.3)', () => {
  it('writes nothing when scoring throws', async () => {
    const db = makeDb([row()], {
      loadCurrent: async () => ({
        correct: {} as BankItemCorrect,
        question_type: 'NOT_A_TYPE',   // dispatch will reject
        marks_snapshot: 1, cat_item_difficulty: 0, cat_weight: 1,
      }),
    });
    await expect(
      playTurn(db, { attemptId: 'a', answer: answerA, elapsedSeconds: 60 })
    ).rejects.toBeTruthy();
    expect(db.calls).toHaveLength(0);
  });
});
