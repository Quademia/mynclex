// mynclex/lib/practice/cat/expire.test.ts
//
// The timed-out-CAT path, against a fake DB. The live DB path is verified
// separately by back-dating a real dev attempt past its limit and letting
// the lazy expiry fire.

import { describe, it, expect, vi } from 'vitest';
import { expireCat, type CatExpireDb } from './expire';
import { TIME_LIMIT_SECONDS, MIN_ITEMS } from '@/lib/cat';
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

/** n answered rows, all correct at the given difficulty unless overridden. */
const rows = (n: number, over: Partial<CatHistoryRow> = {}): CatHistoryRow[] =>
  Array.from({ length: n }, (_, i) =>
    row({ attempt_item_id: `ai-${i}`, position: i + 1, item_id: `Q${i}`, ...over }));

type Written = Parameters<CatExpireDb['expire']>[0];

function makeDb(
  history: CatHistoryRow[],
  durationSeconds: number | null = TIME_LIMIT_SECONDS,
): CatExpireDb & { writes: Written[] } {
  const writes: Written[] = [];
  return {
    writes,
    loadAttempt: async () => ({ duration_seconds: durationSeconds, started_at: null }),
    loadHistory: async () => history,
    expire: async (args) => { writes.push(args); },
  };
}

describe('expireCat — a timed-out CAT gets a verdict (§19.4.6)', () => {
  it('writes the verdict and the CAT columns', async () => {
    const db = makeDb(rows(100));
    const r = await expireCat(db, { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS });

    // The defect this fixes: before, NOTHING was written and cat_verdict
    // stayed NULL, so the student was told the exam "ended early".
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({ attemptId: 'a', verdict: r.verdict });
    expect(r.verdict).toMatch(/ABOVE_STANDARD|BELOW_STANDARD/);
  });

  it('resolves BELOW when fewer than the minimum were answered', async () => {
    // §9.3's Run-Out-Of-Time rule — too little evidence to credit a pass,
    // however well the student was doing.
    const db = makeDb(rows(40));
    const r = await expireCat(db, { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS });
    expect(r.verdict).toBe('BELOW_STANDARD');
  });

  it('resolves by side once past the minimum', async () => {
    const strong = await expireCat(makeDb(rows(MIN_ITEMS)), {
      attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS,
    });
    const weak = await expireCat(makeDb(rows(MIN_ITEMS, { score_awarded: 0 })), {
      attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS,
    });
    expect(strong.verdict).toBe('ABOVE_STANDARD');
    expect(weak.verdict).toBe('BELOW_STANDARD');
  });
});

describe('expireCat — the item count is what the student ANSWERED', () => {
  it('counts the history, not the served item', async () => {
    // loadHistory drops the newest attempt_item, which in an IN_PROGRESS CAT
    // is always the live unanswered question. Counting it would inflate the
    // report's "You answered N questions" by one AND could tip a student
    // over the 85-item line on a question they never saw.
    const db = makeDb(rows(120));
    const r = await expireCat(db, { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS });

    expect(r.itemsAdministered).toBe(120);
    expect(db.writes[0].itemsAdministered).toBe(120);
  });

  it('an unscored row cannot pollute the estimate', async () => {
    // Belt and braces on the invariant above: even if an unanswered row DID
    // reach the estimator, historyToResponses drops it rather than scoring
    // it zero — absence of evidence is not evidence of failure.
    const clean = await expireCat(makeDb(rows(90)), {
      attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS,
    });
    const withUnanswered = await expireCat(
      makeDb([...rows(90), row({ attempt_item_id: 'live', position: 91, score_awarded: null })]),
      { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS },
    );
    expect(withUnanswered.theta).toBeCloseTo(clean.theta, 10);
  });
});

describe('expireCat — it agrees with the engine', () => {
  it('same evidence, same verdict as a mid-turn time-out', async () => {
    // Both paths call the SAME checkTermination, so a CAT that runs out
    // between turns and one that runs out inside a turn cannot disagree.
    // This is the property that made a separate SQL implementation wrong.
    //
    // The history is deliberately MIXED — a realistic timed-out exam, where
    // the engine had not yet got sure. An all-correct history reaches
    // confidence instead, which is a state a live CAT cannot be in here (the
    // previous turn would have stopped it).
    const mixed = rows(100).map((r, i) => ({ ...r, score_awarded: i % 2 }));
    const db = makeDb(mixed);
    const r = await expireCat(db, { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS });

    const { checkTermination, estimateAbility } = await import('@/lib/cat');
    const { historyToResponses } = await import('./turn');
    const { theta, se } = estimateAbility(historyToResponses(mixed));
    const engine = checkTermination({
      theta, se, itemsAdministered: 100,
      elapsedSeconds: TIME_LIMIT_SECONDS,
      timeLimitSeconds: TIME_LIMIT_SECONDS,
    });

    expect(engine).toMatchObject({ stop: true, reason: 'TIME_LIMIT_HIT', verdict: r.verdict });
  });

  it('derives the readiness probability rather than storing it (§12.7.12)', async () => {
    const db = makeDb(rows(100));
    const r = await expireCat(db, { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS });

    expect(r.readinessProbability).toBeGreaterThanOrEqual(0);
    expect(r.readinessProbability).toBeLessThanOrEqual(1);
    // Not among the persisted columns.
    expect(db.writes[0]).not.toHaveProperty('readinessProbability');
  });
});

describe('expireCat — it refuses to invent a verdict', () => {
  it('throws, and writes NOTHING, if the exam has not timed out', async () => {
    // A verdict with no time-out behind it would be a fabrication. Failing
    // loudly is right: the caller has a bug.
    const db = makeDb(rows(100));
    await expect(
      expireCat(db, { attemptId: 'a', elapsedSeconds: 60 }),
    ).rejects.toThrow(/has not timed out/);
    expect(db.writes).toHaveLength(0);
  });

  it('honours the ROW’s limit, not the constant (§9.3 reopened)', async () => {
    // An exam sold as 5 hours must not be cut off at 4 because the module
    // constant still says 4 — the case that motivated taking the limit as
    // input in the first place.
    const fiveHours = 5 * 60 * 60;
    const db = makeDb(rows(100), fiveHours);

    await expect(
      expireCat(db, { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS }),
    ).rejects.toThrow(/has not timed out/);
    expect(db.writes).toHaveLength(0);

    const r = await expireCat(db, { attemptId: 'a', elapsedSeconds: fiveHours });
    expect(r.verdict).toBeTruthy();
  });

  it('does not write when the estimate throws', async () => {
    // Steps 3-4 are pure and run BEFORE the write, so a failure there
    // leaves the attempt untouched and retryable.
    const db = makeDb(rows(100));
    const spy = vi.spyOn(db, 'expire');
    await expect(
      expireCat({ ...db, loadHistory: async () => { throw new Error('boom'); } },
        { attemptId: 'a', elapsedSeconds: TIME_LIMIT_SECONDS }),
    ).rejects.toThrow('boom');
    expect(spy).not.toHaveBeenCalled();
  });
});
