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
//   ACTIVE     — the 21-day window is running; not yet begun
//   SITTING    — the shot was spent and the sitting is still IN_PROGRESS
//                (left mid-exam → Resume while the clock runs; §2 r3)
//   USED       — the sitting is finished (terminal); the pack is closed
//
// Claimability (§2 r4) is enforced by the DB's one-live-claim-per-pack
// index; here it surfaces in the state: a pack the student holds a live
// claim on (claimed / active / used) shows that state, never CLAIMABLE.
// A pack whose only credit LAPSED (expired unused) reads as fresh again
// — CLAIMABLE with a "lapsed" note. Members are never read (curator-only
// by RLS); the card shows the pack's own n + time.

import { createClient } from '@/lib/supabase/server';
import { creditStage, isLapsedLive } from './readiness-credits';
import { sweepLapsedReadinessCredits } from './readiness-expiry';

export type PackCardState = 'CATALOGUE' | 'CLAIMABLE' | 'CLAIMED' | 'ACTIVE' | 'SITTING' | 'USED';

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
  /** Whole days left in the window — ACTIVE/SITTING/USED cards, else null.
   *  For ACTIVE/SITTING it's time-to-sit; for USED it's the remaining
   *  answer-review window (review closes at expires_at, the score persists
   *  forever). Clamped at 0. */
  daysLeft: number | null;
  /** The in-progress sitting to resume — SITTING cards only, else null. */
  resumeAttemptId: string | null;
  /** The finished sitting's attempt — USED cards only, else null. Powers
   *  the "See your full report" link to the permanent report page. */
  reportAttemptId: string | null;
  /** USED only: is the 21-day answer-review window still open? Drives the
   *  card note. Always false for non-USED. */
  reviewOpen: boolean;
  /** The sitting's score (0..1) — USED cards only, else null. Drives the
   *  mark + derived Readiness band on the completed card. */
  finalScore: number | null;
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

  // Lazy-expiry write-through (§7 Lapse mechanism): stamp expired_at on any
  // of this student's windows that have lapsed unused, so the reads below
  // derive EXPIRED from the row and — the point of persisting it — the
  // one-live-claim index frees the pack for a fresh claim. There is no
  // nightly sweep; the next touch self-heals the row. Best-effort: if the
  // write fails the derivation below still shows the card as lapsed live.
  await sweepLapsedReadinessCredits(user.id);

  const [{ data: packRows }, { data: creditRows }] = await Promise.all([
    supabase
      .from('nclex_readiness_packs')
      .select('pack_id, title, description, n, time_limit_sec')
      .eq('published', true)
      .eq('status', 'active')
      .order('pack_id'),
    supabase
      .from('nclex_readiness_credits')
      .select('pack_id, attempt_id, claimed_at, activated_at, expires_at, used_at, expired_at, revoked_at')
      .eq('user_id', user.id),
  ]);

  const now = Date.now();
  const credits = (creditRows ?? []).map((c) => {
    // Display never waits on the stamp: a past-deadline ACTIVE credit reads
    // EXPIRED live, so the card flips to lapsed/claimable even in the rare
    // render where the best-effort sweep above didn't land (§7).
    let stage = creditStage(c);
    if (stage === 'ACTIVE' && isLapsedLive(c, now)) stage = 'EXPIRED';
    return {
      packId: c.pack_id as string | null,
      attemptId: c.attempt_id as string | null,
      stage,
      expiresAt: c.expires_at as string | null,
    };
  });

  // A USED credit carries its sitting's attempt_id. Read those attempts'
  // status to split "sitting in progress" (resume) from "finished" (results),
  // and their final_score to show the mark + band on the completed card.
  const usedAttemptIds = credits
    .filter((c) => c.stage === 'USED' && c.attemptId)
    .map((c) => c.attemptId as string);
  const attemptById = new Map<string, { status: string; finalScore: number | null }>();
  if (usedAttemptIds.length > 0) {
    const { data: attempts } = await supabase
      .from('nclex_attempts')
      .select('attempt_id, status, final_score')
      .in('attempt_id', usedAttemptIds);
    for (const a of attempts ?? []) {
      attemptById.set(a.attempt_id as string, {
        status: a.status as string,
        finalScore: (a.final_score as number | null) ?? null,
      });
    }
  }

  const unclaimed = credits.filter((c) => c.stage === 'UNCLAIMED').length;

  // The one LIVE claim per pack (DB-guaranteed ≤1): claimed / active / used.
  // Expired / revoked credits release the pack, so they don't count here.
  const liveByPack = new Map<
    string,
    { stage: 'CLAIMED' | 'ACTIVE' | 'USED'; expiresAt: string | null; attemptId: string | null }
  >();
  const lapsedPacks = new Set<string>();
  for (const c of credits) {
    if (!c.packId) continue;
    if (c.stage === 'CLAIMED' || c.stage === 'ACTIVE' || c.stage === 'USED') {
      liveByPack.set(c.packId, { stage: c.stage, expiresAt: c.expiresAt, attemptId: c.attemptId });
    } else if (c.stage === 'EXPIRED') {
      lapsedPacks.add(c.packId);
    }
  }

  const packs: StudentPackCard[] = (packRows ?? []).map((p) => {
    const live = liveByPack.get(p.pack_id);

    // A USED credit whose sitting is still IN_PROGRESS reads as SITTING
    // (resume mid-clock); a terminal sitting reads as USED (finished).
    let state: PackCardState;
    let resumeAttemptId: string | null = null;
    let finalScore: number | null = null;
    if (live?.stage === 'USED') {
      const at = live.attemptId ? attemptById.get(live.attemptId) : undefined;
      if (at?.status === 'IN_PROGRESS') {
        state = 'SITTING';
        resumeAttemptId = live.attemptId;
      } else {
        state = 'USED';
        finalScore = at?.finalScore ?? null;
      }
    } else {
      state = live?.stage ?? (unclaimed > 0 ? 'CLAIMABLE' : 'CATALOGUE');
    }

    // Days left in the window applies to ACTIVE/SITTING (time to sit) and
    // USED (remaining answer-review window — the score persists, review
    // closes at expires_at).
    const daysLeft =
      (state === 'ACTIVE' || state === 'SITTING' || state === 'USED') && live?.expiresAt
        ? Math.max(0, Math.ceil((new Date(live.expiresAt).getTime() - now) / 86_400_000))
        : null;

    // USED cards link to the permanent report; review stays open until the
    // window deadline.
    const reportAttemptId = state === 'USED' ? live?.attemptId ?? null : null;
    const reviewOpen =
      state === 'USED' && live?.expiresAt ? now < new Date(live.expiresAt).getTime() : false;

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
      resumeAttemptId,
      reportAttemptId,
      reviewOpen,
      finalScore,
    };
  });

  const states = packs.map((p) => p.state);
  return {
    packs,
    unclaimed,
    claimed: states.filter((s) => s === 'CLAIMED').length,
    active: states.filter((s) => s === 'ACTIVE' || s === 'SITTING').length,
    completed: states.filter((s) => s === 'USED').length,
  };
}
