// mynclex/lib/payments/verify.ts
//
// "Did this payment actually go through?" Called when the buyer returns
// from Paystack. We NEVER trust the browser that payment succeeded — we
// ask Paystack directly and check the amount matches what we expected.
//
// Stops at PAID. Turning PAID into access (enrolment / subscription +
// the welcome invite) is slice 5.3 — kept separate on purpose.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { paystackVerify } from './paystack';
import type { VerifyResult, PaymentPurpose } from './types';

export async function verifyPayment(reference: string): Promise<VerifyResult> {
  const ref = reference.trim();
  if (!ref) return { ok: false, status: 'NOT_FOUND', error: 'Missing payment reference.' };

  const admin = createServiceRoleClient();
  const { data: payment, error } = await admin
    .from('nclex_payments')
    .select('paystack_reference, amount_minor, status, purpose, paystack_payload_json')
    .eq('paystack_reference', ref)
    .maybeSingle();

  if (error || !payment) return { ok: false, status: 'NOT_FOUND', error: 'Payment not found.' };

  const purpose = payment.purpose as PaymentPurpose;

  // Idempotent: already settled.
  if (payment.status === 'PAID' || payment.status === 'ACTIVATED') {
    return { ok: true, status: 'ALREADY', reference: ref, purpose };
  }
  if (payment.status === 'FAILED') {
    return { ok: false, status: 'FAILED', error: 'This payment was marked failed.' };
  }

  try {
    const v = await paystackVerify(ref);
    const tx = v.data;

    if (tx.status !== 'success') {
      // Leave the row INIT — the buyer may not have completed payment yet.
      return { ok: false, status: 'PENDING', error: `Payment not completed (status: ${tx.status}).` };
    }

    // Amount tamper-guard: Paystack must have charged exactly what we set.
    if (Number(tx.amount) !== Number(payment.amount_minor)) {
      await admin
        .from('nclex_payments')
        .update({
          status: 'FAILED',
          paystack_payload_json: { ...(payment.paystack_payload_json ?? {}), verify: v },
        })
        .eq('paystack_reference', ref);
      return { ok: false, status: 'FAILED', error: 'Paid amount did not match the expected amount.' };
    }

    await admin
      .from('nclex_payments')
      .update({
        status: 'PAID',
        paid_at: new Date().toISOString(),
        paystack_payload_json: { ...(payment.paystack_payload_json ?? {}), verify: v },
      })
      .eq('paystack_reference', ref);

    return { ok: true, status: 'PAID', reference: ref, purpose };
  } catch (e) {
    return { ok: false, status: 'ERROR', error: (e as Error).message };
  }
}
