import { describe, it, expect } from 'vitest';
import { bookmarkingOffered, applyBookmarkToggle } from './bookmarks';
import type { BookmarkContext } from './bookmarks';

const ctx = (
  source: BookmarkContext['source'],
  mode: BookmarkContext['mode'],
): BookmarkContext => ({ source, mode });

describe('bookmarkingOffered', () => {
  it('offers bookmarking on a Builder-built practice sitting', () => {
    expect(bookmarkingOffered(ctx('CUSTOM_BUILT', 'UNTIMED_LEARNING'))).toBe(true);
    expect(bookmarkingOffered(ctx('CUSTOM_BUILT', 'UNTIMED_TEST'))).toBe(true);
    expect(bookmarkingOffered(ctx('CUSTOM_BUILT', 'TIMED_FREE_NAV'))).toBe(true);
    expect(bookmarkingOffered(ctx('CUSTOM_BUILT', 'TIMED_SEQUENTIAL'))).toBe(true);
  });

  // The three exclusions all share one reason: the Builder could never
  // serve the question back, so the control would be a promise the
  // architecture is committed to breaking (flag-and-bookmark.md §3.4).

  it('refuses CAT — every CAT question is reserved stock', () => {
    expect(bookmarkingOffered(ctx('CUSTOM_BUILT', 'CAT'))).toBe(false);
  });

  it('refuses a readiness pack, in every mode', () => {
    expect(bookmarkingOffered(ctx('READINESS_PACK', 'UNTIMED_TEST'))).toBe(false);
    expect(bookmarkingOffered(ctx('READINESS_PACK', 'TIMED_FREE_NAV'))).toBe(false);
    expect(bookmarkingOffered(ctx('READINESS_PACK', 'TIMED_SEQUENTIAL'))).toBe(false);
  });

  it('refuses a tutor quiz — the practice pool is bank-only', () => {
    expect(bookmarkingOffered(ctx('PROGRAMME_ASSIGNED', 'UNTIMED_TEST'))).toBe(false);
    expect(bookmarkingOffered(ctx('PROGRAMME_ASSIGNED', 'UNTIMED_LEARNING'))).toBe(false);
  });

  // A CAT is excluded on its mode alone. If CAT attempts are ever created
  // under a different source, the exclusion must not quietly lapse.
  it('refuses CAT regardless of source', () => {
    expect(bookmarkingOffered(ctx('READINESS_PACK', 'CAT'))).toBe(false);
    expect(bookmarkingOffered(ctx('PROGRAMME_ASSIGNED', 'CAT'))).toBe(false);
  });
});

describe('applyBookmarkToggle', () => {
  it('adds and removes', () => {
    const empty = new Set<string>();
    const one = applyBookmarkToggle(empty, 'BI_00042', true);
    expect(one.has('BI_00042')).toBe(true);

    const back = applyBookmarkToggle(one, 'BI_00042', false);
    expect(back.has('BI_00042')).toBe(false);
  });

  it('returns a new set — React state must not be mutated', () => {
    const before = new Set(['BI_00001']);
    const after = applyBookmarkToggle(before, 'BI_00002', true);
    expect(after).not.toBe(before);
    expect(before.has('BI_00002')).toBe(false);
    expect(after.has('BI_00001')).toBe(true);
  });

  it('is idempotent — re-adding or re-removing changes nothing', () => {
    const one = new Set(['BI_00042']);
    expect([...applyBookmarkToggle(one, 'BI_00042', true)]).toEqual(['BI_00042']);
    expect([...applyBookmarkToggle(new Set(), 'BI_00042', false)]).toEqual([]);
  });
});
