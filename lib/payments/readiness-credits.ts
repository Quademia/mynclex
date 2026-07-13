// mynclex/lib/payments/readiness-credits.ts
//
// The PURE reading of a readiness credit's lifecycle stage from its event
// timestamps. The credits table is deliberately status-free (§7): the
// stage is not stored, it's derived — and it must be derived the SAME way
// everywhere, so every surface (the dashboard signpost, the readiness
// page cards, the future claim/activate gates) reads one helper.
//
// The lifecycle is strictly one-way, so the stages are ordered and the
// terminal ones win: a USED credit still carries created/claimed/
// activated timestamps, but it reads USED. Hence terminal-first.
//
// Clock caveat (matches the DB rules, §7): the stage is derived from what
// is WRITTEN, never from the wall clock. A credit whose window deadline
// has passed but whose expired_at stamp hasn't landed yet still reads
// ACTIVE here — expired_at is stamped LAZILY, on the next touch of the row
// (a packs-page read or a re-claim), not by a scheduled job. Surfaces that
// must reflect "past deadline" before the stamp lands use isLapsedLive()
// below to derive it live; the stage stays truthful to the row.

export type CreditStage =
  | 'UNCLAIMED' // minted, no pack chosen yet
  | 'CLAIMED'   // a pack is named; the window has NOT started
  | 'ACTIVE'    // the 21-day window is running
  | 'USED'      // the one sitting was taken (sat, even partially)
  | 'EXPIRED'   // the window lapsed unused (lazy stamp on next touch)
  | 'REVOKED';  // taken back (refund / admin correction)

/** The subset of a credit row the stage derivation reads. */
export interface CreditLifecycle {
  claimed_at: string | null;
  activated_at: string | null;
  used_at: string | null;
  expired_at: string | null;
  revoked_at: string | null;
}

export function creditStage(c: CreditLifecycle): CreditStage {
  // Terminal endings first — they coexist with the earlier timestamps
  // and are mutually exclusive by DB CHECK, so any order among them is
  // safe; this one is deterministic.
  if (c.revoked_at) return 'REVOKED';
  if (c.used_at) return 'USED';
  if (c.expired_at) return 'EXPIRED';
  // Then the running states, newest-milestone-first.
  if (c.activated_at) return 'ACTIVE';
  if (c.claimed_at) return 'CLAIMED';
  return 'UNCLAIMED';
}

/** True while a credit still holds an actionable pack claim — i.e. it has
 *  not lapsed or been taken back. A USED credit is still "live" for the
 *  one-shot-per-pack rule (it can never be re-claimed), mirroring the DB
 *  partial unique index. Used by the claim surfaces in a later slice. */
export function claimIsLive(c: CreditLifecycle): boolean {
  return c.expired_at === null && c.revoked_at === null;
}

/** True when a credit's 21-day window has lapsed UNUSED as of `nowMs`, but
 *  its expired_at stamp has not been written yet. These are exactly the
 *  rows the lazy sweep must stamp (§7 *Lapse mechanism*): an ACTIVE credit
 *  (activated, no terminal event) whose frozen deadline (expires_at) is in
 *  the past. Two callers rely on it:
 *   - the sweep, to know which rows to stamp;
 *   - the packs-page derivation, to render the card as lapsed even if the
 *     best-effort stamp didn't land this render (display never waits on
 *     the write).
 *  Pure and clock-injected so it stays testable and render-safe. */
export function isLapsedLive(
  c: CreditLifecycle & { expires_at: string | null },
  nowMs: number,
): boolean {
  // Already terminal — nothing to lapse.
  if (c.used_at || c.expired_at || c.revoked_at) return false;
  // No running window — an unclaimed/claimed-but-unactivated credit just
  // waits; it never "expires" (mirrors the DB expiry-requires-activation
  // CHECK, and activation always stamps expires_at with activated_at).
  if (!c.activated_at || !c.expires_at) return false;
  return Date.parse(c.expires_at) < nowMs;
}
