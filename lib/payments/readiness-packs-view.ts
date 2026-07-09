// mynclex/lib/payments/readiness-packs-view.ts
//
// The student Readiness Packs surface — read side. Combines the
// published packs (what a student may claim) with the student's own
// credit rows (their status with each pack) into one per-pack card
// state, derived through the shared creditStage helper so every screen
// agrees.
//
// Card state per pack (§11.10 working concept):
//   CATALOGUE  — no credit to spend (buy)
//   CLAIMABLE  — an unclaimed credit is held, and this pack is claimable
//   CLAIMED    — a credit is claimed onto this pack; window not started
//   ACTIVE     — the 21-day window is running        (not reachable until
//   USED       — the one attempt was sat              the sitting slice)
//
// Claimability (§2 r4) is enforced by the DB's one-live-claim-per-pack
// index; here it surfaces in the state: a pack the student holds a live
// claim on (claimed / active / used) shows that state, never CLAIMABLE.
// A pack whose only credit LAPSED (expired unused) reads as fresh again
// — CLAIMABLE with a "lapsed" note. Members are never read (curator-only
// by RLS); the card shows the pack's own n + time.

import { createClient } from '@/lib/supabase/server';
import { creditStage } from './readiness-credits';

export type PackCardState = 'CATALOGUE' | 'CLAIMABLE' | 'CLAIMED' | 'ACTIVE' | 'USED';

export interface StudentPackCard {
  packId: string;
  /** "Pack N" from the id suffix — stable across pack deletions. */
  num: number;
  title: string;
  description: string | null;
  n: number;
  timeLimitSec: number;
  state: PackCardState;
  /** An earlier credit on this pack lapsed unused — it's fresh again. */
  lapsed: boolean;
  /** Whole days left in the window — ACTIVE cards only, else null.
   *  Clamped at 0 (a past-deadline credit reads ACTIVE until the sweep
   *  stamps expired_at; the card can still show "0 days left"). */
  daysLeft: number | null;
}

export interface StudentReadinessView {
  packs: StudentPackCard[];
  unclaimed: number;
  claimed: number;
  active: number;
  completed: number;
}

const EMPTY: StudentReadinessView = { packs: [], unclaimed: 0, claimed: 0, active: 0, completed: 0 };

/** "Pack N" from NCLEX_PACK_00004 → 4 (inlined to avoid pulling the whole
 *  curator queries module into a student surface). */
function packNumFromId(packId: string): number {
  const m = /_(\d+)$/.exec(packId);
  return m ? parseInt(m[1], 10) : 0;
}

export async function getStudentReadinessView(): Promise<StudentReadinessView> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const [{ data: packRows }, { data: creditRows }] = await Promise.all([
    supabase
      .from('nclex_readiness_packs')
      .select('pack_id, title, description, n, time_limit_sec')
      .eq('published', true)
      .eq('status', 'active')
      .order('pack_id'),
    supabase
      .from('nclex_readiness_credits')
      .select('pack_id, claimed_at, activated_at, expires_at, used_at, expired_at, revoked_at')
      .eq('user_id', user.id),
  ]);

  const credits = (creditRows ?? []).map((c) => ({
    packId: c.pack_id as string | null,
    stage: creditStage(c),
    expiresAt: c.expires_at as string | null,
  }));

  const unclaimed = credits.filter((c) => c.stage === 'UNCLAIMED').length;

  // The one LIVE claim per pack (DB-guaranteed ≤1): claimed / active / used.
  // Expired / revoked credits release the pack, so they don't count here.
  const liveByPack = new Map<string, { stage: 'CLAIMED' | 'ACTIVE' | 'USED'; expiresAt: string | null }>();
  const lapsedPacks = new Set<string>();
  for (const c of credits) {
    if (!c.packId) continue;
    if (c.stage === 'CLAIMED' || c.stage === 'ACTIVE' || c.stage === 'USED') {
      liveByPack.set(c.packId, { stage: c.stage, expiresAt: c.expiresAt });
    } else if (c.stage === 'EXPIRED') {
      lapsedPacks.add(c.packId);
    }
  }

  const now = Date.now();
  const packs: StudentPackCard[] = (packRows ?? []).map((p) => {
    const live = liveByPack.get(p.pack_id);
    const state: PackCardState = live?.stage ?? (unclaimed > 0 ? 'CLAIMABLE' : 'CATALOGUE');
    const daysLeft =
      state === 'ACTIVE' && live?.expiresAt
        ? Math.max(0, Math.ceil((new Date(live.expiresAt).getTime() - now) / 86_400_000))
        : null;
    return {
      packId: p.pack_id,
      num: packNumFromId(p.pack_id),
      title: p.title,
      description: p.description,
      n: p.n ?? 100,
      timeLimitSec: p.time_limit_sec ?? 12000,
      state,
      lapsed: !live && lapsedPacks.has(p.pack_id),
      daysLeft,
    };
  });

  const liveStages = [...liveByPack.values()].map((v) => v.stage);
  return {
    packs,
    unclaimed,
    claimed: liveStages.filter((s) => s === 'CLAIMED').length,
    active: liveStages.filter((s) => s === 'ACTIVE').length,
    completed: liveStages.filter((s) => s === 'USED').length,
  };
}
