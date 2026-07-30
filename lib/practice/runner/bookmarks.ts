// Bookmarks — the "save this question so I can study it again" half of
// docs/product-plan/flag-and-bookmark.md.
//
// This module holds the one rule worth testing in isolation: WHERE the
// bookmark control is offered. The write itself is a Server Action
// (toggleBookmarkAction in the session route's actions.ts) because a
// bookmark is a plain RLS-guarded table write — no RPC, per the marks
// migration's own decision log.
//
// ⚠ Do not confuse this with the FLAG (§3.8). A bookmark is keyed by
// item_id and persists across every sitting; a flag is keyed by
// attempt_item_id and starts empty each time. Both are Set<string>, so
// the compiler cannot tell them apart for you.

import type { AttemptHeader } from './types';

/** The attempt facts the rule depends on. Narrowed so callers can pass a
 *  whole header or a literal in a test. */
export type BookmarkContext = Pick<AttemptHeader, 'source' | 'mode'>;

/**
 * Is the bookmark control offered on this attempt?
 *
 * The single question behind this: **could the Builder ever serve this
 * question back?** If not, the control promises a re-quiz that cannot
 * happen, and a study list that silently does nothing is worse than no
 * control at all (flag-and-bookmark.md §3.4).
 *
 * Three exclusions, all the same reason:
 *
 *  • **CAT** — every CAT question is reserved (§20 10b3, CAT draws only
 *    from the pool), and `_nclex_eligible_unit_pool` excludes reserved
 *    stock outright. Also already settled independently:
 *    bank-consumption-cat.html §16 gives CAT no live-run marking.
 *
 *  • **READINESS_PACK** — reserved the same way, from the other side of
 *    the mutual-exclusivity rule.
 *
 *  • **PROGRAMME_ASSIGNED** — tutor-quiz attempts serve TUTOR questions,
 *    but the practice pool reads `nclex_bank_items` only. A bookmarked
 *    tutor question is therefore just as unservable as a reserved one.
 *    ⚠ This exclusion is a CONSEQUENCE of the §3.4 rule rather than
 *    something §3.4 names; the doc predates noticing that the pool is
 *    bank-only. It is deliberate, not an oversight.
 *
 * Everything else is CUSTOM_BUILT bank practice — the Builder's own
 * sittings and the case-bank runs, both of which the Builder can serve
 * again. Those get the control.
 */
export function bookmarkingOffered(attempt: BookmarkContext): boolean {
  if (attempt.mode === 'CAT') return false;
  return attempt.source === 'CUSTOM_BUILT';
}

/**
 * Apply a toggle to the local bookmark set.
 *
 * Returns a NEW set — React state, so mutation would not re-render. The
 * caller flips optimistically and reverts on failure; a bookmark is one
 * row with no downstream consequence, so an optimistic flip costs
 * nothing if it loses.
 */
export function applyBookmarkToggle(
  current: ReadonlySet<string>,
  itemId: string,
  next: boolean,
): Set<string> {
  const out = new Set(current);
  if (next) out.add(itemId);
  else out.delete(itemId);
  return out;
}
