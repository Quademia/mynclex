// mynclex/lib/payments/init.ts
//
// "Start a payment." Resolves what's being bought into an amount +
// currency + purpose, writes an INIT row in nclex_payments BEFORE any
// money moves (so even abandoned attempts leave a trace), then asks
// Paystack to begin and returns the redirect link.
//
// Writes via the service role: nclex_payments has no authenticated write
// policy by design — only this server path writes it.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { paystackInitialize } from './paystack';
import type { StartPaymentInput, StartPaymentResult, PaymentPurpose, Currency } from './types';

function makeReference(): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  return `MNX_${rand}`;
}

export async function startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email is required.' };

  const admin = createServiceRoleClient();

  let purpose: PaymentPurpose;
  let currency: Currency;
  let amountMinor: number;
  let productId: string | null = null;
  let programmeId: string | null = null;
  let cohortId: string | null = null;
  let label: string;

  if (input.target.kind === 'BANK') {
    const { data: product, error } = await admin
      .from('nclex_products')
      .select('product_id, name, pack_type, price_minor_ghs, price_minor_usd, status')
      .eq('product_id', input.target.productId)
      .maybeSingle();
    if (error || !product) return { ok: false, error: 'Product not found.' };
    if (product.status !== 'ACTIVE') return { ok: false, error: 'This product is not available.' };

    currency = input.target.currency;
    amountMinor = currency === 'GHS' ? product.price_minor_ghs : product.price_minor_usd;
    purpose = product.pack_type === 'READINESS' ? 'READINESS_PURCHASE' : 'BANK_PURCHASE';
    productId = product.product_id;
    label = product.name;
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

    // Tutor-led requires a valid, joinable cohort that belongs to this
    // programme; self-paced has none (cohort stays NULL).
    if (prog.delivery_mode === 'SELF_PACED') {
      cohortId = null;
    } else {
      const reqCohort = input.target.kind === 'PROGRAMME' ? input.target.cohortId : null;
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

    currency = prog.price_currency as Currency;
    amountMinor = prog.price_minor;
    purpose = 'PROGRAMME_INITIAL';
    programmeId = prog.programme_id;
    label = prog.title;
  }

  if (!amountMinor || amountMinor <= 0) {
    return { ok: false, error: 'This item has no payable price.' };
  }

  const reference = makeReference();

  const { error: insErr } = await admin.from('nclex_payments').insert({
    paystack_reference: reference,
    user_id: input.userId ?? null,
    email,
    purpose,
    product_id: productId,
    programme_id: programmeId,
    cohort_id: cohortId,
    currency,
    amount_minor: amountMinor,
    status: 'INIT',
  });
  if (insErr) {
    console.error('nclex_payments INIT insert failed:', insErr.message);
    return { ok: false, error: 'Could not start payment. Please try again.' };
  }

  try {
    const init = await paystackInitialize({
      email,
      amountMinor,
      currency,
      reference,
      callbackUrl: `${input.baseUrl}/checkout/callback`,
      metadata: { purpose, product_id: productId, programme_id: programmeId, label },
    });

    await admin
      .from('nclex_payments')
      .update({ paystack_payload_json: { init } })
      .eq('paystack_reference', reference);

    return { ok: true, reference, authorizationUrl: init.data.authorization_url };
  } catch (e) {
    await admin
      .from('nclex_payments')
      .update({ status: 'FAILED', paystack_payload_json: { init_error: (e as Error).message } })
      .eq('paystack_reference', reference);
    return { ok: false, error: 'The payment provider could not start this transaction.' };
  }
}
