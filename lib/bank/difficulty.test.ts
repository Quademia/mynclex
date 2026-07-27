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

describe('displayBand — §5.5.2 what a human is shown', () => {
  it('shows the curator label verbatim while CURATOR_LABEL', () => {
    // Even if the seed number would band elsewhere, the seed label wins
    // until there is empirical evidence.
    expect(
      displayBand({ label: 'Hard', irt: 1.0, source: 'CURATOR_LABEL' }),
    ).toBe('Hard');
  });

  it('derives the band from the number once EMPIRICAL', () => {
    // Authored "Medium" but the data says it behaves Very hard.
    expect(
      displayBand({ label: 'Medium', irt: 2.3, source: 'EMPIRICAL' }),
    ).toBe('Very hard');
  });

  it('falls back to the label when EMPIRICAL but the number is missing', () => {
    expect(
      displayBand({ label: 'Easy', irt: null, source: 'EMPIRICAL' }),
    ).toBe('Easy');
  });

  it('returns null when there is no difficulty to show', () => {
    expect(displayBand({ label: null, irt: null, source: 'CURATOR_LABEL' })).toBeNull();
    expect(displayBand({ label: '', irt: null, source: null })).toBeNull();
    expect(
      displayBand({ label: 'Nonsense', irt: null, source: 'CURATOR_LABEL' }),
    ).toBeNull();
  });
});
