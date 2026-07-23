// mynclex/lib/payments/activate.ts
//
// Turns a PAID payment into actual access:
//   • Product purposes (BANK_PURCHASE, READINESS_PURCHASE,
//     BANK_OPTIN_AT_PROGRAMME) → grantProductEntitlement, which grants
//     whatever the product confers (readiness-packs.md §7): a bank-time
//     nclex_subscriptions row (bank passes only) AND/OR readiness credit
//     rows (any product whose readiness_credits > 0). A readiness
//     purchase writes NO subscription — just its credits; a longer bank
//     pass writes a subscription AND its bundled credits.
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
import { buildSchedule, isOverdue } from './schedule';
import { planActivationGrants } from './readiness-mint';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';

type AdminClient = ReturnType<typeof createServiceRoleClient>;

type PaymentRow = {
  payment_id: string;
  paystack_reference: string | null;
  checkout_group_id: string;
  user_id: string | null;
  email: string;
  purpose: string;
  product_id: string | null;
  programme_id: string | null;
  cohort_id: string | null;
  strategy_id: string | null;
  enrolment_id: string | null;
  status: string;
};

export type ActivateOutcome = 'ACTIVATED' | 'PENDING_APPROVAL' | 'ALREADY' | 'INVITE_SENT';
export type ActivateResult =
  | { ok: true; outcome: ActivateOutcome }
  | { ok: false; error: string };

const PAYMENT_COLS =
  'payment_id, paystack_reference, checkout_group_id, user_id, email, purpose, product_id, programme_id, cohort_id, strategy_id, enrolment_id, status';

// Purposes that buy a catalogue PRODUCT (vs a programme enrolment /
// installment). All three carry a product_id and route to
// grantProductEntitlement; whether that grants a subscription, credits,
// or both is decided from the product (planActivationGrants), not from
// this list — so READINESS_PURCHASE belongs here (it must be handled and
// minted) yet grants no subscription, its pack_type isn't BANK_DURATION.
const PRODUCT_PURPOSES = ['BANK_PURCHASE', 'READINESS_PURCHASE', 'BANK_OPTIN_AT_PROGRAMME'];

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

type ActivatableProductRow = {
  product_id: string;
  pack_type: 'BANK_DURATION' | 'READINESS';
  duration_days: number | null;
  readiness_credits: number;
  cat_allowance: number | null;  // §15.5 — snapshotted onto the subscription
};

// Insert the bank-time subscription row. Idempotent: one per payment
// (unique index on payment_id). Bank passes only — the caller decides
// via planActivationGrants, so a readiness product never reaches here.
async function insertBankSubscriptionOnce(
  admin: AdminClient,
  payment: PaymentRow,
  userId: string,
  product: ActivatableProductRow
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

  // Duration packs run for duration_days from now. (Only BANK_DURATION
  // reaches here, so end_at is always set for a real pass; the guard
  // keeps a 0/NULL-duration row from computing a bogus date.)
  const endAt =
    product.duration_days != null
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
    // §15.5 snapshot — freeze the product's CAT allowance onto the grant so a
    // later catalogue edit never changes what an existing buyer holds. NULL =
    // unlimited (the default, and what every past subscription carries). The
    // create_cat_attempt guard + the CAT-home count read this column.
    cat_allowance: product.cat_allowance,
  });
  if (insErr) {
    // A concurrent activation already inserted the one allowed row
    // (unique index on payment_id) — that's success, not a failure.
    if (insErr.code === '23505') return { ok: true };
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}

