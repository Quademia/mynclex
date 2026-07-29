// mynclex/lib/calibration/fit.test.ts
//
// The proof that the fit works.
//
// There is no real response data to check against — the best-covered question
// in the bank has 4 answers and needs 30 — and there will not be until real
// students arrive. So the central test builds a world we already know the
// answer to: students whose abilities we choose, questions whose difficulties
// we choose, answers simulated from the model. If the fit recovers the
// difficulties we started from, it works. This is the same proof we would have
// demanded of an off-the-shelf library.

import { describe, it, expect } from 'vitest';
import { fitDifficulties, DEFAULT_MIN_RESPONSES, type CalibrationResponse } from './fit';

// ── a deterministic world ────────────────────────────────────────────
// Seeded so a passing test never becomes a flaky one. mulberry32.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, so abilities are normally spread like a real cohort. */
function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function probability(theta: number, difficulty: number): number {
  return 1 / (1 + Math.exp(-(theta - difficulty)));
}

type World = {
  responses: CalibrationResponse[];
  trueDifficulty: Map<string, number>;
};

/**
 * Simulate a cohort answering a bank.
 *
 * Difficulties are spread evenly across the range the curator bands cover
 * (−2 … +2, per §5.1), abilities drawn from a standard normal.
 */
function simulate(students: number, items: number, seed: number): World {
  const rand = rng(seed);
  const trueDifficulty = new Map<string, number>();
  for (let j = 0; j < items; j++) {
    trueDifficulty.set(`I${j}`, -2 + (4 * j) / (items - 1));
  }

  const responses: CalibrationResponse[] = [];
  for (let i = 0; i < students; i++) {
    const theta = normal(rand);
    for (let j = 0; j < items; j++) {
      const b = trueDifficulty.get(`I${j}`)!;
      responses.push({
        studentId: `S${i}`,
        itemId: `I${j}`,
        score: rand() < probability(theta, b) ? 1 : 0,
        weight: 1,
      });
    }
  }
  return { responses, trueDifficulty };
}

describe('fitDifficulties — recovering difficulties we chose', () => {
  const { responses, trueDifficulty } = simulate(150, 40, 20260729);

  // Every item starts at 0 — deliberately wrong for all but the middle one,
  // so recovery cannot be an artefact of starting at the answer.
  const seeds = new Map([...trueDifficulty.keys()].map((id) => [id, 0]));

  const result = fitDifficulties(responses, seeds, { maxIterations: 40 });

  it('converges', () => {
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(1);
  });

  it('measures every item — all 40 cleared the 30-answer threshold', () => {
    expect(result.measuredItemIds).toHaveLength(40);
    expect(result.responseCounts.get('I0')).toBe(150);
  });

  it('recovers each difficulty close to the truth', () => {
    let worst = 0;
    let total = 0;
    for (const [itemId, truth] of trueDifficulty) {
      const fitted = result.difficulties.get(itemId)!;
      const error = Math.abs(fitted - truth);
      total += error;
      if (error > worst) worst = error;
    }
    const mean = total / trueDifficulty.size;

    // With 150 answers an item's difficulty carries a standard error of
    // roughly 0.16, so a mean error inside 0.25 is the model working rather
    // than a tolerance stretched to fit.
    expect(mean).toBeLessThan(0.25);
    expect(worst).toBeLessThan(0.6);
  });

  it('puts the items in the right ORDER — what selection actually depends on', () => {
    // CAT never asks "is this exactly 0.7". It asks "which of these is
    // closest to the candidate's ability", so the ranking is what matters.
    const ids = [...trueDifficulty.keys()];
    const byFitted = [...ids].sort(
      (a, b) => result.difficulties.get(a)! - result.difficulties.get(b)!,
    );
    const byTruth = [...ids].sort((a, b) => trueDifficulty.get(a)! - trueDifficulty.get(b)!);

    let agreements = 0;
    let pairs = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs++;
        const fittedOrder = byFitted.indexOf(ids[i]) < byFitted.indexOf(ids[j]);
        const truthOrder = byTruth.indexOf(ids[i]) < byTruth.indexOf(ids[j]);
        if (fittedOrder === truthOrder) agreements++;
      }
    }
    expect(agreements / pairs).toBeGreaterThan(0.95);
  });

  it('estimates abilities spread like the cohort that produced them', () => {
    const thetas = [...result.abilities.values()].map((a) => a.theta);
    expect(thetas).toHaveLength(150);
    const mean = thetas.reduce((s, t) => s + t, 0) / thetas.length;
    // Drawn from a standard normal, so the cohort should centre near zero.
    expect(Math.abs(mean)).toBeLessThan(0.25);
    expect(Math.max(...thetas)).toBeGreaterThan(0.5);
    expect(Math.min(...thetas)).toBeLessThan(-0.5);
  });
});

