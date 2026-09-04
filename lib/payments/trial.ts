// mynclex/lib/payments/trial.ts
//
// Starting the free 7-day bank trial (2026-09-04). Slice 3 of 6.
//
// ⭐ THIS FILE IS DELIBERATELY SMALL, and that is the whole design.
// A trial is an ORDER THAT COST NOTHING, so it rides the machinery that
// already exists rather than a path of its own:
//
//   write a ₵0 BANK_TRIAL order, already PAID  →  activatePendingForEmail()
//
// and the engine does the rest. activateGroup() already branches on
// whether an account exists for the email:
//   • account exists → grants immediately, marks ACTIVATED, receipt sent
//   • no account     → mints the /welcome link, marks SETUP_REQUIRED,
//                      receipt carries the link
// which is exactly the two arrivals a trial has. Nothing here re-implements
// either. The expiry, the CAT-allowance snapshot and the idempotency all
// come from the same code that grants a paid pass — see the `source`
// ternary in activate.ts, which is the trial's entire grant.
//
// ⚠ THE TRIAL NEVER REACHES PAYSTACK. The row is written already PAID
// with collection_channel 'NONE' — no INIT, no reference, no verify step.
// 'NONE' means "nothing was collected, by design", distinct from
// OFF_PLATFORM which asserts money WAS collected, just not by us.
//
// The database holds the real guard (two partial unique indexes, migration
// 20260924120000). The checks below exist to give a PERSON a sentence
// instead of a constraint violation — they are the UX layer, never the
// security one, per the layered-enforcement rule.

import 'server-only';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { activatePendingForEmail } from './activate';
import { bankAccessForUser } from './entitlements';

export type StartTrialOutcome =
  /** Granted on the spot — the caller already had an account. */
  | 'ACTIVATED'
  /** Order written; the setup link is on its way by email. */
  | 'SETUP_REQUIRED'
  /** A trial order already existed for this address and is still unclaimed. */
  | 'ALREADY_SENT';

