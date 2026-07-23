// mynclex/lib/home/student/bank/readiness.test.ts
//
// The readiness panel's logic. Nearly every test here pins one of the
// four decisions taken with Sam — the ones that separate this panel
// from the prototype it was built from. If one of these starts
// failing, a student is being told something we agreed not to tell
// them.

import { describe, expect, it } from 'vitest';
import {
  ACCURACY_READY_PCT,
  GATE_BODY,
  VOLUME_GATE,
  readinessPanel,
  type ReadinessInputs,
} from './readiness';
import { UNMEASURED_SHORT_LABEL } from '@/lib/practice/cat/report-derive';

/** A student past the volume gate with nothing else attempted. */
function inputs(over: Partial<ReadinessInputs> = {}): ReadinessInputs {
  return {
    accuracyPct: 80,
    answered: VOLUME_GATE,
    latestPackScore: null,
    latestCatVerdict: null,
    latestCatTerminationReason: null,
    latestCatItems: null,
    ...over,
  };
}

const signal = (p: ReturnType<typeof readinessPanel>, key: string) =>
  p.signals.find((s) => s.key === key)!;

describe('the volume gate', () => {
  it('withholds the band entirely below the threshold', () => {
    const p = readinessPanel(inputs({ answered: VOLUME_GATE - 1 }));
    expect(p.band).toBeNull();
    expect(p.gate.open).toBe(false);
    expect(p.gate.remaining).toBe(1);
  });

  it('opens exactly at the threshold', () => {
    expect(readinessPanel(inputs({ answered: VOLUME_GATE })).band).not.toBeNull();
  });

  it('reports progress toward the gate without exceeding 100%', () => {
    expect(readinessPanel(inputs({ answered: 750 })).gate.percent).toBe(50);
    expect(readinessPanel(inputs({ answered: VOLUME_GATE * 3 })).gate.percent).toBe(100);
  });

  // The line we agreed not to cross. The threshold buys reliability;
  // it does not buy a prediction of anyone's exam result.
  it('never promises odds in its copy', () => {
    expect(GATE_BODY).toMatch(/reliable/i);
    expect(GATE_BODY).not.toMatch(/chance/i);
    expect(GATE_BODY).not.toMatch(/probability/i);
    expect(GATE_BODY).not.toMatch(/likely to pass/i);
  });

  // Volume is EVIDENCE, not a result. If it were a fourth signal, 1,600
  // answers at 45% would tick a box and read as progress toward ready.
  it('is not one of the signals', () => {
    const p = readinessPanel(inputs());
    expect(p.signals.map((s) => s.key)).toEqual(['accuracy', 'pack', 'cat']);
  });
});

describe('signal states', () => {
  it('marks an unbought pack as NOT ATTEMPTED, not as failed', () => {
    const s = signal(readinessPanel(inputs()), 'pack');
    expect(s.state).toBe('not_attempted');
    expect(s.value).toBeNull();
    expect(s.note).toMatch(/sit a pack/i);
  });

  it('marks an unsat CAT as NOT ATTEMPTED, not as failed', () => {
    const s = signal(readinessPanel(inputs()), 'cat');
    expect(s.state).toBe('not_attempted');
    expect(s.note).toMatch(/sit a cat/i);
  });

  it('uses the packs own band word, never "Passed"', () => {
    const met = signal(readinessPanel(inputs({ latestPackScore: 0.78 })), 'pack');
    expect(met.value).toBe('Ready');
    expect(met.state).toBe('met');

    const unmet = signal(readinessPanel(inputs({ latestPackScore: 0.62 })), 'pack');
    expect(unmet.value).toBe('Approaching');
    expect(unmet.state).toBe('not_met');
  });

  it('accepts Excelling as clearing the pack bar', () => {
    const s = signal(readinessPanel(inputs({ latestPackScore: 0.92 })), 'pack');
    expect(s.value).toBe('Excelling');
    expect(s.state).toBe('met');
  });

  it('has only two CAT verdicts — there is no "At standard"', () => {
    const above = signal(readinessPanel(inputs({ latestCatVerdict: 'ABOVE_STANDARD' })), 'cat');
    const below = signal(readinessPanel(inputs({ latestCatVerdict: 'BELOW_STANDARD' })), 'cat');
    expect(above.value).toBe('Above standard');
    expect(below.value).toBe('Below standard');
    expect(above.state).toBe('met');
    expect(below.state).toBe('not_met');
  });

  // A timed-out sub-minimum CAT is a fail whose measurement we decline.
  // It must not clear the bar, and it must not read as "you weren't
  // good enough" either.
  it('declines to measure a CAT that ran out of time under the minimum', () => {
    const s = signal(
      readinessPanel(
        inputs({
          latestCatVerdict: 'BELOW_STANDARD',
          latestCatTerminationReason: 'TIME_LIMIT_HIT',
          latestCatItems: 48,
        }),
      ),
      'cat',
    );
    expect(s.state).toBe('not_met');
    expect(s.value).toBe('Not measured');
    expect(s.note).toBe(UNMEASURED_SHORT_LABEL);
  });

  it('uses our own documented Ready bar for accuracy, not an invented one', () => {
    expect(ACCURACY_READY_PCT).toBe(75);
    expect(signal(readinessPanel(inputs({ accuracyPct: 75 })), 'accuracy').state).toBe('met');
    expect(signal(readinessPanel(inputs({ accuracyPct: 74 })), 'accuracy').state).toBe('not_met');
  });
});