describe('fitDifficulties — the 30-answer threshold', () => {
  it('holds a thin item at its seed while letting a well-answered one move', () => {
    const responses: CalibrationResponse[] = [];

    // A well-answered item everybody finds hard.
    for (let i = 0; i < 40; i++) {
      responses.push({ studentId: `S${i}`, itemId: 'BUSY', score: 0, weight: 1 });
      // ...and an easy anchor, so the students are not all pinned at zero.
      responses.push({ studentId: `S${i}`, itemId: 'ANCHOR', score: 1, weight: 1 });
    }
    // A thin item, answered five times, wrong every time. Left alone it would
    // look extremely hard on the strength of almost nothing.
    for (let i = 0; i < 5; i++) {
      responses.push({ studentId: `S${i}`, itemId: 'THIN', score: 0, weight: 1 });
    }

    const seeds = new Map([
      ['BUSY', 0],
      ['ANCHOR', 0],
      ['THIN', 0],
    ]);
    const result = fitDifficulties(responses, seeds);

    expect(result.measuredItemIds).toContain('BUSY');
    expect(result.measuredItemIds).not.toContain('THIN');

    expect(result.difficulties.get('BUSY')).toBeGreaterThan(0.5);
    expect(result.difficulties.get('THIN')).toBe(0);
    expect(result.responseCounts.get('THIN')).toBe(5);
  });

  it('does nothing at all when no item has enough answers', () => {
    const responses: CalibrationResponse[] = [
      { studentId: 'S1', itemId: 'A', score: 1, weight: 1 },
      { studentId: 'S2', itemId: 'A', score: 0, weight: 1 },
    ];
    const result = fitDifficulties(responses, new Map([['A', 0.75]]));

    expect(result.measuredItemIds).toEqual([]);
    expect(result.iterations).toBe(0);
    expect(result.difficulties.get('A')).toBe(0.75);
    // Abilities are still estimated — the caller gets a coherent result even
    // on the no-op run, which is every run for the next several months.
    expect(result.abilities.size).toBe(2);
  });

  it('uses the threshold from §5.3.1', () => {
    expect(DEFAULT_MIN_RESPONSES).toBe(30);
  });
});

