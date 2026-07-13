'use server';

// mynclex/lib/payments/readiness-claim.ts
//
// Claiming — turning a generic credit into a NAMED pack. The credits
// table has no student-write RLS (owner-select only, §7), so writes go
// through these service-role actions that re-validate ownership in code
// — the layered-enforcement pattern activate.ts uses. Claiming sets
// pack_id + claimed_at on ONE unclaimed credit; the DB's
// one-live-claim-per-pack index is the hard guard against double-claim
// (and, later, against re-claiming a sat pack).
//
// This is Slice ②b.1: claim + claim-all only. Activation (starting the
// 21-day window) and beginning the exam are the sitting slice — no
// action here touches activated_at.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sweepLapsedReadinessCredits } from './readiness-expiry';
import { revalidatePath } from 'next/cache';

const PACKS_PATH = '/student/bank/packs';

export interface ClaimResult {
  ok: boolean;
  error?: string;
}

async function currentUserId(): Promise<string | null> {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  return user?.id ?? null;
}

/** Claim one unclaimed credit onto a specific pack. */
export async function claimReadinessPack(packId: string): Promise<ClaimResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Please sign in to claim a pack.' };

  const admin = createServiceRoleClient();

  const { data: pack } = await admin
    .from('nclex_readiness_packs')
    .select('pack_id, published, status')
    .eq('pack_id', packId)
    .maybeSingle();
  if (!pack || pack.published !== true || pack.status !== 'active') {
    return { ok: false, error: "That pack isn't available." };
  }

  // Correctness-critical lazy-expiry (§7): if an earlier credit on THIS
  // pack has lapsed unused, stamp its expired_at first so the
  // one-live-claim index releases the slot — otherwise the fresh claim
  // below collides (23505) and is wrongly refused as "already held".
  await sweepLapsedReadinessCredits(userId, packId);

  const creditId = await findUnclaimedCredit(admin, userId);
  if (!creditId) return { ok: false, error: 'You have no credits left to claim.' };

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from('nclex_readiness_credits')
    .update({ pack_id: packId, claimed_at: nowIso, updated_at: nowIso })
    .eq('credit_id', creditId)
    .is('claimed_at', null); // guard: only if still unclaimed (race-safe)

  if (error) {
    // The one-live-claim-per-pack index rejected it — the student already
    // holds this pack (or has sat it). Their credit is untouched.
    if (error.code === '23505') return { ok: false, error: 'You already hold this pack.' };
    return { ok: false, error: error.message };
  }

  revalidatePath(PACKS_PATH);
  return { ok: true };
}

/** Claim every still-claimable pack the student holds enough credits for
 *  — one credit per pack, in pack order, until the credits run out. */
export async function claimAllReadiness(): Promise<ClaimResult & { claimed?: number }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: 'Please sign in to claim your packs.' };

  const admin = createServiceRoleClient();

  // Lazy-expiry first (§7): stamp any of this student's lapsed windows so
  // the read below sees them as EXPIRED — otherwise a lapsed-but-unstamped
  // claim still counts as "live" here and its pack is wrongly skipped as
  // already held, and its index slot would block the re-claim.
  await sweepLapsedReadinessCredits(userId);

  const [{ data: packs }, { data: credits }] = await Promise.all([
    admin
      .from('nclex_readiness_packs')
      .select('pack_id')
      .eq('published', true)
      .eq('status', 'active')
      .order('pack_id'),
    admin
      .from('nclex_readiness_credits')
      .select('credit_id, pack_id, claimed_at, revoked_at, expired_at')
      .eq('user_id', userId),
  ]);

  const creditList = credits ?? [];
  const unclaimedIds = creditList
    .filter((c) => !c.pack_id && !c.claimed_at && !c.revoked_at && !c.expired_at)
    .map((c) => c.credit_id);
  // Packs the student already holds a live claim on — skip (never re-claim).
  const livePacks = new Set(
    creditList.filter((c) => c.pack_id && !c.expired_at && !c.revoked_at).map((c) => c.pack_id),
  );
  const claimablePacks = (packs ?? []).map((p) => p.pack_id).filter((id) => !livePacks.has(id));

  let claimed = 0;
  const nowIso = new Date().toISOString();
  for (const packId of claimablePacks) {
    if (claimed >= unclaimedIds.length) break; // out of credits
    const creditId = unclaimedIds[claimed];
    const { error } = await admin
      .from('nclex_readiness_credits')
      .update({ pack_id: packId, claimed_at: nowIso, updated_at: nowIso })
      .eq('credit_id', creditId)
      .is('claimed_at', null);
    if (!error) {
      claimed += 1;
    } else if (error.code !== '23505') {
      // A real failure — stop and report what got through. (23505 = a
      // concurrent claim took this pack; skip it, keep the credit.)
      revalidatePath(PACKS_PATH);
      return { ok: false, claimed, error: error.message };
    }
  }

  revalidatePath(PACKS_PATH);
  return { ok: true, claimed };
}

// ── internal ─────────────────────────────────────────────────────────
type AdminClient = ReturnType<typeof createServiceRoleClient>;

async function findUnclaimedCredit(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('nclex_readiness_credits')
    .select('credit_id')
    .eq('user_id', userId)
    .is('pack_id', null)
    .is('claimed_at', null)
    .is('revoked_at', null)
    .is('expired_at', null)
    .limit(1)
    .maybeSingle();
  return data?.credit_id ?? null;
}
