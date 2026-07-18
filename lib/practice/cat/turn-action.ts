'use server';

// mynclex/lib/practice/cat/turn-action.ts
//
// One turn of a CAT, called from the runner.
//
// Plan: bank-consumption-cat.html §10.2, §10.6.
//
// Scoring and the Rasch update run HERE, on the server — never in the
// browser. The practice runner scores client-side with the RPC
// range-checking the result, which is fine for practice and not good enough
// for a high-stakes verdict: a student must not be able to post their own
// ability estimate.
//
// NOTE (repo rule): a 'use server' module may export ONLY async functions.

import { createClient } from '@/lib/supabase/server';
import { makeCatDb } from './db';
import { playTurn } from './turn';
import type { BankItemAnswer } from '@/lib/scoring';

export async function catTurnAction(
  attemptId: string,
  answer: BankItemAnswer,
  elapsedSeconds: number,
): Promise<
  | { ok: true; status: 'CONTINUE'; position: number }
  | { ok: true; status: 'COMPLETE'; verdict: string; reason: string; itemsAdministered: number; readinessProbability: number }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createClient();

    // Ownership + liveness are enforced inside cat_next_item against
    // auth.uid(); this action never trusts the attemptId on its own.
    const result = await playTurn(makeCatDb(supabase), {
      attemptId,
      answer,
      elapsedSeconds,
    });

    if (result.status === 'COMPLETE') {
      return {
        ok: true,
        status: 'COMPLETE',
        verdict: result.verdict,
        reason: result.reason,
        itemsAdministered: result.itemsAdministered,
        readinessProbability: result.readinessProbability,
      };
    }

    return { ok: true, status: 'CONTINUE', position: result.nextItem.position };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    if (msg.includes('attempt is already')) {
      return { ok: false, error: 'This CAT has already ended.' };
    }
    if (msg.includes('attempt not found')) {
      return { ok: false, error: 'That CAT could not be found.' };
    }
    if (msg.includes('pool exhausted')) {
      return { ok: false, error: 'No further questions are available. Please contact support.' };
    }
    return { ok: false, error: 'Could not load the next question. Please try again.' };
  }
}
