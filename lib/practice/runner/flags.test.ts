import { describe, it, expect } from 'vitest';
import { flaggingOffered, flagEditable, initialFlagSet, applyFlagToggle } from './flags';
import { bookmarkingOffered } from './bookmarks';
import type { FlagContext } from './flags';

const at = (mode: FlagContext['mode']): FlagContext => ({ mode });

describe('flaggingOffered', () => {
  it('offers a flag in the three free-navigation modes', () => {
    expect(flaggingOffered(at('UNTIMED_LEARNING'))).toBe(true);
    expect(flaggingOffered(at('UNTIMED_TEST'))).toBe(true);
    expect(flaggingOffered(at('TIMED_FREE_NAV'))).toBe(true);
  });

  // Both exclusions are the same rule: you can never get back to the
  // question, so a "come back to this" control is furniture.
  it('refuses the two forward-only modes', () => {
    expect(flaggingOffered(at('CAT'))).toBe(false);
    expect(flaggingOffered(at('TIMED_SEQUENTIAL'))).toBe(false);
  });
});

describe('flagEditable', () => {
  it('is editable live in a free-nav mode', () => {
    expect(flagEditable(at('UNTIMED_LEARNING'), true)).toBe(true);
  });

  // §2.4 — the flag is part of the attempt record. Unflagging in review
  // would rewrite history and make the report's "you flagged 6" untrue.
  it('is frozen in review, even in a mode that offers it', () => {
    expect(flagEditable(at('UNTIMED_LEARNING'), false)).toBe(false);
    expect(flagEditable(at('TIMED_FREE_NAV'), false)).toBe(false);
  });

  it('is never editable where flagging is not offered', () => {
    expect(flagEditable(at('CAT'), true)).toBe(false);
    expect(flagEditable(at('TIMED_SEQUENTIAL'), true)).toBe(false);
  });
});

describe('initialFlagSet', () => {
  it('seeds only the flagged items, keyed by attempt_item_id', () => {
    const set = initialFlagSet([
      { attempt_item_id: 'ai-1', is_flagged: true },
      { attempt_item_id: 'ai-2', is_flagged: false },
      { attempt_item_id: 'ai-3', is_flagged: true },
    ]);
    expect([...set].sort()).toEqual(['ai-1', 'ai-3']);
  });

  it('is empty when nothing is flagged', () => {
    expect(initialFlagSet([{ attempt_item_id: 'ai-1', is_flagged: false }]).size).toBe(0);
  });
});

describe('applyFlagToggle', () => {
  it('adds, removes, and never mutates', () => {
    const before = new Set(['ai-1']);
    const after = applyFlagToggle(before, 'ai-2', true);
    expect(after).not.toBe(before);
    expect(before.has('ai-2')).toBe(false);
    expect([...after].sort()).toEqual(['ai-1', 'ai-2']);
    expect([...applyFlagToggle(after, 'ai-1', false)]).toEqual(['ai-2']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The two features are NOT interchangeable. This is the guard against
// the §3.8 trap: both halves are Set<string> and both have an
// "…Offered" predicate, so a call site that reaches for the wrong one
// compiles cleanly. TIMED_SEQUENTIAL is where they visibly disagree.
// ─────────────────────────────────────────────────────────────────────
describe('flag and bookmark are different rules', () => {
  it('disagree on Timed Sequential: bookmark yes, flag no', () => {
    const attempt = { source: 'CUSTOM_BUILT' as const, mode: 'TIMED_SEQUENTIAL' as const };
    expect(bookmarkingOffered(attempt)).toBe(true);
    expect(flaggingOffered(attempt)).toBe(false);
  });

  it('disagree on a readiness pack: flag yes, bookmark no', () => {
    const attempt = { source: 'READINESS_PACK' as const, mode: 'UNTIMED_TEST' as const };
    expect(flaggingOffered(attempt)).toBe(true);
    expect(bookmarkingOffered(attempt)).toBe(false);
  });

  it('agree only on CAT, where neither is offered', () => {
    const attempt = { source: 'CUSTOM_BUILT' as const, mode: 'CAT' as const };
    expect(flaggingOffered(attempt)).toBe(false);
    expect(bookmarkingOffered(attempt)).toBe(false);
  });
});
