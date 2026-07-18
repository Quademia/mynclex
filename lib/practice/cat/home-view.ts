// mynclex/lib/practice/cat/home-view.ts
//
// The read behind the CAT home (/student/bank/cat). Server-only.
//
// Plan: bank-consumption-cat.html §10.7.2 (the CAT home shape), §15.5
// (allowance), §9 (exam shape).
//
// HONESTY CONSTRAINT (§10.7.2). Regions that would lie are not rendered.
// `allowance` is null whenever the student's entitlement is unlimited —
// which is every student today, since cat_allowance defaults to NULL — so
// the page shows no count rather than inventing "2 of 3 left". Same reason
// history returns an empty array rather than placeholder rows.

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { MIN_ITEMS, MAX_ITEMS, TIME_LIMIT_SECONDS } from '@/lib/cat';

export type CatHistoryEntry = {
  attemptId:   string;
  endedAt:     string | null;
  status:      string;
  verdict:     'ABOVE_STANDARD' | 'BELOW_STANDARD' | null;
  itemsAdministered: number | null;
  finalTheta:  number | null;
  finalSe:     number | null;
};

export type CatHomeView = {
  /** A live CAT to resume, if one exists. */
  inProgressAttemptId: string | null;
  /**
   * Remaining CATs in the current window, or null for unlimited.
   * Null is the normal case today — see the honesty constraint above.
   */
  allowance: { remaining: number; total: number } | null;
  /** True when a finite allowance exists and is spent. */
  exhausted: boolean;
  history: CatHistoryEntry[];
  /** Exam shape, read from the engine constants so copy cannot drift. */
  shape: { minItems: number; maxItems: number; hours: number };
};

export async function getCatHomeView(): Promise<CatHomeView> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;

  const shape = {
    minItems: MIN_ITEMS,
    maxItems: MAX_ITEMS,
    hours: TIME_LIMIT_SECONDS / 3600,
  };

  if (!userId) {
    return { inProgressAttemptId: null, allowance: null, exhausted: false, history: [], shape };
  }

  // Own CAT attempts. RLS restricts to the owner; ordering newest first.
  const { data: attempts } = await supabase
    .from('nclex_attempts')
    .select('attempt_id, status, started_at, ended_at, cat_verdict, cat_items_administered, cat_final_theta, cat_final_se')
    .eq('student_id', userId)
    .eq('mode', 'CAT')
    .order('created_at', { ascending: false });

  const rows = attempts ?? [];

  const live = rows.find((r) => r.status === 'IN_PROGRESS');

  const history: CatHistoryEntry[] = rows
    .filter((r) => r.status !== 'IN_PROGRESS')
    .map((r) => ({
      attemptId: r.attempt_id,
      endedAt: r.ended_at,
      status: r.status,
      verdict: r.cat_verdict,
      itemsAdministered: r.cat_items_administered,
      finalTheta: r.cat_final_theta,
      finalSe: r.cat_final_se,
    }));

  // ── Allowance (§15.5) ────────────────────────────────────────────
  // Most-generous-wins across stacked active bank rows: NULL on ANY active
  // row means unlimited. Mirrors the guard inside create_cat_attempt — this
  // read is courtesy for the UI, the RPC remains authoritative.
  const { data: subs } = await supabase
    .from('nclex_subscriptions')
    .select('cat_allowance, started_at, end_at, status, pack_type')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE');

  const activeBank = (subs ?? []).filter(
    (s) =>
      (s.pack_type === 'BANK_DURATION' || s.pack_type === 'TRIAL') &&
      (s.end_at === null || new Date(s.end_at).getTime() > Date.now()),
  );

  let allowance: CatHomeView['allowance'] = null;
  let exhausted = false;

  if (activeBank.length > 0 && activeBank.every((s) => s.cat_allowance !== null)) {
    // Every active row is finite, so a count is meaningful. Take the most
    // generous row's headroom — the same rule the guard applies.
    let best = { remaining: -1, total: 0 };
    for (const s of activeBank) {
      const total = s.cat_allowance as number;
      const used = rows.filter(
        (r) => r.started_at !== null && new Date(r.started_at) >= new Date(s.started_at),
      ).length;
      const remaining = Math.max(total - used, 0);
      if (remaining > best.remaining) best = { remaining, total };
    }
    allowance = { remaining: best.remaining, total: best.total };
    exhausted = best.remaining === 0;
  }

  return {
    inProgressAttemptId: live?.attempt_id ?? null,
    allowance,
    exhausted,
    history,
    shape,
  };
}
