// mynclex/lib/practice/runner/option-order.test.ts
import { describe, it, expect } from 'vitest';
import {
  optionLetter,
  orderedOptions,
  seededOptionOrder,
  SHUFFLE_OPTION_TYPES,
} from './option-order';

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

  // Slice 3a — the same helper reorders a drag token pool (incl. distractors).
  it('applies a seeded order (embed player) end to end', () => {
    const order = seededOptionOrder(['A', 'B', 'C', 'D'], 'play-1|item-9');
    expect(orderedOptions(OPTS, order).map((o) => o.id)).toEqual(order);
  });

  it('reorders a drag token pool by the stored permutation', () => {
    const tokens = [
      { id: 't1', text: 'first' },
      { id: 't2', text: 'second' },
      { id: 't3', text: 'third' },
      { id: 't4', text: 'distractor' },
    ];
    const out = orderedOptions(tokens, ['t3', 't1', 't4', 't2']);
    expect(out.map((t) => t.id)).toEqual(['t3', 't1', 't4', 't2']);
    expect(out.find((t) => t.id === 't4')?.text).toBe('distractor');
  });
});

describe('seededOptionOrder', () => {
  const IDS = ['A', 'B', 'C', 'D', 'E'];

  it('is deterministic — same (ids, seed) → same order', () => {
    expect(seededOptionOrder(IDS, 'p1|i1')).toEqual(seededOptionOrder(IDS, 'p1|i1'));
  });

  it('is a permutation — every id present exactly once', () => {
    const out = seededOptionOrder(IDS, 'p1|i1');
    expect([...out].sort()).toEqual([...IDS].sort());
    expect(out).toHaveLength(IDS.length);
  });

  it('varies by seed (different play/item → generally a different order)', () => {
    const seeds = ['p1|i1', 'p1|i2', 'p2|i1', 'p3|i9', 'p4|i4'];
    const orders = new Set(seeds.map((s) => seededOptionOrder(IDS, s).join(',')));
    // Not asserting all-distinct (hash collisions possible), just that the
    // seed actually influences the order across a handful of seeds.
    expect(orders.size).toBeGreaterThan(1);
  });

  it('does not mutate the input', () => {
    const input = [...IDS];
    seededOptionOrder(input, 'p1|i1');
    expect(input).toEqual(IDS);
  });
});

describe('SHUFFLE_OPTION_TYPES', () => {
  it('covers the flat option-list types, excludes TF', () => {
    expect(SHUFFLE_OPTION_TYPES.has('MCQ')).toBe(true);
    expect(SHUFFLE_OPTION_TYPES.has('SATA')).toBe(true);
    expect(SHUFFLE_OPTION_TYPES.has('SELECT_N')).toBe(true);
    expect(SHUFFLE_OPTION_TYPES.has('TF')).toBe(false);
  });
});
