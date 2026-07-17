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

/** The flat option-list types whose options shuffle. Shared by the embed
 *  player's client display + its server persist path so they agree on which
 *  questions get an order (TF is excluded — 2 fixed options). */
export const SHUFFLE_OPTION_TYPES: ReadonlySet<string> = new Set([
  'MCQ',
  'SATA',
  'SELECT_N',
]);

/** Deterministic FNV-1a hash of a string → unsigned 32-bit int. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic seeded permutation of `ids`. The embed player generates its
 *  display order this way on BOTH the client (to render) and the server (to
 *  persist the exact same order) — same (ids, seed) always yields the same
 *  sequence, so the two agree without sending the order over the wire. (The
 *  attempt runner instead gets its order from the DB trigger.) Mirrors the
 *  SQL builder's hash-sort approach; ties break by id for full determinism. */
export function seededOptionOrder(ids: string[], seed: string): string[] {
  return [...ids].sort((a, b) => {
    const ha = hash32(seed + '|' + a);
    const hb = hash32(seed + '|' + b);
    if (ha !== hb) return ha - hb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** The embed player's display-order derivation — the single source of truth
 *  shared by its client (to render) and its server action (to persist the
 *  same order). Deterministic on (playId, itemId). Returns null when the type
 *  isn't shuffleable, the tutor disabled shuffle, or there's <2 options. */
export function embedOptionOrder(
  questionType: string,
  content: unknown,
  shuffleOptions: boolean,
  playId: string,
  itemId: string,
): string[] | null {
  if (!shuffleOptions || !SHUFFLE_OPTION_TYPES.has(questionType)) return null;
  const opts = (content as { options?: Array<{ id?: unknown }> })?.options;
  if (!Array.isArray(opts) || opts.length < 2) return null;
  return seededOptionOrder(opts.map((o) => String(o.id)), `${playId}|${itemId}`);
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

/** Return a copy of a flat-option-list content with its `options` reordered
 *  per `order` (an array of option ids). Identity when there's no order or no
 *  options field — used by the embed player, whose types are flat today. */
export function withOptionOrder(content: unknown, order: unknown): unknown {
  if (!Array.isArray(order)) return content;
  const c = content as { options?: Array<{ id: string }> };
  if (!Array.isArray(c.options)) return content;
  return { ...c, options: orderedOptions(c.options, order) };
}
