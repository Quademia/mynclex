// mynclex/lib/payments/readiness-credits-read.ts
//
// The student's own readiness credits, read for display. This is the ②a
// read surface — "enough to see minted rows"; claiming, activation and
// the window sweep are later slices, so this is read-only and derives
// each row's stage via the shared creditStage helper.
//
// RLS already restricts nclex_readiness_credits to the caller's own rows
// (owner-select policy), but we ALSO filter by user_id: a SUPER_ADMIN
// would otherwise read everyone's via the admin_all policy, and "my
// credits" must always mean mine.

import { createClient } from '@/lib/supabase/server';
import { creditStage, type CreditStage } from './readiness-credits';

export interface MyCreditRow {
  creditId: string;
  source: 'SELF_PURCHASE' | 'BANK_BUNDLE' | 'ADMIN_GRANT';
  stage: CreditStage;
  packId: string | null;
  createdAt: string;
  claimedAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
}

export interface MyCreditsSummary {
  total: number;
  /** Count by stage — the compact signpost the dashboard shows in ②b. */
  byStage: Record<CreditStage, number>;
  rows: MyCreditRow[];
}

function emptyByStage(): Record<CreditStage, number> {
  return { UNCLAIMED: 0, CLAIMED: 0, ACTIVE: 0, USED: 0, EXPIRED: 0, REVOKED: 0 };
}

export async function getMyCredits(): Promise<MyCreditsSummary> {
  const supabase = await createClient();

  // getUser (revalidates the token), never getSession — auth rule #4.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { total: 0, byStage: emptyByStage(), rows: [] };

  const { data, error } = await supabase
    .from('nclex_readiness_credits')
    .select(
      'credit_id, source, pack_id, created_at, claimed_at, activated_at, expires_at, used_at, expired_at, revoked_at'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error || !data) return { total: 0, byStage: emptyByStage(), rows: [] };

  const byStage = emptyByStage();
  const rows: MyCreditRow[] = data.map((c) => {
    const stage = creditStage(c);
    byStage[stage] += 1;
    return {
      creditId: c.credit_id,
      source: c.source,
      stage,
      packId: c.pack_id,
      createdAt: c.created_at,
      claimedAt: c.claimed_at,
      activatedAt: c.activated_at,
      expiresAt: c.expires_at,
    };
  });

  return { total: rows.length, byStage, rows };
}