describe('fitDifficulties — partial credit is not flattened (§4.5)', () => {
  it('places a half-right item easier than an all-wrong one', () => {
    const responses: CalibrationResponse[] = [];
    for (let i = 0; i < 40; i++) {
      responses.push({ studentId: `S${i}`, itemId: 'PARTIAL', score: 0.6, weight: 1 });
      responses.push({ studentId: `S${i}`, itemId: 'WRONG', score: 0, weight: 1 });
    }
    const seeds = new Map([
      ['PARTIAL', 0],
      ['WRONG', 0],
    ]);
    const result = fitDifficulties(responses, seeds);

    // Under all-or-nothing scoring both items would be identical — every
    // answer short of full marks counted as a failure. The fraction keeps
    // them apart, which is the whole point of Option 2.
    expect(result.difficulties.get('PARTIAL')!).toBeLessThan(
      result.difficulties.get('WRONG')!,
    );
  });

  it('a case child counts HALF toward ability (§7.4) and FULL toward its own difficulty (§19.4)', () => {
    // Two rules that sound contradictory and are not. A case child is worth
    // half a question when judging the STUDENT, because six children share one
    // scenario and are not six independent questions. But when judging the
    // CHILD ITSELF, the answers it received are simply the answers it
    // received — there is nothing half-strength about the evidence.
    //
    // The maths delivers both from one number without a special case: the
    // weight multiplies every term of the item's own step, top and bottom, so
    // it cancels there. In the ability estimate it multiplies the whole
    // log-likelihood, so it does not.
    //
    // The cancellation is exact only at a FIXED set of abilities. Since the
    // weight does move the abilities, a trace of it reaches the difficulty
    // second-hand — about 0.006 here, against bands a whole logit apart. So
    // the assertion is "the weight does not meaningfully move the item",
    // which is the claim §19.4 actually makes, rather than "not at all".
    const full: CalibrationResponse[] = [];
    const half: CalibrationResponse[] = [];
    for (let i = 0; i < 40; i++) {
      // A mixed pattern, so the item has a real resting point rather than
      // running to the clamp the way an all-wrong item does.
      const score = i % 3 === 0 ? 1 : 0;
      full.push({ studentId: `S${i}`, itemId: 'X', score, weight: 1 });
      half.push({ studentId: `S${i}`, itemId: 'X', score, weight: 0.5 });
      full.push({ studentId: `S${i}`, itemId: 'A', score: 1, weight: 1 });
      half.push({ studentId: `S${i}`, itemId: 'A', score: 1, weight: 1 });
    }
    const seeds = new Map([
      ['X', 0],
      ['A', 0],
    ]);

    const atFull = fitDifficulties(full, seeds);
    const atHalf = fitDifficulties(half, seeds);

    // §19.4 — the item's own difficulty is not meaningfully moved by the
    // weight. Within 0.05 of a logit, against bands spaced a full logit apart.
    expect(atHalf.difficulties.get('X')!).toBeCloseTo(atFull.difficulties.get('X')!, 1);

    // §7.4 — but the student is judged less harshly on it. Everyone here got
    // the hard item mostly wrong, so a heavier weighting drags ability lower.
    const meanTheta = (r: ReturnType<typeof fitDifficulties>) =>
      [...r.abilities.values()].reduce((s, a) => s + a.theta, 0) / r.abilities.size;
    expect(meanTheta(atHalf)).toBeGreaterThan(meanTheta(atFull));
  });
});

describe('fitDifficulties — the awkward inputs', () => {
  it('keeps an item everyone gets right finite', () => {
    const responses: CalibrationResponse[] = [];
    for (let i = 0; i < 40; i++) {
      responses.push({ studentId: `S${i}`, itemId: 'FREEBIE', score: 1, weight: 1 });
    }
    const result = fitDifficulties(responses, new Map([['FREEBIE', 0]]), { clamp: 4 });
    const b = result.difficulties.get('FREEBIE')!;

    // Taken literally this item's difficulty is minus infinity. The clamp is
    // what stops that reaching the database and poisoning every selection.
    expect(Number.isFinite(b)).toBe(true);
    expect(b).toBeGreaterThanOrEqual(-4);
    expect(b).toBeLessThan(0);
  });

  it('survives an empty response set', () => {
    const result = fitDifficulties([], new Map());
    expect(result.measuredItemIds).toEqual([]);
    expect(result.difficulties.size).toBe(0);
    expect(result.abilities.size).toBe(0);
    expect(result.converged).toBe(true);
  });

  it('gives an item with no seed the neutral position rather than guessing', () => {
    const responses: CalibrationResponse[] = [
      { studentId: 'S1', itemId: 'ORPHAN', score: 1, weight: 1 },
    ];
    const result = fitDifficulties(responses, new Map());
    expect(result.difficulties.get('ORPHAN')).toBe(0);
  });

  it('reports honestly when it runs out of rounds', () => {
    const { responses, trueDifficulty } = simulate(60, 20, 7);
    const seeds = new Map([...trueDifficulty.keys()].map((id) => [id, 0]));
    const result = fitDifficulties(responses, seeds, { maxIterations: 1 });

    expect(result.iterations).toBe(1);
    expect(result.converged).toBe(false);
  });
});
