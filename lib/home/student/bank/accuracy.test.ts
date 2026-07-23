// mynclex/lib/home/student/bank/accuracy.test.ts
//
// The mastery read. Most of these pin an honesty decision rather than
// arithmetic: which questions may be counted, which subcategory names
// may become a bar, and which denominator the card is allowed to claim.

import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_SUBCATEGORIES,
  MASTERY_MIN_ANSWERED,
  bankAccuracy,
  barTone,
  type AnsweredRow,
} from './accuracy';

/** n rows in one subcategory, `correct` of them right. */
function rows(subcategory: string | null, n: number, correct: number): AnsweredRow[] {
  return Array.from({ length: n }, (_, i) => ({ subcategory, isCorrect: i < correct }));
}

describe('BLUEPRINT_SUBCATEGORIES', () => {
  // The plan called these "the 8 L1 categories". There are only four L1
  // categories; the eight the design draws are the L2 subcategories.
  it('is the eight blueprint areas, not the four L1 categories', () => {
    expect(BLUEPRINT_SUBCATEGORIES).toHaveLength(8);
    expect(BLUEPRINT_SUBCATEGORIES).toContain('Management of Care');
    expect(BLUEPRINT_SUBCATEGORIES).toContain('Pharmacological and Parenteral Therapies');
    expect(BLUEPRINT_SUBCATEGORIES).not.toContain('Physiological Integrity');
  });
});

describe('bankAccuracy', () => {
  it('reports overall accuracy over every answered question', () => {
    const a = bankAccuracy([...rows('Management of Care', 10, 7)]);
    expect(a).toMatchObject({ answered: 10, correct: 7, percent: 70 });
  });

  it('has no percentage at all when nothing has been answered', () => {
    expect(bankAccuracy([]).percent).toBeNull();
  });

  it('orders bars strongest first, as the design draws them', () => {
    const a = bankAccuracy([
      ...rows('Management of Care', 10, 5), // 50%
      ...rows('Basic Care and Comfort', 10, 9), // 90%
      ...rows('Psychosocial Integrity', 10, 7), // 70%
    ]);
    expect(a.bars.map((b) => b.percent)).toEqual([90, 70, 50]);
  });

  it('only draws bars for areas the student has actually seen', () => {
    const a = bankAccuracy(rows('Management of Care', 25, 20));
    expect(a.bars).toHaveLength(1);
  });

  // Older snapshots carry values in the subcategory field that are not
  // blueprint areas at all. They must not become a ninth bar named
  // something no candidate would recognise.
  it('keeps off-canonical subcategory values out of the map', () => {
    const a = bankAccuracy([
      ...rows('Management of Care', 20, 10),
      ...rows('Ante/Intra/Postpartum and Newborn Care', 2, 2),
    ]);
    expect(a.bars.map((b) => b.name)).toEqual(['Management of Care']);
    // …but they still count toward the overall figure, which is a
    // reading of every question answered.
    expect(a.answered).toBe(22);
    expect(a.barsAnswered).toBe(20);
  });

  // The bars' denominator is smaller than the overall one whenever an
  // older attempt snapshotted no classification. The card labels the
  // bars' own number so it never borrows volume it didn't come from.
  it('reports the bars own denominator separately from the overall one', () => {
    const a = bankAccuracy([
      ...rows('Management of Care', 20, 10),
      ...rows(null, 15, 15), // unclassified — pre-backfill sittings
    ]);
    expect(a.answered).toBe(35);
    expect(a.barsAnswered).toBe(20);
    expect(a.percent).toBe(71); // 25/35
  });

  describe('the cold-start gate', () => {
    it('withholds the map below the threshold rather than drawing noise', () => {
      const a = bankAccuracy(rows('Management of Care', MASTERY_MIN_ANSWERED - 1, 5));
      expect(a.hasEnough).toBe(false);
      expect(a.weakest).toBeNull();
    });

    it('opens once there is enough classified work behind it', () => {
      const a = bankAccuracy(rows('Management of Care', MASTERY_MIN_ANSWERED, 5));
      expect(a.hasEnough).toBe(true);
      expect(a.weakest?.name).toBe('Management of Care');
    });

    // Unclassified answers can't be placed on the map, so they must not
    // be what opens it.
    it('is gated on classified answers, not overall volume', () => {
      const a = bankAccuracy([
        ...rows(null, 200, 100),
        ...rows('Management of Care', 3, 1),
      ]);
      expect(a.hasEnough).toBe(false);
    });
  });

  describe('the weakest area (card 5s nudge)', () => {
    it('is the lowest-scoring bar', () => {
      const a = bankAccuracy([
        ...rows('Management of Care', 10, 9),
        ...rows('Basic Care and Comfort', 10, 4),
        ...rows('Psychosocial Integrity', 10, 7),
      ]);
      expect(a.weakest?.name).toBe('Basic Care and Comfort');
    });

    // A tie should point at the weakness we're more sure of.
    it('breaks a tie toward the area with more questions behind it', () => {
      const a = bankAccuracy([
        ...rows('Management of Care', 10, 5),
        ...rows('Basic Care and Comfort', 30, 15),
      ]);
      expect(a.weakest?.name).toBe('Basic Care and Comfort');
    });

    it('always agrees with the bars it sits above', () => {
      const a = bankAccuracy([
        ...rows('Management of Care', 12, 3),
        ...rows('Safety and Infection Control', 12, 11),
      ]);
      const lowestBar = a.bars[a.bars.length - 1];
      expect(a.weakest).toEqual(lowestBar);
    });
  });
});

describe('barTone', () => {
  it('bands at the designs thresholds', () => {
    expect(barTone(100)).toBe('strong');
    expect(barTone(78)).toBe('strong');
    expect(barTone(77)).toBe('ok');
    expect(barTone(70)).toBe('ok');
    expect(barTone(69)).toBe('warn');
    expect(barTone(62)).toBe('warn');
    expect(barTone(61)).toBe('low');
    expect(barTone(0)).toBe('low');
  });
});
