'use server';

// mynclex/lib/practice/cat/start-action.ts
//
// The one place a CAT can be started (§10.7, §10.7.1).
//
// Calling this IS the commitment: create_cat_attempt opens the attempt,
// picks question 1, starts the 4-hour clock and spends the allowance in one
// transaction. It is only ever called from the preflight's Confirm.
//
// NOTE (repo rule): a 'use server' module may export ONLY async functions.
// No `export const`, no `export type` re-exports — either breaks the module
// at build/load and takes its importers with it.

import { createClient } from '@/lib/supabase/server';

export async function startCatAttemptAction(): Promise<
  { ok: true; attemptId: string; resumed: boolean } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return { ok: false, error: 'Please sign in again to start a CAT.' };

  const { data, error } = await supabase.rpc('create_cat_attempt', {
    p_student_id: userId,
    p_intent: 'EXAM',
    p_mode: 'CAT',
  });

  if (error) {
    // The RPC raises insufficient_privilege for both "no bank access" and
    // "allowance exhausted". Surface something a student can act on rather
    // than a Postgres string.
    const msg = error.message ?? '';
    if (msg.includes('allowance exhausted')) {
      return { ok: false, error: 'You have used all the CATs included in your current plan.' };
    }
    if (msg.includes('bank access')) {
      return { ok: false, error: 'CAT needs an active Question Bank subscription.' };
    }
    if (msg.includes('no CAT-eligible questions')) {
      return { ok: false, error: 'No CAT questions are available right now. Please contact support.' };
    }
    return { ok: false, error: 'Could not start the CAT. Please try again.' };
  }

  const payload = data as { attempt_id?: string; resumed?: boolean } | null;
  if (!payload?.attempt_id) {
    return { ok: false, error: 'Could not start the CAT. Please try again.' };
  }

  return { ok: true, attemptId: payload.attempt_id, resumed: Boolean(payload.resumed) };
}
