// mynclex/lib/payments/init.ts
//
// "Start a payment." Resolves what's being bought into one or more line
// items, writes them as INIT rows in nclex_payments BEFORE any money moves
// (so even abandoned attempts leave a trace), then asks Paystack to begin a
// single charge for the combined total and returns the redirect link.
//
// An order is normally one line (a bank pack, or a programme). Programme
// checkout may add a SECOND line — the bank opt-in (5.4b) — and both share
// one checkout_group_id + one Paystack reference, so the student pays once.
// Each line stays its own purpose row (clean ledger); verify/activate later
// operate on the whole group.
//
// Writes via the service role: nclex_payments has no authenticated write
// policy by design — only this server path writes it.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { paystackInitialize } from './paystack';
import type { StartPaymentInput, StartPaymentResult, PaymentPurpose, Currency } from './types';

type AdminClient = ReturnType<typeof createServiceRoleClient>;

type LineItem = {
  purpose: PaymentPurpose;
  productId: string | null;
  programmeId: string | null;
  cohortId: string | null;
  strategyId: string | null;
  amountMinor: number;
  label: string;
};

function makeReference(): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  return `MNX_${rand}`;
}

// The bank opt-in discount, read from the runtime config table (single
// source of truth — retunable without a redeploy). Returns a fraction in
// [0,1); null if the key is missing or malformed (caller treats that as
// "opt-in unavailable" rather than guessing a price).
async function readBankOptinDiscount(admin: AdminClient): Promise<number | null> {
  const { data } = await admin
    .from('nclex_config')
    .select('value')
    .eq('key', 'bank_optin_discount')
    .maybeSingle();
  if (!data) return null;
  const n = Number(data.value);
  if (!Number.isFinite(n) || n < 0 || n >= 1) return null;
  return n;
}