// Mint the readiness credits this activation grants — `count` rows, each
// tagged `source`. Idempotent per payment via UNIQUE(payment_id,
// mint_index): a repeat / concurrent activation's batch insert conflicts
// on mint_index 1, rolls back atomically, and is treated as success.
//
// The count comes straight from the product's readiness_credits and is
// NEVER keyed on pack_type — bundled bank-pass credits ride this same
// path. The pack_type-derived facts (whether a subscription is granted,
// and the source tag) are settled by planActivationGrants; see
// readiness-mint.ts for why this matters.
async function mintReadinessCreditsOnce(
  admin: AdminClient,
  payment: PaymentRow,
  userId: string,
  count: number,
  source: 'BANK_BUNDLE' | 'SELF_PURCHASE'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = Array.from({ length: count }, (_, i) => ({
    user_id: userId,
    source,
    payment_id: payment.payment_id,
    mint_index: i + 1,
  }));

  const { error } = await admin.from('nclex_readiness_credits').insert(rows);
  if (error) {
    // Already minted by a concurrent / repeat activation (unique index
    // on payment_id + mint_index) — success, not a failure.
    if (error.code === '23505') return { ok: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Grant everything activating a catalogue product confers: a bank-time
// subscription (bank passes) and/or readiness credits (any product whose
// readiness_credits > 0). Both idempotent per payment, so a double
// activation is safe. A readiness purchase falls through with NO
// subscription (its pack_type isn't BANK_DURATION) but DOES mint credits;
// a bank pass writes a subscription AND any bundled credits.
async function grantProductEntitlement(
  admin: AdminClient,
  payment: PaymentRow,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!payment.product_id) return { ok: false, error: 'Payment has no product to grant.' };

  const { data: product, error: prodErr } = await admin
    .from('nclex_products')
    .select('product_id, pack_type, duration_days, readiness_credits, cat_allowance')
    .eq('product_id', payment.product_id)
    .maybeSingle();
  if (prodErr || !product) return { ok: false, error: 'Product not found for activation.' };

  const row = product as ActivatableProductRow;
  const plan = planActivationGrants(row);

  if (plan.subscription) {
    const r = await insertBankSubscriptionOnce(admin, payment, userId, row);
    if (!r.ok) return r;
  }
  if (plan.creditCount > 0 && plan.creditSource) {
    const r = await mintReadinessCreditsOnce(admin, payment, userId, plan.creditCount, plan.creditSource);
    if (!r.ok) return r;
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

  // Freeze the chosen plan onto the enrolment (Slice 7c). The snapshot is
  // what 7d reads to compute due-dates, so a later tutor edit to the plan
  // can't rewrite this student's schedule. Null for legacy upfront (no
  // strategy on the payment).
  let strategySnapshot: Record<string, unknown> | null = null;
  if (payment.strategy_id) {
    const { data: strat } = await admin
      .from('nclex_programme_payment_strategies')
      .select(
        `strategy_id, kind, label, total_price_minor, initial_price_minor,
         installment_count, installment_interval_days,
         balance_due_days_after_enrolment`
      )
      .eq('strategy_id', payment.strategy_id)
      .maybeSingle();
    if (strat) strategySnapshot = { ...strat, frozen_at: new Date().toISOString() };
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
      strategy_id: payment.strategy_id,
      strategy_snapshot_json: strategySnapshot,
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

// Record a later installment / balance payment against an existing enrolment
// (Slice 7d). The payment row already links to the enrolment (set at INIT) and
// is flipped to ACTIVATED by the caller. The only side-effect here is the
// auto-unpause: if the student was paused for an overdue installment and this
// payment brings them back in line, lift the pause. A TUTOR_MANUAL pause is
// never auto-lifted — that stays the tutor's decision. The write is a direct
// service-role UPDATE (the auth-gated unpause RPC can't run with no session);
// activation has already validated ownership, mirroring the handoff's
// "service-role writes validate the same transition" rule.
async function grantInstallmentPayment(
  admin: AdminClient,
  payment: PaymentRow,
  userId: string
): Promise<{ ok: true; pending: boolean } | { ok: false; error: string }> {
  if (!payment.enrolment_id) {
    return { ok: false, error: 'Installment payment has no enrolment to apply to.' };
  }

  const { data: enr, error } = await admin
    .from('nclex_enrolments')
    .select('enrolment_id, user_id, status, paused_reason, strategy_snapshot_json, enrolled_at')
    .eq('enrolment_id', payment.enrolment_id)
    .maybeSingle();
  if (error || !enr) return { ok: false, error: 'Enrolment not found for installment activation.' };
  if (enr.user_id !== userId) {
    return { ok: false, error: 'Installment does not belong to this account.' };
  }

  if (enr.status === 'PAUSED' && enr.paused_reason === 'INSTALLMENT_OVERDUE') {
    const snapshot = enr.strategy_snapshot_json as FrozenStrategySnapshot | null;
    if (snapshot) {
      // This row is already PAID at activation time, so the PAID+ACTIVATED
      // count includes it.
      const { count } = await admin
        .from('nclex_payments')
        .select('payment_id', { count: 'exact', head: true })
        .eq('enrolment_id', enr.enrolment_id)
        .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'])
        .in('status', ['PAID', 'ACTIVATED']);
      const schedule = buildSchedule(snapshot, new Date(enr.enrolled_at), count ?? 0);
      if (!isOverdue(schedule, new Date())) {
        await admin
          .from('nclex_enrolments')
          .update({
            status: 'ENROLLED',
            paused_at: null,
            paused_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq('enrolment_id', enr.enrolment_id);
      }
    }
  }

  return { ok: true, pending: false };
}

// Grant one PAID/SETUP_REQUIRED row, given an already-resolved account, and
// mark it ACTIVATED. Identity + the pay-first invite are handled once at the
// group level (activateGroup), so this only does the entitlement grant.
async function grantAndActivateRow(
  admin: AdminClient,
  payment: PaymentRow,
  userId: string
): Promise<{ ok: true; pending: boolean } | { ok: false; error: string }> {
  const isProduct = PRODUCT_PURPOSES.includes(payment.purpose);
  const isProgrammeInitial = payment.purpose === 'PROGRAMME_INITIAL';
  const isInstallment = payment.purpose === 'PROGRAMME_INSTALLMENT';
  if (!isProduct && !isProgrammeInitial && !isInstallment) {
    return { ok: false, error: 'This payment type is not handled yet.' };
  }

  let pending = false;
  if (isProduct) {
    const grant = await grantProductEntitlement(admin, payment, userId);
    if (!grant.ok) return { ok: false, error: grant.error };
  } else if (isInstallment) {
    const grant = await grantInstallmentPayment(admin, payment, userId);
    if (!grant.ok) return { ok: false, error: grant.error };
  } else {
    const grant = await grantProgrammeEnrolment(admin, payment, userId);
    if (!grant.ok) return { ok: false, error: grant.error };
    pending = grant.pending;
  }

  await admin
    .from('nclex_payments')
    .update({ status: 'ACTIVATED', activated_at: new Date().toISOString(), user_id: userId })
    .eq('payment_id', payment.payment_id);
  return { ok: true, pending };
}

// Activate a whole checkout group (1+ rows sharing one charge). Identity is
// resolved ONCE here, and the pay-first invite fires ONCE for the group
// (not per row). Combined-order outcome precedence:
//   INVITE_SENT (guest must finish setup) > PENDING_APPROVAL (programme
//   needs the tutor) > ACTIVATED > ALREADY.
async function activateGroup(admin: AdminClient, rows: PaymentRow[]): Promise<ActivateResult> {
  if (rows.length === 0) return { ok: false, error: 'Payment not found.' };

  const activatable = rows.filter((r) => r.status === 'PAID' || r.status === 'SETUP_REQUIRED');
  if (activatable.length === 0) {
    if (rows.every((r) => r.status === 'ACTIVATED')) return { ok: true, outcome: 'ALREADY' };
    return { ok: false, error: 'Payment is not in a state that can be activated.' };
  }

  const email = rows[0].email;
  const userId = rows.find((r) => r.user_id)?.user_id ?? (await findProfileIdByEmail(admin, email));

  // Pay-first guest: no account yet.
  if (!userId) {
    // Already invited on a prior pass → just wait for /welcome.
    if (rows.some((r) => r.status === 'SETUP_REQUIRED')) return { ok: true, outcome: 'INVITE_SENT' };

    // First time: one invite for the whole group. The profile + grants
    // happen when they finish /welcome (no name yet, so no profile here).
    const h = await headers();
    const origin = h.get('origin') ?? 'http://localhost:3000';
    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/welcome`,
    });
    if (inviteErr || !invite?.user) {
      console.error('Pay-first invite failed:', inviteErr?.message);
      return {
        ok: false,
        error: 'Payment recorded, but we could not send the setup email. Please contact support.',
      };
    }
    // Mark the group "awaiting setup". We deliberately do NOT link user_id
    // here: the invited account exists in auth.users but has no nclex_users
    // profile row yet (that's created at /welcome), and nclex_payments.user_id
    // FKs to nclex_users — so writing it now violates the FK and the whole
    // update is rejected. The user_id link is set when /welcome runs
    // activateGroup → grantAndActivateRow against the real profile (it resolves
    // the buyer by email and stamps user_id on the ACTIVATED row). Surfacing
    // the error rather than swallowing it: the invite is already out and
    // /welcome re-matches the still-PAID row by email, so this is non-fatal,
    // but we log it so a real failure doesn't go unnoticed.
    const { error: updErr } = await admin
      .from('nclex_payments')
      .update({ status: 'SETUP_REQUIRED' })
      .eq('checkout_group_id', rows[0].checkout_group_id);
    if (updErr) console.error('Pay-first SETUP_REQUIRED update failed:', updErr.message);
    return { ok: true, outcome: 'INVITE_SENT' };
  }

  // Buyer has a profile → grant each row now.
  let anyPending = false;
  for (const row of activatable) {
    const g = await grantAndActivateRow(admin, row, userId);
    if (!g.ok) return { ok: false, error: g.error };
    if (g.pending) anyPending = true;
  }
  return { ok: true, outcome: anyPending ? 'PENDING_APPROVAL' : 'ACTIVATED' };
}

// Used by the callback page (via settlePayment). The reference identifies
// the whole charge group.
export async function activatePaymentByReference(reference: string): Promise<ActivateResult> {
  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from('nclex_payments')
    .select(PAYMENT_COLS)
    .eq('paystack_reference', reference);
  if (error || !rows?.length) return { ok: false, error: 'Payment not found.' };
  return activateGroup(admin, rows as PaymentRow[]);
}

// Used by /welcome after the profile + STUDENT role exist: grant any
// paid-but-not-activated payments for this email, group by group.
export async function activatePendingForEmail(email: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: payments } = await admin
    .from('nclex_payments')
    .select(PAYMENT_COLS)
    .ilike('email', email.trim().toLowerCase())
    .in('status', ['PAID', 'SETUP_REQUIRED']);
  if (!payments?.length) return;

  const groups = new Map<string, PaymentRow[]>();
  for (const p of payments as PaymentRow[]) {
    const g = groups.get(p.checkout_group_id) ?? [];
    g.push(p);
    groups.set(p.checkout_group_id, g);
  }

  for (const [groupId, rows] of groups) {
    const r = await activateGroup(admin, rows);
    if (!r.ok) console.error('activatePendingForEmail failed for group', groupId, r.error);
  }
}
