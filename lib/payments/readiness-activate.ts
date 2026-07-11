'use server';

// mynclex/lib/payments/readiness-activate.ts
//
// Activation — starting a claimed pack's 21-day window. The commitment
// moment (§2): the clock starts now, can't be paused, and if the window
// closes unsat the pack is used up. Writes activated_at + expires_at
// (frozen per-credit) onto the CLAIMED credit for this pack; the DB
// CHECKs enforce the invariants (activation_requires_claim,
// activation_sets_deadline). Like claiming, this is a service-role
// action re-validating ownership (no student-write RLS on credits).
//
// This does NOT begin the exam — that's the runner (the sitting slice).
// Activation only opens the window; "Begin exam" is a separate,
// heavier gate.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const PACKS_PATH = '/student/bank/packs';

// The window length (§2). One number, here. NOT exported — a 'use server'
// file may only export async functions (a bare `export const` breaks the
// whole module at build). Move to a shared constants file if the sweep /
// runner needs it later.
const READINESS_WINDOW_DAYS = 21;

export interface ActivateResult {
  ok: boolean;
  error?: string;
}

export async function activateReadinessPack(packId: string): Promise<ActivateResult> {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in to start your window.' };

  const admin = createServiceRoleClient();

  // The one live CLAIMED credit for this pack (claimed, not yet activated,
  // not sat / lapsed / revoked). The one-live-claim index guarantees ≤1.
  const { data: credit } = await admin
    .from('nclex_readiness_credits')
    .select('credit_id')
    .eq('user_id', user.id)
    .eq('pack_id', packId)
    .not('claimed_at', 'is', null)
    .is('activated_at', null)
    .is('used_at', null)
    .is('expired_at', null)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();

  if (!credit) return { ok: false, error: "That pack isn't ready to start." };

  const now = new Date();
  const expires = new Date(now.getTime() + READINESS_WINDOW_DAYS * 86_400_000);
  const { error } = await admin
    .from('nclex_readiness_credits')
    .update({
      activated_at: now.toISOString(),
      expires_at: expires.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('credit_id', credit.credit_id)
    .is('activated_at', null); // race guard: only if not already started

  if (error) return { ok: false, error: error.message };

  revalidatePath(PACKS_PATH);
  return { ok: true };
}
