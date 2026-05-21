// mynclex/lib/payments/activate.ts
//
// Turns a PAID payment into actual access:
//   • BANK / readiness purposes  → an nclex_subscriptions row (5.3).
//   • PROGRAMME_INITIAL          → an nclex_enrolments row (5.4a):
//       tutor-led → PENDING_APPROVAL (tutor still approves),
//       self-paced → ENROLLED immediately (no approval gate).
//
// Two identity cases (both purposes):
//   • Buyer already has an account → grant immediately, mark ACTIVATED.
//   • Pay-first guest (no account)  → send the Supabase invite, mark
//     SETUP_REQUIRED; the grant happens when they finish /welcome
//     (activatePendingForEmail, called from the welcome action).
//
// Everything here is idempotent: ACTIVATED short-circuits, a subscription
// is created at most once per payment_id, and an enrolment is created at
// most once per (student, cohort) / (student, programme) — the partial
// unique indexes on nclex_enrolments are the hard backstop.

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
  programme_id: string | null;
  cohort_id: string | null;
  enrolment_id: string | null;
  status: string;
};

export type ActivateOutcome = 'ACTIVATED' | 'PENDING_APPROVAL' | 'ALREADY' | 'INVITE_SENT';
export type ActivateResult =
  | { ok: true; outcome: ActivateOutcome }
  | { ok: false; error: string };

const PAYMENT_COLS =
  'payment_id, paystack_reference, user_id, email, purpose, product_id, programme_id, cohort_id, enrolment_id, status';

// Purposes that grant a bank/readiness subscription (vs programme enrolment).
const BANK_PURPOSES = ['BANK_PURCHASE', 'READINESS_PURCHASE', 'BANK_OPTIN_AT_PROGRAMME'];

// Enrolment statuses that count as "already actively enrolled" — must
// match the partial unique indexes on nclex_enrolments.
const ACTIVE_ENROLMENT_STATUSES = ['PENDING_APPROVAL', 'ENROLLED', 'PAUSED'];

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

// Create the enrolment row from a PAID programme payment. Tutor-led →
// PENDING_APPROVAL (the tutor still approves before access unlocks);
// self-paced → ENROLLED at once. Idempotent: an existing active enrolment
// for this student+cohort (or student+programme, self-paced) is linked to
// the payment rather than re-created — never trap a paid buyer behind the
// active-enrolment guard. Returns `pending` so the caller can pick the
// ACTIVATED vs PENDING_APPROVAL outcome.
async function grantProgrammeEnrolment(
  admin: AdminClient,
  payment: PaymentRow,
  userId: string
): Promise<{ ok: true; pending: boolean } | { ok: false; error: string }> {
  if (!payment.programme_id) return { ok: false, error: 'Payment has no programme to enrol into.' };

  const { data: prog, error: progErr } = await admin
    .from('nclex_programmes')
    .select('programme_id, delivery_mode, access_window_days')
    .eq('programme_id', payment.programme_id)
    .maybeSingle();
  if (progErr || !prog) return { ok: false, error: 'Programme not found for activation.' };

  const isSelfPaced = prog.delivery_mode === 'SELF_PACED';
  const cohortId = isSelfPaced ? null : payment.cohort_id;
  if (!isSelfPaced && !cohortId) {
    return { ok: false, error: 'This programme payment has no cohort to enrol into.' };
  }

  const status = isSelfPaced ? 'ENROLLED' : 'PENDING_APPROVAL';
  const pending = !isSelfPaced;

  // Freeze the access-window expiry at enrolment time (NULL = lifetime-of-
  // tutor-sub). The nightly sweep reads this column.
  const accessExpiresAt =
    prog.access_window_days != null
      ? new Date(Date.now() + prog.access_window_days * 86_400_000).toISOString()
      : null;

  // Find an existing active enrolment (idempotent re-hit, or the buyer was
  // already enrolled). ≤1 by the partial unique indexes.
  const existingQuery = admin
    .from('nclex_enrolments')
    .select('enrolment_id, status')
    .eq('user_id', userId)
    .eq('programme_id', prog.programme_id)
    .in('status', ACTIVE_ENROLMENT_STATUSES);
  const { data: existing } = await (cohortId
    ? existingQuery.eq('cohort_id', cohortId)
    : existingQuery.is('cohort_id', null)
  ).limit(1);

  if (existing && existing.length > 0) {
    const row = existing[0];
    if (payment.enrolment_id !== row.enrolment_id) {
      await admin
        .from('nclex_payments')
        .update({ enrolment_id: row.enrolment_id })
        .eq('payment_id', payment.payment_id);
    }
    return { ok: true, pending: row.status === 'PENDING_APPROVAL' };
  }

  const { data: inserted, error: insErr } = await admin
    .from('nclex_enrolments')
    .insert({
      user_id: userId,
      programme_id: prog.programme_id,
      cohort_id: cohortId,
      status,
      enrolment_source: 'SELF_PAID',
      access_expires_at: accessExpiresAt,
    })
    .select('enrolment_id')
    .single();

  if (insErr || !inserted) {
    // A concurrent activation already inserted the one allowed active row.
    if (insErr?.code === '23505') {
      const reread = admin
        .from('nclex_enrolments')
        .select('enrolment_id, status')
        .eq('user_id', userId)
        .eq('programme_id', prog.programme_id)
        .in('status', ACTIVE_ENROLMENT_STATUSES);
      const { data: again } = await (cohortId
        ? reread.eq('cohort_id', cohortId)
        : reread.is('cohort_id', null)
      ).limit(1);
      if (again && again.length > 0) {
        await admin
          .from('nclex_payments')
          .update({ enrolment_id: again[0].enrolment_id })
          .eq('payment_id', payment.payment_id);
        return { ok: true, pending: again[0].status === 'PENDING_APPROVAL' };
      }
    }
    return { ok: false, error: insErr?.message ?? 'Could not create the enrolment.' };
  }

  await admin
    .from('nclex_payments')
    .update({ enrolment_id: inserted.enrolment_id })
    .eq('payment_id', payment.payment_id);
  return { ok: true, pending };
}

async function activatePaymentRow(admin: AdminClient, payment: PaymentRow): Promise<ActivateResult> {
  if (payment.status === 'ACTIVATED') return { ok: true, outcome: 'ALREADY' };
  if (payment.status !== 'PAID' && payment.status !== 'SETUP_REQUIRED') {
    return { ok: false, error: 'Payment is not in a state that can be activated.' };
  }

  const isBank = BANK_PURPOSES.includes(payment.purpose);
  const isProgramme = payment.purpose === 'PROGRAMME_INITIAL';
  if (!isBank && !isProgramme) {
    // PROGRAMME_INSTALLMENT activation arrives with the strategies slice (7).
    return { ok: false, error: 'This payment type is not handled yet.' };
  }

  const userId = payment.user_id ?? (await findProfileIdByEmail(admin, payment.email));

  // Buyer has a profile → grant now.
  if (userId) {
    let outcome: ActivateOutcome = 'ACTIVATED';
    if (isBank) {
      const grant = await grantBankSubscription(admin, payment, userId);
      if (!grant.ok) return { ok: false, error: grant.error };
    } else {
      const grant = await grantProgrammeEnrolment(admin, payment, userId);
      if (!grant.ok) return { ok: false, error: grant.error };
      outcome = grant.pending ? 'PENDING_APPROVAL' : 'ACTIVATED';
    }
    await admin
      .from('nclex_payments')
      .update({ status: 'ACTIVATED', activated_at: new Date().toISOString(), user_id: userId })
      .eq('payment_id', payment.payment_id);
    return { ok: true, outcome };
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
