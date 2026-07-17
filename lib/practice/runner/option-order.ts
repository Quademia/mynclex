// mynclex/lib/practice/runner/option-order.ts
//
// Slice-2 companion to the option-shuffle generation layer (migration
// 20260804120000). At attempt creation a BEFORE INSERT trigger stamps
// nclex_attempt_items.option_order_json with the DISPLAY order of the
// option IDs for the flat option-list types (MCQ / SATA / SELECT_N).
// Here the runner consumes it: reorder the frozen options into that
// display order, and (in the renderer) relabel the on-screen badge
// POSITIONALLY — 1st shown = "A" — so the answer position can't be gamed
// while the option ID, the value used for picks, feedback, and scoring,
// stays fixed.
//
// content_snapshot_json is never mutated on the server; this is a pure
// read-time projection. When option_order_json is absent / empty / the
// wrong length / references an unknown ID (pre-shuffle attempts, excluded
// types, opted-out items, a malformed snapshot), the options fall through
// in their authored order — a permutation can never drop or duplicate an
// option.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Positional badge letter for the option shown at `index` (0 → "A").
 *  Falls back to a 1-based number past "Z" — option lists never approach
 *  26, but the badge must never render blank. */
export function optionLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

/** Reorder `options` to match the stored display permutation (a JSON array
 *  of option IDs). Returns the authored order unchanged when the order is
 *  missing, the wrong length, or references an unknown ID. */
export function orderedOptions<T extends { id: string }>(
  options: T[],
  optionOrder: unknown,
): T[] {
  if (!Array.isArray(optionOrder) || optionOrder.length !== options.length) {
    return options;
  }
  const byId = new Map(options.map((o) => [o.id, o]));
  const reordered: T[] = [];
  for (const id of optionOrder) {
    const opt = byId.get(id as string);
    if (!opt) return options; // unknown id → bail to authored order
    reordered.push(opt);
  }
  return reordered;
}