export type StartTrialResult =
  | { ok: true; outcome: StartTrialOutcome }
  | {
      ok: false;
      reason:
        | 'no_trial_product'
        | 'already_used'
        | 'already_has_access'
        | 'invalid_email'
        | 'error';
      error?: string;
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the trial page should show a signed-in visitor before they act. */
export type TrialState =
  | 'ELIGIBLE'
  | 'ALREADY_USED'
  | 'ALREADY_HAS_ACCESS'
  | 'NO_TRIAL_PRODUCT';

type AdminClient = ReturnType<typeof createServiceRoleClient>;

/** The live trial product, or null when the catalogue holds none. */
async function readTrialProduct(admin: AdminClient) {
  // Read by KIND, never by a hardcoded 'NCLEX_TRIAL' slug: the admin
  // Products page can retire one trial and create another (the catalogue
  // allows exactly one at a time, idx_nclex_products_single_trial), and
  // this must follow whichever is live rather than a slug frozen here.
  const { data } = await admin
    .from('nclex_products')
    .select('product_id, name, duration_days, cat_allowance')
    .eq('kind', 'TRIAL')
    .eq('status', 'ACTIVE')
    .maybeSingle();
  return data;
}

/**
 * ⚠ Named .eq('user_id') rather than leaning on RLS. nclex_subscriptions is
 * readable by more than its owner (the admin FOR ALL policy), so an unscoped
 * read here would answer for the wrong person the first time an admin opened
 * this page — the RLS-floor rule.
 */
async function hasSpentTrial(admin: AdminClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('nclex_subscriptions')
    .select('subscription_id')
    .eq('user_id', userId)
    .eq('source', 'SELF_TRIAL_SIGNUP')
    .limit(1);
  return !!data && data.length > 0;
}

/**
 * Where the signed-in visitor stands. UX only — `startTrial` re-checks
 * everything and the database holds the real guard. A logged-out visitor is
 * always ELIGIBLE here: the address they will type is the thing that decides,
 * and we do not know it yet.
 */
export async function trialStateForViewer(): Promise<{
  state: TrialState;
  trialDays: number | null;
}> {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();

  const admin = createServiceRoleClient();
  const product = await readTrialProduct(admin);
  if (!product) return { state: 'NO_TRIAL_PRODUCT', trialDays: null };

  const trialDays = product.duration_days ?? null;
  if (!user) return { state: 'ELIGIBLE', trialDays };

  if (await hasSpentTrial(admin, user.id)) return { state: 'ALREADY_USED', trialDays };

  const access = await bankAccessForUser(ssr, user.id);
  if (access.active) return { state: 'ALREADY_HAS_ACCESS', trialDays };

  return { state: 'ELIGIBLE', trialDays };
}

/**
 * Start a trial for `emailInput`, or for the signed-in caller.
 *
 * ⓘ A signed-in caller's OWN email always wins over whatever was typed.
 * Otherwise someone with an account could spend a stranger's trial, or
 * their own a second time under another address.
 */
export async function startTrial(emailInput: string): Promise<StartTrialResult> {
  const ssr = await createClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();

  const email = (user?.email ?? emailInput ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return { ok: false, reason: 'invalid_email' };

  const admin = createServiceRoleClient();

  const product = await readTrialProduct(admin);
  if (!product) return { ok: false, reason: 'no_trial_product' };

  // ── Eligibility, for the signed-in caller ────────────────────────────
  // The same two questions trialStateForViewer answers for the page. Asked
  // again here because that answer was advisory and this one decides.
  if (user) {
    if (await hasSpentTrial(admin, user.id)) return { ok: false, reason: 'already_used' };

    // Holding a paid pass already: a trial would stack seven days onto time
    // they bought, which spends their one trial to give them nothing they
    // did not have. Refuse and keep it for later.
    const access = await bankAccessForUser(ssr, user.id);
    if (access.active) return { ok: false, reason: 'already_has_access' };
  }

  // ── Eligibility, by address ──────────────────────────────────────────
  // Mirrors idx_nclex_payments_one_trial_per_email. An unclaimed order is
  // not a refusal — it is the same person asking again because the email
  // did not arrive, so re-run activation (which re-queues the receipt if
  // none was ever queued) and tell them it is on its way.
  const { data: priorOrder } = await admin
    .from('nclex_payments')
    .select('payment_id, status')
    .eq('purpose', 'BANK_TRIAL')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (priorOrder) {
    if (priorOrder.status === 'SETUP_REQUIRED') {
      // Re-run activation. Two things can happen, and which one is not ours
      // to guess: if the account now EXISTS (they finished /welcome, or made
      // one another way since), this grants on the spot; if it still does
      // not, it re-queues the setup email and nothing else.
      await activatePendingForEmail(email);

      // ⭐ So ask the database what actually happened rather than assuming.
      // Telling someone to "check your email" when they are signed in and
      // just been granted is a dead end — the pass is already theirs.
      //
      // ⚠ This is also the ONLY route back for an order that was written
      // but never granted. /welcome calls activation once and is a one-time
      // link, so before this branch a failure there stranded the order with
      // no way to retry — which is exactly what a missing purpose in
      // PRODUCT_PURPOSES did on 2026-09-04.
      if (user && (await hasSpentTrial(admin, user.id))) {
        return { ok: true, outcome: 'ACTIVATED' };
      }
      return { ok: true, outcome: 'ALREADY_SENT' };
    }
    return { ok: false, reason: 'already_used' };
  }

  // ── The order ────────────────────────────────────────────────────────
  // ⚠ Written straight to PAID. Every other purpose starts INIT and is
  // flipped by verify.ts when Paystack confirms; there is no Paystack here,
  // so the row is born in the state activation looks for.
  //
  // ⓘ currency is NOT NULL and a free pass has none — GHS at zero is the
  // arbitrary-but-harmless choice. Nothing renders it: the receipt's money
  // block prints 0.00, which is true in either currency.
  const nowIso = new Date().toISOString();
  const { error: insErr } = await admin.from('nclex_payments').insert({
    email,
    user_id: user?.id ?? null,
    purpose: 'BANK_TRIAL',
    product_id: product.product_id,
    currency: 'GHS',
    amount_minor: 0,
    status: 'PAID',
    collection_channel: 'NONE',
    paid_at: nowIso,
  });

  if (insErr) {
    // 23505 = the one-trial-per-email index. Someone double-clicked, or
    // two tabs raced. The guard did its job; say what it means.
    if (insErr.code === '23505') return { ok: false, reason: 'already_used' };
    console.error('Trial order insert failed:', insErr.message);
    return { ok: false, reason: 'error', error: insErr.message };
  }

  // ── Hand off to the engine ───────────────────────────────────────────
  // Grants + receipt + (for a guest) the /welcome link. Idempotent: the
  // subscription's unique index on payment_id means a repeat pass grants
  // exactly once.
  await activatePendingForEmail(email);

  return { ok: true, outcome: user ? 'ACTIVATED' : 'SETUP_REQUIRED' };
}
