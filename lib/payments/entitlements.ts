// mynclex/lib/payments/entitlements.ts
//
// Reads "does this user have active bank access?" on the TS side — the
// mirror of the SQL helper nclex_has_active_bank_access (Slice 5.6). Used
// by the page guard (requireActiveBankSubscription) and the picker UI.
//
// "Active bank access" = an ACTIVE subscription of a bank-family pack
// (BANK_DURATION or TRIAL) that hasn't expired (end_at null or future).
// Reads through the owner's own RLS (nclex_subscriptions_owner_select).
//
// ⭐ It asks a SECOND question when the first comes back empty: "did you
// ever hold one, and was it a trial?" (2026-09-04). The first query
// filters to passes that are still valid, so the row that explains the
// refusal is precisely the row it excludes — which is why the access wall
// used to hedge. See BankAccessReason below.

import 'server-only';
import { createClient } from '@/lib/supabase/server';

type SbClient = Awaited<ReturnType<typeof createClient>>;

/**
 * WHY there is or isn't access — so a surface can say something true
 * instead of guessing aloud (2026-09-04).
 *
 * ⭐ Before this, "no access" was a single `active: false` shared by three
 * different people: someone whose trial just ran out, someone whose paid
 * pass lapsed, and someone who has never bought anything. The access wall
 * hedged — "your access may have expired, or you don't have a pass yet" —
 * because nothing below it knew which.
 */
export type BankAccessReason = 'ACTIVE' | 'LAPSED_TRIAL' | 'LAPSED_PAID' | 'NEVER';

export type BankAccess = {
  active: boolean;
  lifetime: boolean; // an active row with no end_at (e.g. future grants)
  daysLeft: number | null; // from the furthest end_at; null when lifetime/none
  // The length of the window that `daysLeft` counts down, in whole days —
  // start to end of the SAME subscription row that owns the furthest
  // end_at, so a progress bar drawn from it can never disagree with the
  // number beside it. Null when lifetime/none, or when a legacy row has
  // no started_at. Also names the pass ("90-day") when a student has
  // stacked subscriptions and needs to know which one is running out.
  windowDays: number | null;
  reason: BankAccessReason;
  /** ISO end of the pass that ran out. Null unless reason is LAPSED_*. */
  endedAt: string | null;
};

const NONE: BankAccess = {
  active: false,
  lifetime: false,
  daysLeft: null,
  windowDays: null,
  reason: 'NEVER',
  endedAt: null,
};

/**
 * What counts as a bank-family pass. Shared by both queries below so the
 * "do you have one?" and the "did you ever have one?" reads can never
 * disagree about what they are looking for.
 *
 * ⓘ 'TRIAL' cannot actually occur: nclex_subscriptions_pack_type_check
 * restricts the column to 'BANK_DURATION', and a trial is written as an
 * ordinary BANK_DURATION pass distinguished only by `source` (see the
 * ternary in activate.ts). Kept because it is what the original filter
 * said and removing it changes nothing; it is documented here rather than
 * quietly copied into a second place.
 */
const BANK_PACK_TYPES = ['BANK_DURATION', 'TRIAL'];

const DAY_MS = 86_400_000;

export async function bankAccessForUser(supabase: SbClient, userId: string): Promise<BankAccess> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('nclex_subscriptions')
    .select('started_at, end_at')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .in('pack_type', BANK_PACK_TYPES)
    .or(`end_at.is.null,end_at.gt.${nowIso}`);

  // No valid pass. Ask the SECOND question — did they ever hold one? — so
  // the surfaces above can name what happened. Runs only on this path, so
  // a student who has access never pays for it.
  if (!data || data.length === 0) return lapsedAccessFor(supabase, userId, nowIso);
  if (data.some((r) => r.end_at === null)) {
    return { ...NONE, active: true, lifetime: true, reason: 'ACTIVE' };
  }

  // The furthest end_at wins — that is the access the student actually
  // has — and the bar must be drawn from THAT row's own window.
  const furthest = data.reduce((best, r) =>
    new Date(r.end_at as string).getTime() > new Date(best.end_at as string).getTime() ? r : best,
  );
  const maxEnd = new Date(furthest.end_at as string).getTime();
  const daysLeft = Math.max(0, Math.ceil((maxEnd - Date.now()) / DAY_MS));

  // Defensive: pre-duration legacy rows may carry no started_at. No
  // denominator means no bar — the number still shows.
  const startMs = furthest.started_at ? new Date(furthest.started_at as string).getTime() : NaN;
  const windowDays =
    Number.isFinite(startMs) && maxEnd > startMs
      ? Math.max(1, Math.round((maxEnd - startMs) / DAY_MS))
      : null;

  return { ...NONE, active: true, lifetime: false, daysLeft, windowDays, reason: 'ACTIVE' };
}

/**
 * The most recent bank pass that has already ended, if there was one.
 *
 * ⚠ Two statuses, not one. A lapsed pass sits at 'ACTIVE' with a past
 * end_at until the nightly sweep (step 4c of nclex_enrolment_nightly_sweep)
 * flips it to 'EXPIRED', so which one it is depends only on whether the
 * cron has run since. Both mean the same thing to a student and both are
 * accepted here. 'REVOKED' is excluded on purpose: a refund or an admin
 * correction is not an expiry, and telling someone their access "ended" on
 * the day it was taken back would be the wrong sentence.
 *
 * ⓘ Ordered by end_at DESC — the LAST pass to end wins. A student who
 * trialled, then bought, then lapsed reads as LAPSED_PAID, because the
 * paid pass is the access they actually lost (Sam, 2026-09-04).
 *
 * ⚠ Names .eq('user_id') rather than leaning on RLS: nclex_subscriptions
 * is readable by more than its owner (the admin FOR ALL policy), so an
 * unscoped read would answer for the wrong person — the RLS-floor rule.
 */
async function lapsedAccessFor(
  supabase: SbClient,
  userId: string,
  nowIso: string,
): Promise<BankAccess> {
  const { data } = await supabase
    .from('nclex_subscriptions')
    .select('source, end_at')
    .eq('user_id', userId)
    .in('pack_type', BANK_PACK_TYPES)
    .in('status', ['ACTIVE', 'EXPIRED'])
    .not('end_at', 'is', null)
    .lte('end_at', nowIso)
    .order('end_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return NONE; // never held one — NONE already reads 'NEVER'

  return {
    ...NONE,
    reason: data.source === 'SELF_TRIAL_SIGNUP' ? 'LAPSED_TRIAL' : 'LAPSED_PAID',
    endedAt: (data.end_at as string) ?? null,
  };
}

// Convenience for surfaces that don't already hold an auth context.
export async function getMyBankAccess(): Promise<BankAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NONE;
  return bankAccessForUser(supabase, user.id);
}

// Does this user hold ANY readiness entitlement — a credit that hasn't
// been taken back? This is what lets a pack-owner past the bank space's
// front door even with no bank subscription (readiness-packs.md §11.10 +
// the 2026-07-09 IA decision). It is NOT gate for the bank-consumption
// pages — those keep their own bankAccessForUser check. A revoked credit
// (refund/admin correction) no longer counts. Reads through the owner's
// own RLS (nclex_readiness_credits_owner_select).
export async function ownsReadinessForUser(supabase: SbClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('nclex_readiness_credits')
    .select('credit_id')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .limit(1);
  return !!data && data.length > 0;
}
