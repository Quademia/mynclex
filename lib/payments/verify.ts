// mynclex/lib/payments/verify.ts
//
// "Did this payment actually go through?" Called when the buyer returns
// from Paystack. We NEVER trust the browser that payment succeeded — we
// ask Paystack directly and check the amount matches what we expected.
//
// A Paystack charge can cover a whole checkout GROUP (programme + bank
// opt-in, 5.4b) — the rows share one reference. So we verify the group as a
// unit: sum the group's amounts and check that against what Paystack
// charged, then flip every row PAID.
//
// Stops at PAID. Turning PAID into access (enrolment / subscription +
// the welcome invite) is activate.ts — kept separate on purpose.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { paystackVerify } from './paystack';
import type { VerifyResult } from './types';

export async function verifyPayment(reference: string): Promise<VerifyResult> {
  const ref = reference.trim();
  if (!ref) return { ok: false, status: 'NOT_FOUND', error: 'Missing payment reference.' };

  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from('nclex_payments')
    .select('payment_id, amount_minor, status')
    .eq('paystack_reference', ref);

  if (error || !rows?.length) return { ok: false, status: 'NOT_FOUND', error: 'Payment not found.' };

  // Group state.
  if (rows.some((r) => r.status === 'FAILED')) {
    return { ok: false, status: 'FAILED', error: 'This payment was marked failed.' };
  }
  // Idempotent: already settled (every row past INIT).
  if (rows.every((r) => r.status === 'PAID' || r.status === 'ACTIVATED' || r.status === 'SETUP_REQUIRED')) {
    return { ok: true, status: 'ALREADY' };
  }

  const expectedTotal = rows.reduce((sum, r) => sum + Number(r.amount_minor), 0);

  try {
    const v = await paystackVerify(ref);
    const tx = v.data;

    if (tx.status !== 'success') {
      // Paystack has terminal-failure states (the charge will NOT complete on
      // this reference — a retry gets a fresh one) and transient ones (still
      // processing). Terminal → mark the group FAILED so the result screen
      // says "didn't go through" instead of "still waiting", and a re-hit
      // short-circuits. Transient → leave the rows INIT and report PENDING, so
      // the screen's auto-recheck can pick up the flip to success.
      const TERMINAL_FAILURE = new Set(['failed', 'abandoned', 'reversed']);
      if (TERMINAL_FAILURE.has(tx.status)) {
        await admin
          .from('nclex_payments')
          .update({ status: 'FAILED', paystack_payload_json: { verify: v } })
          .eq('paystack_reference', ref)
          .eq('status', 'INIT');
        return {
          ok: false,
          status: 'FAILED',
          error: 'Your payment did not go through, and you were not charged.',
        };
      }
      return { ok: false, status: 'PENDING', error: `Payment not completed (status: ${tx.status}).` };
    }

    // Amount tamper-guard: Paystack must have charged exactly the group total.
    if (Number(tx.amount) !== expectedTotal) {
      await admin
        .from('nclex_payments')
        .update({ status: 'FAILED', paystack_payload_json: { verify: v } })
        .eq('paystack_reference', ref);
      return { ok: false, status: 'FAILED', error: 'Paid amount did not match the expected amount.' };
    }

    // Flip the whole group PAID (only the still-INIT rows, so a re-hit
    // doesn't reset paid_at).
    await admin
      .from('nclex_payments')
      .update({ status: 'PAID', paid_at: new Date().toISOString(), paystack_payload_json: { verify: v } })
      .eq('paystack_reference', ref)
      .eq('status', 'INIT');

    return { ok: true, status: 'PAID' };
  } catch (e) {
    return { ok: false, status: 'ERROR', error: (e as Error).message };
  }
}
