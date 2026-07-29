// mynclex/lib/calibration/rules.test.ts

import { describe, it, expect } from 'vitest';
import {
  decideCalibration,
  planCalibration,
  BLEND_NEW,
  BLEND_PREVIOUS,
  DEFAULT_MIN_RESPONSES,
  type CalibrationCandidate,
} from './rules';

const candidate = (over: Partial<CalibrationCandidate> = {}): CalibrationCandidate => ({
  itemId: 'NCLEX_MCQ_00001',
  previousValue: 0,
  previousSource: 'CURATOR_LABEL',
  rawEmpirical: 0.7,
  responseCount: 40,
  ...over,
});

describe('the 30-answer threshold (§5.3.1)', () => {
  it('refuses to move an item with 29 answers', () => {
    const d = decideCalibration(candidate({ responseCount: 29 }));
    expect(d.write).toBe(false);
    expect(d).toMatchObject({ reason: 'BELOW_THRESHOLD' });
  });

  it('allows it at exactly 30 — the threshold is inclusive', () => {
    expect(decideCalibration(candidate({ responseCount: 30 })).write).toBe(true);
  });

  it('defaults to the figure §5.3.1 settled', () => {
    expect(DEFAULT_MIN_RESPONSES).toBe(30);
  });
});

describe('the 70/30 blend (§5.3.3)', () => {
  it('lands 70% of the way from the old value to the new one', () => {
    // The worked example from §5.3.3: stored 0.0, measured 0.7, becomes 0.49.
    const d = decideCalibration(candidate({ previousValue: 0, rawEmpirical: 0.7 }));
    expect(d).toMatchObject({ write: true, newValue: 0.49 });
  });

  it('dampens a lurch rather than following it', () => {
    // A wild swing from −1 to +2 must not arrive whole.
    const d = decideCalibration(candidate({ previousValue: -1, rawEmpirical: 2 }));
    if (!d.write) throw new Error('expected a write');
    expect(d.newValue).toBeCloseTo(BLEND_NEW * 2 + BLEND_PREVIOUS * -1, 6);
    expect(d.newValue).toBeLessThan(2);
    expect(d.newValue).toBeGreaterThan(-1);
  });

  it('converges on the measurement over repeated runs', () => {
    // The blend is only defensible if it actually arrives. Feed the same
    // measurement back week after week and it should close on it.
    let stored = 0;
    for (let week = 0; week < 12; week++) {
      const d = decideCalibration(candidate({ previousValue: stored, rawEmpirical: 1.5 }));
      if (!d.write) break;
      stored = d.newValue;
    }
    expect(stored).toBeCloseTo(1.5, 3);
  });

  it('stands alone when there is nothing to blend against', () => {
    const d = decideCalibration(candidate({ previousValue: null, rawEmpirical: 1.2 }));
    expect(d).toMatchObject({ write: true, newValue: 1.2 });
  });

  it('keeps the raw measurement alongside the blended one', () => {
    // §17.2 stores both, so a suspicious blend can be traced to what was
    // actually measured rather than only to what was kept.
    const d = decideCalibration(candidate({ previousValue: 0, rawEmpirical: 0.7 }));
    expect(d).toMatchObject({ newValue: 0.49, rawEmpirical: 0.7 });
  });
});

describe('the source only moves one way (§5.2 / §5.3.4)', () => {
  it('flips a curator seed to measured on first crossover', () => {
    const d = decideCalibration(
      candidate({ previousSource: 'CURATOR_LABEL', previousValue: 1, rawEmpirical: 1 }),
    );
    // Same number either side — but the item has stopped being an opinion,
    // and that is the change §5.3.4 is about, so it must be recorded.
    expect(d).toMatchObject({ write: true, newSource: 'EMPIRICAL', previousSource: 'CURATOR_LABEL' });
  });

  it('never writes back to CURATOR_LABEL', () => {
    const d = decideCalibration(candidate({ previousSource: 'EMPIRICAL', rawEmpirical: -1.5 }));
    if (!d.write) throw new Error('expected a write');
    expect(d.newSource).toBe('EMPIRICAL');
  });
});

describe('a run that changes nothing writes nothing', () => {
  it('skips an already-measured item whose value has not moved', () => {
    const d = decideCalibration(
      candidate({ previousSource: 'EMPIRICAL', previousValue: 0.8, rawEmpirical: 0.8 }),
    );
    expect(d).toMatchObject({ write: false, reason: 'UNCHANGED' });
  });

  it('still writes when the movement is real but small', () => {
    const d = decideCalibration(
      candidate({ previousSource: 'EMPIRICAL', previousValue: 0.8, rawEmpirical: 0.9 }),
    );
    expect(d.write).toBe(true);
  });

  it('treats a move below the stored precision as no move', () => {
    // 0.800001 blends to 0.8000007, which rounds to the stored 0.8. Writing
    // that would add a history row saying nothing happened.
    const d = decideCalibration(
      candidate({ previousSource: 'EMPIRICAL', previousValue: 0.8, rawEmpirical: 0.800001 }),
    );
    expect(d).toMatchObject({ write: false, reason: 'UNCHANGED' });
  });
});

describe('defensive', () => {
  it('refuses a measurement that is not a number', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const d = decideCalibration(candidate({ rawEmpirical: bad }));
      expect(d).toMatchObject({ write: false, reason: 'NOT_A_NUMBER' });
    }
  });

  it('checks the number before the threshold, so a broken value is named as such', () => {
    const d = decideCalibration(candidate({ rawEmpirical: NaN, responseCount: 2 }));
    expect(d).toMatchObject({ reason: 'NOT_A_NUMBER' });
  });
});

describe('planCalibration', () => {
  it('splits a run into what it will write and what it will not', () => {
    const plan = planCalibration([
      candidate({ itemId: 'A', responseCount: 40, rawEmpirical: 1 }),
      candidate({ itemId: 'B', responseCount: 4 }),
      candidate({
        itemId: 'C',
        previousSource: 'EMPIRICAL',
        previousValue: 0.5,
        rawEmpirical: 0.5,
      }),
    ]);

    expect(plan.writes.map((w) => w.itemId)).toEqual(['A']);
    expect(plan.skipped.map((s) => s.itemId)).toEqual(['B', 'C']);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['BELOW_THRESHOLD', 'UNCHANGED']);
  });

  it('is empty on an empty run', () => {
    expect(planCalibration([])).toEqual({ writes: [], skipped: [] });
  });
});
