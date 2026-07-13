// mynclex/lib/payments/readiness-expiry.ts
//
// Lazy-expiry — the write side of §7's *Lapse mechanism*. A readiness
// credit's 21-day window has a frozen deadline (expires_at, stamped at
// activation). When that deadline passes UNUSED we must stamp expired_at
// (#13), the lapse EVENT — but there is no scheduled sweep. Instead we
// stamp LAZILY, on the next touch of the row: a packs-page read, or (the
// correctness-critical one) a re-claim. This mirrors the /session runner's
// existing lazy-expiry, where a timed-out attempt is finalised on the next
// page load rather than by a cron.
//
// Why the stamp matters (not just cosmetic): the one-live-claim-per-pack
// unique index counts a claim as live unless expired_at (or revoked_at) is
// set. So a lapsed-but-unstamped credit still occupies the (user, pack)
// slot — and re-claiming that pack with a fresh credit would be wrongly
// rejected (23505) until the old row is stamped. The claim actions call
// this first for exactly that reason.
//
// The credits table has no student-write RLS (owner-select only, §7), so
// the write goes through the service-role client, like claim/activate.
// Plain server module (no 'use server'): it is only ever called
// server-side (from getStudentReadinessView and the claim actions), so it
// needs none of the Server Action machinery.

import { createServiceRoleClient } from '@/lib/supabase/server';

/** Stamp expired_at on the given student's credits whose window has lapsed
 *  unused, as of now. Optionally scope to a single pack (the re-claim path
 *  only needs that pack's index slot freed).
 *
 *  Idempotent + race-safe by construction: the WHERE clause re-checks every
 *  precondition (activated, not terminal, deadline strictly past), so a
 *  concurrent stamp, an already-expired row, or a since-USED credit is
 *  simply not matched. Satisfies the table's expiry-requires-activation and
 *  one-ending CHECKs (used_at / revoked_at are required NULL). Best-effort:
 *  on error it returns 0 and the caller carries on — display self-heals via
 *  isLapsedLive, and the next touch retries the write.
 *
 *  Returns the number of rows stamped. */
export async function sweepLapsedReadinessCredits(
  userId: string,
  packId?: string,
): Promise<number> {
  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  let query = admin
    .from('nclex_readiness_credits')
    .update({ expired_at: nowIso, updated_at: nowIso })
    .eq('user_id', userId)
    .not('activated_at', 'is', null) // a window must have started
    .is('used_at', null) // not sat
    .is('expired_at', null) // not already stamped
    .is('revoked_at', null) // not taken back
    .lt('expires_at', nowIso); // deadline is in the past

  if (packId) query = query.eq('pack_id', packId);

  const { data, error } = await query.select('credit_id');
  if (error) return 0;
  return data?.length ?? 0;
}
