// mynclex/lib/practice/cases/actions.ts
//
// Server action for the student Case Study bank: turn the 1–2 cases the
// student picked into an attempt, and hand back its id so the page can
// send them to the existing runner at /session/[id].
//
// ⚠ This module must export ONLY async functions. A bare `export const`
// or a re-exported `export type` in a 'use server' file breaks the
// production build while tsc and eslint both stay silent — the types live
// in ./types, imported here as type-only.
//
// The RPC is the real gate, not this wrapper: it re-checks every case
// against the same eligibility helper the list read, so a stale tab or a
// hand-rolled call cannot start a case that is locked for this student.

'use server';

import { createClient } from '@/lib/supabase/server';
import type { CaseBankMode } from './types';

export async function createCaseAttemptAction(args: {
  caseIds: string[];
  mode: CaseBankMode;
}): Promise<{ ok: true; attemptId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (args.caseIds.length < 1) {
    return { ok: false, error: 'Add a case first.' };
  }
  if (args.caseIds.length > 2) {
    return { ok: false, error: 'You can sit at most two cases at a time.' };
  }

  const { data, error } = await supabase.rpc('nclex_create_case_attempt', {
    p_case_ids: args.caseIds,
    p_mode: args.mode,
  });

  if (error) {
    // The RPC's "case not available" is deliberately reason-free, and so
    // is what we show. Never surface why a case is unavailable.
    const unavailable = error.message.includes('case not available');
    return {
      ok: false,
      error: unavailable
        ? 'That case is no longer available. Refresh the page and try again.'
        : error.message,
    };
  }

  return { ok: true, attemptId: data as string };
}
