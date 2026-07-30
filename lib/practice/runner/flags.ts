// Flag for review — the per-sitting half of docs/product-plan/flag-and-bookmark.md.
//
// "Come back to this before I submit." Scoped to ONE sitting, keyed by
// attempt_item_id, stored as a column on nclex_attempt_items.
//
// ⚠ Not the bookmark (./bookmarks.ts). That one is (student, question),
// keyed by item_id, and persists across every sitting. Both are
// Set<string>, so nothing but the variable names will stop you passing
// one where the other belongs (§3.8).

import type { AttemptHeader, SealedItem } from './types';

export type FlagContext = Pick<AttemptHeader, 'mode'>;

/**
 * Is the flag control offered on this attempt?
 *
 * The test is simply: **can the student get back to the question?** A
 * flag whose whole purpose is "return to this before I submit" is
 * furniture in a sitting you can only move forward through.
 *
 *  • **CAT** — no. Strict forward, one item at a time from the engine.
 *    Settled independently in bank-consumption-cat.html §16, which gives
 *    CAT no live-run mark-for-review at all.
 *  • **TIMED_SEQUENTIAL** — no (Sam, 2026-07-30, closing §7.1). Also
 *    strict forward, also no grid during the run. The counter-argument
 *    was real — flags survive into the report, so flagging here could
 *    mean "show me this afterwards" — but that is a second feature
 *    wearing the same control, which is the mistake this whole arc
 *    exists to undo.
 *  • Everything else — yes. The three free-navigation modes.
 *
 * This lands on exactly the same set as grid availability, and that is
 * not a coincidence: the grid is HOW you come back to a flagged
 * question. If one is ever changed, look hard at the other.
 */
export function flaggingOffered(attempt: FlagContext): boolean {
  return attempt.mode !== 'CAT' && attempt.mode !== 'TIMED_SEQUENTIAL';
}

/**
 * Can the flag be CHANGED right now, as opposed to merely shown?
 *
 * Editable live, frozen in review (§2.4). Two reasons, and the second is
 * the load-bearing one: after submit there is nothing to come back to,
 * and the flag is now part of the attempt record — letting a student
 * unflag in review would rewrite history and make the report's "you
 * flagged 6 questions" retroactively untrue.
 *
 * The RPC enforces this too (it refuses unless the attempt is
 * IN_PROGRESS). This is the UI half of the same rule, not the only one.
 */
export function flagEditable(attempt: FlagContext, isLive: boolean): boolean {
  return isLive && flaggingOffered(attempt);
}

/**
 * Seed the runner's flag set from the items it was handed.
 *
 * No extra query: is_flagged rides on the attempt_item row the runner
 * already loads. ⚠ Keyed by attempt_item_id — see the module header.
 */
export function initialFlagSet(items: Pick<SealedItem, 'attempt_item_id' | 'is_flagged'>[]): Set<string> {
  const out = new Set<string>();
  for (const i of items) if (i.is_flagged) out.add(i.attempt_item_id);
  return out;
}

/** Apply a toggle, returning a NEW set (React state must not be mutated). */
export function applyFlagToggle(
  current: ReadonlySet<string>,
  attemptItemId: string,
  next: boolean,
): Set<string> {
  const out = new Set(current);
  if (next) out.add(attemptItemId);
  else out.delete(attemptItemId);
  return out;
}
