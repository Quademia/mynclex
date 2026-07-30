// mynclex/lib/practice/history/actions.ts
//
// Server actions for the History directory.
//
// ⚠ A 'use server' module may export ONLY async functions. A bare
// `export const` or a re-exported type breaks the build — and tsc and
// eslint both miss it, so it only surfaces when the route is compiled.
// Types belong in ./types.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Discards an unfinished practice sitting.
 *
 * All four eligibility rules live in `nclex_discard_attempt` rather than
 * here: a student has no UPDATE permission on nclex_attempts, so this is
 * not a convenience wrapper around a write we could otherwise do — the
 * function IS the write, and it re-checks ownership itself. That means a
 * forged attempt id from a stale tab is refused by the database, not by
 * the page that rendered the button.
 *
 * Returns a plain result rather than throwing, so the caller can show a
 * toast instead of an error page. The messages are the database's own,
 * which are written to be read by a student.
 */
export async function discardAttemptAction(
  attemptId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc('nclex_discard_attempt', {
    p_attempt_id: attemptId,
  });

  if (error) {
    return { ok: false, error: error.message || 'Could not discard that session.' };
  }

  // The list is force-dynamic, but the discarded row has to disappear from
  // the current view without a manual reload.
  revalidatePath('/student/bank/history');
  return { ok: true };
}