describe('the band', () => {
  it('uses the packs vocabulary and never invents a fourth rung', () => {
    const labels = new Set<string>();
    for (const acc of [40, 80]) {
      for (const pack of [null, 0.5, 0.9]) {
        for (const cat of [null, 'ABOVE_STANDARD', 'BELOW_STANDARD'] as const) {
          const p = readinessPanel(
            inputs({ accuracyPct: acc, latestPackScore: pack, latestCatVerdict: cat }),
          );
          if (p.band) labels.add(p.band.label);
        }
      }
    }
    expect([...labels].sort()).toEqual(['Approaching', 'Building', 'Ready']);
    expect(labels.has('Excelling')).toBe(false);
  });

  // THE CENTRAL FIX. A bank-only student can reach the top band on her
  // own work; she is not held back by products she hasn't bought.
  it('counts only ATTEMPTED signals, so unbought products cannot hold a student back', () => {
    const p = readinessPanel(
      inputs({ accuracyPct: 82, latestPackScore: 0.8, latestCatVerdict: null }),
    );
    expect(p.band).toMatchObject({ met: 2, attempted: 2, key: 'READY' });
  });

  it('does not award Ready off a single signal — it wants corroboration', () => {
    const p = readinessPanel(inputs({ accuracyPct: 90 }));
    expect(p.band).toMatchObject({ met: 1, attempted: 1, key: 'APPROACHING' });
  });

  it('is Approaching when some but not all attempted signals are met', () => {
    const p = readinessPanel(
      inputs({ accuracyPct: 80, latestPackScore: 0.5, latestCatVerdict: 'ABOVE_STANDARD' }),
    );
    expect(p.band).toMatchObject({ met: 2, attempted: 3, key: 'APPROACHING' });
  });

  it('is Building when nothing attempted has been met', () => {
    const p = readinessPanel(
      inputs({ accuracyPct: 50, latestPackScore: 0.4, latestCatVerdict: 'BELOW_STANDARD' }),
    );
    expect(p.band).toMatchObject({ met: 0, attempted: 3, key: 'BUILDING' });
  });

  it('reads all three met as Ready', () => {
    const p = readinessPanel(
      inputs({ accuracyPct: 80, latestPackScore: 0.8, latestCatVerdict: 'ABOVE_STANDARD' }),
    );
    expect(p.band).toMatchObject({ met: 3, attempted: 3, key: 'READY', step: 3 });
  });

  // The headline reads "N of M signals met" — M must be what she has
  // attempted, or the sentence quietly reintroduces the penalty.
  it('never reports a denominator larger than what was attempted', () => {
    const p = readinessPanel(inputs({ accuracyPct: 80, latestCatVerdict: 'ABOVE_STANDARD' }));
    expect(p.band?.attempted).toBe(2);
    expect(p.band?.met).toBe(2);
  });
});