export async function startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email is required.' };

  const admin = createServiceRoleClient();

  const items: LineItem[] = [];
  let currency: Currency;

  if (input.target.kind === 'BANK') {
    const { data: product, error } = await admin
      .from('nclex_products')
      .select('product_id, name, pack_type, price_minor_ghs, price_minor_usd, status')
      .eq('product_id', input.target.productId)
      .maybeSingle();
    if (error || !product) return { ok: false, error: 'Product not found.' };
    if (product.status !== 'ACTIVE') return { ok: false, error: 'This product is not available.' };

    currency = input.target.currency;
    items.push({
      purpose: product.pack_type === 'READINESS' ? 'READINESS_PURCHASE' : 'BANK_PURCHASE',
      productId: product.product_id,
      programmeId: null,
      cohortId: null,
      strategyId: null,
      amountMinor: currency === 'GHS' ? product.price_minor_ghs : product.price_minor_usd,
      label: product.name,
    });
  } else {
    const { data: prog, error } = await admin
      .from('nclex_programmes')
      .select('programme_id, title, price_minor, price_currency, payment_collection_mode, delivery_mode, status')
      .eq('programme_id', input.target.programmeId)
      .maybeSingle();
    if (error || !prog) return { ok: false, error: 'Programme not found.' };
    if (prog.status !== 'PUBLISHED') return { ok: false, error: 'This programme is not open for enrolment.' };
    if (prog.payment_collection_mode !== 'ON_PLATFORM') {
      return { ok: false, error: 'This programme does not accept online payment.' };
    }

    currency = prog.price_currency as Currency;

    // Tutor-led requires a valid, joinable cohort that belongs to this
    // programme; self-paced has none (cohort stays NULL).
    let cohortId: string | null = null;
    if (prog.delivery_mode !== 'SELF_PACED') {
      const reqCohort = input.target.cohortId ?? null;
      if (!reqCohort) return { ok: false, error: 'Please choose a cohort to join.' };

      const { data: cohort } = await admin
        .from('nclex_cohorts')
        .select('cohort_id, programme_id, cancelled_at, start_date, allow_late_join')
        .eq('cohort_id', reqCohort)
        .maybeSingle();
      if (!cohort || cohort.programme_id !== prog.programme_id) {
        return { ok: false, error: 'That cohort is not available.' };
      }
      const today = new Date().toISOString().slice(0, 10);
      const joinable =
        cohort.cancelled_at == null &&
        (cohort.start_date >= today || cohort.allow_late_join);
      if (!joinable) return { ok: false, error: 'That cohort is no longer open to join.' };
      cohortId = cohort.cohort_id;
    }

    // Resolve the chosen payment plan (Slice 7c). The initial charge is the
    // plan's initial_price_minor (full / deposit / installment 1), looked up
    // server-side so the browser can't set the amount. A missing strategyId
    // falls back to the programme's full price (upfront), strategy_id NULL.
    let initialAmount = prog.price_minor;
    let strategyId: string | null = null;
    if (input.target.strategyId) {
      const { data: strategy } = await admin
        .from('nclex_programme_payment_strategies')
        .select('strategy_id, programme_id, initial_price_minor, is_active')
        .eq('strategy_id', input.target.strategyId)
        .maybeSingle();
      if (
        !strategy ||
        strategy.programme_id !== prog.programme_id ||
        !strategy.is_active
      ) {
        return { ok: false, error: 'That payment plan is not available.' };
      }
      initialAmount = strategy.initial_price_minor;
      strategyId = strategy.strategy_id;
    }

    items.push({
      purpose: 'PROGRAMME_INITIAL',
      productId: null,
      programmeId: prog.programme_id,
      cohortId,
      strategyId,
      amountMinor: initialAmount,
      label: prog.title,
    });

    // Bank opt-in (5.4b): a second line on the same charge, in the
    // programme's currency, at the configured discount off the standalone
    // bank price. Only paid BANK_DURATION tiers are opt-in-eligible.
    if (input.target.bankOptIn) {
      const { data: bank, error: bankErr } = await admin
        .from('nclex_products')
        .select('product_id, name, kind, pack_type, price_minor_ghs, price_minor_usd, status')
        .eq('product_id', input.target.bankOptIn.productId)
        .maybeSingle();
      if (bankErr || !bank) return { ok: false, error: 'Bank add-on not found.' };
      if (bank.status !== 'ACTIVE' || bank.kind !== 'PAID' || bank.pack_type !== 'BANK_DURATION') {
        return { ok: false, error: 'That bank add-on is not available.' };
      }

      const discount = await readBankOptinDiscount(admin);
      if (discount == null) return { ok: false, error: 'The bank add-on is temporarily unavailable.' };

      const standalone = currency === 'GHS' ? bank.price_minor_ghs : bank.price_minor_usd;
      const discounted = Math.round(standalone * (1 - discount));
      if (!discounted || discounted <= 0) {
        return { ok: false, error: 'That bank add-on has no payable price.' };
      }

      items.push({
        purpose: 'BANK_OPTIN_AT_PROGRAMME',
        productId: bank.product_id,
        programmeId: null,
        cohortId: null,
        strategyId: null,
        amountMinor: discounted,
        label: bank.name,
      });
    }
  }

  const totalAmount = items.reduce((sum, it) => sum + it.amountMinor, 0);
  if (items.some((it) => !it.amountMinor || it.amountMinor <= 0) || totalAmount <= 0) {
    return { ok: false, error: 'This order has no payable price.' };
  }

  const reference = makeReference();
  const checkoutGroupId = crypto.randomUUID();

  const { error: insErr } = await admin.from('nclex_payments').insert(
    items.map((it) => ({
      paystack_reference: reference,
      checkout_group_id: checkoutGroupId,
      user_id: input.userId ?? null,
      email,
      purpose: it.purpose,
      product_id: it.productId,
      programme_id: it.programmeId,
      cohort_id: it.cohortId,
      strategy_id: it.strategyId,
      currency,
      amount_minor: it.amountMinor,
      status: 'INIT',
    }))
  );
  if (insErr) {
    console.error('nclex_payments INIT insert failed:', insErr.message);
    return { ok: false, error: 'Could not start payment. Please try again.' };
  }

  try {
    const init = await paystackInitialize({
      email,
      amountMinor: totalAmount,
      currency,
      reference,
      callbackUrl: `${input.baseUrl}/checkout/callback`,
      metadata: {
        checkout_group_id: checkoutGroupId,
        items: items.map((it) => ({ purpose: it.purpose, label: it.label, amount_minor: it.amountMinor })),
      },
    });

    await admin
      .from('nclex_payments')
      .update({ paystack_payload_json: { init } })
      .eq('checkout_group_id', checkoutGroupId);

    return { ok: true, reference, authorizationUrl: init.data.authorization_url };
  } catch (e) {
    await admin
      .from('nclex_payments')
      .update({ status: 'FAILED', paystack_payload_json: { init_error: (e as Error).message } })
      .eq('checkout_group_id', checkoutGroupId);
    return { ok: false, error: 'The payment provider could not start this transaction.' };
  }
}
