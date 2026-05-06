// mynclex/lib/bank/builder/actions.ts
//
// Server actions for the Practice page:
//
//   • countEligibleAction — wraps nclex_count_eligible_items. Called
//     from the client on every filter change (debounced ~150 ms in the
//     client component). Cheap — RPC only reads, no writes.
//
//   • createAttemptAction — wraps nclex_create_attempt. Called once on
//     Start click. Returns { ok: true, attemptId } on success or
//     { ok: false, error } on failure. The page redirects to the
//     /session/[id] runner stub on success.
//
//   • discardAttemptAction — for the runner stub's "Discard" button.
//     Wraps nclex_discard_attempt.
//
// All three respect server-side auth rules (rule #4 in CLAUDE.md):
// per-request Supabase client, getUser() not getSession(), errors
// surface as plain { ok, error } objects instead of throwing.

'use server';

import { createClient } from '@/lib/supabase/server';
import type { BreakdownResult, CountResult, FilterPayload } from './types';
import type { Intent, ModeId } from './filter-config';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Live count for the builder's match chip + breakdown preview.
 */
export async function countEligibleAction(
  filters: FilterPayload
): Promise<ActionResult<CountResult>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase.rpc('nclex_count_eligible_items', {
    p_filters: filters,
  });

  if (error) return { ok: false, error: error.message };
  // RPC returns JSONB; supabase-js gives us the parsed object.
  return { ok: true, data: data as CountResult };
}

/**
 * Per-axis row counts for every checkbox row + pool chip. Same filter
 * shape as countEligibleAction; called on the same debounced cadence.
 * Returns 10 axes worth of per-value counts.
 */
export async function breakdownAction(
  filters: FilterPayload
): Promise<ActionResult<BreakdownResult>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase.rpc('nclex_filter_breakdown', {
    p_filters: filters,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as BreakdownResult };
}

/**
 * Start click: create an attempt and return its id (for redirect to
 * the runner stub).
 */
export async function createAttemptAction(args: {
  filters: FilterPayload;
  mode: ModeId;
  intent: Intent;
  count: number;
}): Promise<ActionResult<{ attemptId: string }>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase.rpc('nclex_create_attempt', {
    p_filters:          args.filters,
    p_mode:             args.mode,
    p_intent:           args.intent,
    p_requested_count:  args.count,
    p_source:           'CUSTOM_BUILT',
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { attemptId: data as string } };
}

/**
 * Discard from the runner stub. Hard-deletes snapshot rows + flips
 * status to ABANDONED.
 */
export async function discardAttemptAction(
  attemptId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase.rpc('nclex_discard_attempt', {
    p_attempt_id: attemptId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
