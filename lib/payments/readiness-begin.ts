'use server';

// mynclex/lib/payments/readiness-begin.ts
//
// Begin exam (§2 / step 2b-ii). From an ACTIVE pack card, build the sitting:
// nclex_create_readiness_attempt turns the pack's fixed 100 members into an
// ordinary attempt (source READINESS_PACK, Timed Sequential) and returns its
// id. This does NOT spend the shot — the attempt lands unstarted and the
// credit is untouched; the student then meets the full-stop preflight, and
// the shot only spends when they press Start there (nclex_start_readiness_attempt).
//
// The RPC is SECURITY DEFINER and reads auth.uid(), so the per-request SSR
// client (carrying the user's session) is all it needs — no service role.
// Idempotent: a repeated Begin reuses the pack's unstarted attempt.

import { createClient } from '@/lib/supabase/server';

export interface BeginResult {
  ok: boolean;
  attemptId?: string;
  error?: string;
}

export async function beginReadinessAttempt(packId: string): Promise<BeginResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in to begin.' };

  const { data, error } = await supabase.rpc('nclex_create_readiness_attempt', {
    p_pack_id: packId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, attemptId: data as string };
}
