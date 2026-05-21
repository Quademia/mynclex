// mynclex/lib/payments/activate.ts
//
// Turns a PAID payment into actual access. Slice 5.3 handles BANK
// purposes only → an nclex_subscriptions row. (Programme enrolment
// activation lands in 5.4, once the payment carries the chosen cohort.)
//
// Two identity cases:
//   • Buyer already has an account → grant immediately, mark ACTIVATED.
//   • Pay-first guest (no account)  → send the Supabase invite, mark
//     SETUP_REQUIRED; the grant happens when they finish /welcome
//     (activatePendingForEmail, called from the welcome action).
//
// Everything here is idempotent: ACTIVATED short-circuits, and a
// subscription is created at most once per payment_id.

import 'server-only';
import { headers } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createServiceRoleClient>;

type PaymentRow = {
  payment_id: string;
  paystack_reference: string | null;
  user_id: string | null;
  email: string;
  purpose: string;
  product_id: string | null;
  status: string;
};

export type ActivateOutcome = 'ACTIVATED' | 'ALREADY' | 'INVITE_SENT';
export type ActivateResult =
  | { ok: true; outcome: ActivateOutcome }
  | { ok: false; error: string };

const PAYMENT_COLS =
  'payment_id, paystack_reference, user_id, email, purpose, product_id, status';

// Purposes that grant a bank/readiness subscription (vs programme enrolment).
const BANK_PURPOSES = ['BANK_PURCHASE', 'READINESS_PURCHASE', 'BANK_OPTIN_AT_PROGRAMME'];

async function findProfileIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const { data } = await admin
    .from('nclex_users')
    .select('id')
    .ilike('email', email.trim().toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}

// Insert the entitlement row. Idempotent: one subscription per payment.
async function grantBankSubscription(
  admin: AdminClient,
  payment: PaymentRow,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Cheap pre-check (limit(1), never maybeSingle — that errors on >1 row).
  // The real guarantee is the partial unique index on payment_id, enforced
  // on insert below.
  const { data: existing } = await admin
    .from('nclex_subscriptions')
    .select('subscription_id')
    .eq('payment_id', payment.payment_id)
    .limit(1);
  if (existing && existing.length > 0) return { ok: true };

  if (!payment.product_id) return { ok: false, error: 'Payment has no product to grant.' };

  const { data: product, error: prodErr } = await admin
    .from('nclex_products')
    .select('product_id, pack_type, duration_days')
    .eq('product_id', payment.product_id)
    .maybeSingle();
  if (prodErr || !product) return { ok: false, error: 'Product not found for activation.' };

  // Duration packs run for duration_days from now; readiness packs have
  // no end until the student "starts" them (5.x), so end_at stays NULL.
  const endAt =
    product.pack_type === 'BANK_DURATION' && product.duration_days
      ? new Date(Date.now() + product.duration_days * 86_400_000).toISOString()
      : null;

  const source = payment.purpose === 'BANK_OPTIN_AT_PROGRAMME' ? 'PROGRAMME_OPTIN' : 'SELF_PURCHASE';

  const { error: insErr } = await admin.from('nclex_subscriptions').insert({
    user_id: userId,
    product_id: product.product_id,
    pack_type: product.pack_type,
    source,
    status: 'ACTIVE',
    end_at: endAt,
    payment_id: payment.payment_id,
  });
  if (insErr) {
    // A concurrent activation already inserted the one allowed row
    // (unique index on payment_id) — that's success, not a failure.
    if (insErr.code === '23505') return { ok: true };
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}

async function activatePaymentRow(admin: AdminClient, payment: PaymentRow): Promise<ActivateResult> {
  if (payment.status === 'ACTIVATED') return { ok: true, outcome: 'ALREADY' };
  if (payment.status !== 'PAID' && payment.status !== 'SETUP_REQUIRED') {
    return { ok: false, error: 'Payment is not in a state that can be activated.' };
  }
  if (!BANK_PURPOSES.includes(payment.purpose)) {
    // Programme enrolment activation arrives in slice 5.4.
    return { ok: false, error: 'This payment type is not handled yet.' };
  }

  const userId = payment.user_id ?? (await findProfileIdByEmail(admin, payment.email));

  // Buyer has a profile → grant now.
  if (userId) {
    const grant = await grantBankSubscription(admin, payment, userId);
    if (!grant.ok) return { ok: false, error: grant.error };
    await admin
      .from('nclex_payments')
      .update({ status: 'ACTIVATED', activated_at: new Date().toISOString(), user_id: userId })
      .eq('payment_id', payment.payment_id);
    return { ok: true, outcome: 'ACTIVATED' };
  }

  // Pay-first guest. If we already invited on a prior pass, just wait.
  if (payment.status === 'SETUP_REQUIRED') {
    return { ok: true, outcome: 'INVITE_SENT' };
  }

  // First time: send the Supabase invite. The profile + grant happen when
  // they finish /welcome (no name yet, so no profile created here).
  const h = await headers();
  const origin = h.get('origin') ?? 'http://localhost:3000';
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(payment.email, {
    redirectTo: `${origin}/welcome`,
  });
  if (inviteErr || !invite?.user) {
    console.error('Pay-first invite failed:', inviteErr?.message);
    return {
      ok: false,
      error: 'Payment recorded, but we could not send the setup email. Please contact support.',
    };
  }
  await admin
    .from('nclex_payments')
    .update({ status: 'SETUP_REQUIRED', user_id: invite.user.id })
    .eq('payment_id', payment.payment_id);
  return { ok: true, outcome: 'INVITE_SENT' };
}

// Used by the callback page (via settlePayment).
export async function activatePaymentByReference(reference: string): Promise<ActivateResult> {
  const admin = createServiceRoleClient();
  const { data: payment, error } = await admin
    .from('nclex_payments')
    .select(PAYMENT_COLS)
    .eq('paystack_reference', reference)
    .maybeSingle();
  if (error || !payment) return { ok: false, error: 'Payment not found.' };
  return activatePaymentRow(admin, payment as PaymentRow);
}

// Used by /welcome after the profile + STUDENT role exist: grant any
// paid-but-not-activated bank payments for this email.
export async function activatePendingForEmail(email: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: payments } = await admin
    .from('nclex_payments')
    .select(PAYMENT_COLS)
    .ilike('email', email.trim().toLowerCase())
    .in('status', ['PAID', 'SETUP_REQUIRED']);
  if (!payments?.length) return;

  for (const p of payments) {
    const r = await activatePaymentRow(admin, p as PaymentRow);
    if (!r.ok) {
      console.error('activatePendingForEmail failed for', (p as PaymentRow).payment_id, r.error);
    }
  }
}
