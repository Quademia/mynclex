import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_SEED_IRT,
  seedIrtForLabel,
  bandForIrt,
  displayBand,
} from '@/lib/bank/difficulty';
import { DIFFICULTY_LEVELS } from '@/lib/bank/classifications';

describe('DIFFICULTY_SEED_IRT — §5.1 label → number', () => {
  it('maps the five labels to −2 … +2, one logit apart', () => {
    expect(DIFFICULTY_SEED_IRT).toEqual({
      'Very easy': -2.0,
      Easy: -1.0,
      Medium: 0.0,
      Hard: 1.0,
      'Very hard': 2.0,
    });
  });

  it('has a seed for every label in DIFFICULTY_LEVELS', () => {
    for (const label of DIFFICULTY_LEVELS) {
      expect(DIFFICULTY_SEED_IRT[label]).toBeTypeOf('number');
    }
  });
});

describe('seedIrtForLabel', () => {
  it('returns the seed for a known label', () => {
    expect(seedIrtForLabel('Very easy')).toBe(-2.0);
    expect(seedIrtForLabel('Medium')).toBe(0.0);
    expect(seedIrtForLabel('Very hard')).toBe(2.0);
  });

  it('returns null for an unknown, empty, or nullish label', () => {
    expect(seedIrtForLabel('Impossible')).toBeNull();
    expect(seedIrtForLabel('')).toBeNull();
    expect(seedIrtForLabel(null)).toBeNull();
    expect(seedIrtForLabel(undefined)).toBeNull();
  });
});

describe('bandForIrt — §5.5.1 number → band, cut-offs at ±0.5 / ±1.5', () => {
  it('buckets the five seed values to their own band', () => {
    expect(bandForIrt(-2.0)).toBe('Very easy');
    expect(bandForIrt(-1.0)).toBe('Easy');
    expect(bandForIrt(0.0)).toBe('Medium');
    expect(bandForIrt(1.0)).toBe('Hard');
    expect(bandForIrt(2.0)).toBe('Very hard');
  });

  // Boundary rule (§5.5.1): Very easy b ≤ −1.5 · Easy −1.5 < b ≤ −0.5 ·
  // Medium −0.5 < b < +0.5 · Hard +0.5 ≤ b < +1.5 · Very hard b ≥ +1.5.
  it('places each cut-off point on the correct side', () => {
    expect(bandForIrt(-1.5)).toBe('Very easy'); // ≤ −1.5
    expect(bandForIrt(-1.49)).toBe('Easy');
    expect(bandForIrt(-0.5)).toBe('Easy'); // ≤ −0.5
    expect(bandForIrt(-0.49)).toBe('Medium');
    expect(bandForIrt(0.49)).toBe('Medium');
    expect(bandForIrt(0.5)).toBe('Hard'); // +0.5 ≤ b
    expect(bandForIrt(1.49)).toBe('Hard');
    expect(bandForIrt(1.5)).toBe('Very hard'); // ≥ +1.5
  });

  it('handles values beyond ±2 (what recalibration may discover)', () => {
    expect(bandForIrt(-3.2)).toBe('Very easy');
    expect(bandForIrt(3.7)).toBe('Very hard');
  });
});

describe('displayBand — §5.5.2b what a human is shown', () => {
  // ⭐ The property that makes dropping the difficulty_source branch safe.
  // If a seed did NOT round-trip, an unmeasured question would silently
  // start displaying a different word than the curator authored the day
  // Slice 10d shipped. Asserted, not assumed.
  it('round-trips every seed: an unmeasured item shows the word it was authored with', () => {
    for (const label of DIFFICULTY_LEVELS) {
      expect(displayBand(seedIrtForLabel(label))).toBe(label);
    }
  });

  it('derives the band from the number, so a drifted item stops reading stale', () => {
    // Authored "Medium" (seed 0.0); recalibration moved it to +2.3. The
    // curator's word is deliberately never rewritten (§5.2), so deriving
    // is the only thing that keeps the pill honest.
    expect(displayBand(2.3)).toBe('Very hard');
    // ...and in the other direction.
    expect(displayBand(-1.8)).toBe('Very easy');
  });

  it('does not consult difficulty_source — the same number bands the same way', () => {
    // The branch this replaced would have shown the curator's word here.
    // There is no longer any input that could make 1.0 read anything but
    // Hard, which is the point: shown and used are one fact.
    expect(displayBand(1.0)).toBe('Hard');
  });

  it('returns null when the snapshot froze no number', () => {
    // An item authored without a difficulty — the caller renders nothing
    // rather than inventing a Medium.
    expect(displayBand(null)).toBeNull();
    expect(displayBand(undefined)).toBeNull();
  });

  it('bands zero rather than treating it as absent', () => {
    // 0.0 is the Medium seed and a perfectly real value; a truthiness
    // check instead of a typeof would blank the most common pill in the
    // bank.
    expect(displayBand(0)).toBe('Medium');
  });
});
