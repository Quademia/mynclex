// mynclex/lib/payments/entitlements.ts
//
// Reads "does this user have active bank access?" on the TS side — the
// mirror of the SQL helper nclex_has_active_bank_access (Slice 5.6). Used
// by the page guard (requireActiveBankSubscription) and the picker UI.
//
// "Active bank access" = an ACTIVE subscription of a bank-family pack
// (BANK_DURATION or TRIAL) that hasn't expired (end_at null or future).
// Reads through the owner's own RLS (nclex_subscriptions_owner_select).

import 'server-only';
import { createClient } from '@/lib/supabase/server';

type SbClient = Awaited<ReturnType<typeof createClient>>;

export type BankAccess = {
  active: boolean;
  lifetime: boolean; // an active row with no end_at (e.g. future grants)
  daysLeft: number | null; // from the furthest end_at; null when lifetime/none
};

const NONE: BankAccess = { active: false, lifetime: false, daysLeft: null };

export async function bankAccessForUser(supabase: SbClient, userId: string): Promise<BankAccess> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('nclex_subscriptions')
    .select('end_at')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .in('pack_type', ['BANK_DURATION', 'TRIAL'])
    .or(`end_at.is.null,end_at.gt.${nowIso}`);

  if (!data || data.length === 0) return NONE;
  if (data.some((r) => r.end_at === null)) return { active: true, lifetime: true, daysLeft: null };

  const maxEnd = Math.max(...data.map((r) => new Date(r.end_at as string).getTime()));
  const daysLeft = Math.max(0, Math.ceil((maxEnd - Date.now()) / 86_400_000));
  return { active: true, lifetime: false, daysLeft };
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
