// mynclex/lib/practice/runner/option-order.test.ts
import { describe, it, expect } from 'vitest';
import { optionLetter, orderedOptions } from './option-order';

const OPTS = [
  { id: 'A', text: 'aa' },
  { id: 'B', text: 'bb' },
  { id: 'C', text: 'cc' },
  { id: 'D', text: 'dd' },
];

describe('optionLetter', () => {
  it('maps index to a positional letter (0 → A)', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(1)).toBe('B');
    expect(optionLetter(25)).toBe('Z');
  });

  it('falls back to a 1-based number past Z', () => {
    expect(optionLetter(26)).toBe('27');
  });
});

describe('orderedOptions', () => {
  it('reorders options to match the stored permutation', () => {
    const out = orderedOptions(OPTS, ['C', 'A', 'D', 'B']);
    expect(out.map((o) => o.id)).toEqual(['C', 'A', 'D', 'B']);
  });

  it('preserves the full set — no loss or duplication', () => {
    const out = orderedOptions(OPTS, ['D', 'C', 'B', 'A']);
    expect([...out.map((o) => o.id)].sort()).toEqual(['A', 'B', 'C', 'D']);
    // still the SAME option objects, just reordered
    expect(out.find((o) => o.id === 'C')?.text).toBe('cc');
  });

  it('falls back to authored order when the order is empty / absent', () => {
    expect(orderedOptions(OPTS, {}).map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(orderedOptions(OPTS, null).map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(orderedOptions(OPTS, undefined).map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('falls back when the permutation length does not match', () => {
    expect(orderedOptions(OPTS, ['A', 'B']).map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('falls back when the permutation references an unknown id', () => {
    expect(orderedOptions(OPTS, ['A', 'B', 'C', 'Z']).map((o) => o.id)).toEqual([
      'A', 'B', 'C', 'D',
    ]);
  });

  it('is a projection — it does not mutate the input array', () => {
    const input = [...OPTS];
    orderedOptions(input, ['C', 'A', 'D', 'B']);
    expect(input.map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);
  });
});
