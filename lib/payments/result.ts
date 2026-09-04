// mynclex/lib/payments/result.ts
//
// Read-only companion to settle.ts for the payment-result screen. settle.ts
// decides the OUTCOME of a charge (paid / pending / failed / invite-sent);
// this assembles the SUMMARY shown under that outcome — what was bought, how
// much, in what currency — plus a best-effort in-app destination ("go to your
// learning") and a retry target (re-open checkout on failure).
//
// Service-role read keyed by the Paystack reference, the SAME access pattern
// as verify/activate: nclex_payments has no authenticated read policy, and the
// buyer may be a pay-first guest with no session at all. The reference is the
// unguessable capability — only someone who completed this checkout has it.
// No migration — a read over existing tables.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatCohortName } from '@/lib/cohorts/format';
import { formatMinor } from '@/lib/products/money';
import { appOrigin } from '@/lib/email/templates/wrapper';
import { enqueueAndSend } from '@/lib/email/send';
import type { PaymentReceiptPayload, ReceiptFraming, ReceiptLineItem } from '@/lib/email/types';
import { buildSchedule } from './schedule';
import type { Currency, PaymentPurpose } from './types';
import type { StrategyKind, FrozenStrategySnapshot } from '@/lib/strategies/types';

export type ReceiptLine = {
  key: string;
  name: string;
  meta: string | null;
  amountMinor: number;
  // Added for the EMAILED receipt (2026-08-11): the screen groups by
  // eye, but the email has to label each line by kind. Additive — the
  // result screen ignores it.
  purpose: PaymentPurpose;
};

export type PaymentReceipt = {
  reference: string;
  email: string;
  currency: Currency;
  lines: ReceiptLine[];
  totalMinor: number;
  // Best-effort in-app destination for the "go to your learning" CTA — what
  // the buyer should open once access is live. Null when there's nothing to
  // deep-link to (an unrecognised purpose, or no resolvable target). The page
  // decides whether to actually show it (e.g. not for a guest who must finish
  // account setup first).
  destinationHref: string | null;
  destinationLabel: string | null;
  // Where "Try again" sends a failed buyer — back to the thing they were
  // buying (the programme detail / the bank store). Null when unknown.
  retryHref: string | null;
  // True when the order includes a tutor-led programme — so the screen can
  // tell a pay-first guest their tutor still has to approve their place once
  // they finish account setup (the "awaiting tutor" step they don't reach on
  // this screen, since a guest has no enrolment yet).
  isTutorLed: boolean;
  // True when the order is ONLY readiness pack credits (no bank pass, no
  // programme). The credits mint unclaimed; until the claim UI ships
  // (Slice ②b.2) the result screen must not promise "start practising" —
  // it says the credits are ready and the packs come next.
  isReadinessOnly: boolean;
};

type Row = {
  payment_id: string;
  email: string;
  purpose: PaymentPurpose;
  product_id: string | null;
  programme_id: string | null;
  cohort_id: string | null;
  strategy_id: string | null;
  installment_index: number | null;
  enrolment_id: string | null;
  currency: Currency;
  amount_minor: number;
  // Read for the emailed receipt. The screen doesn't need them: it is
  // being looked at now, by someone who just paid, so "when" and "how"
  // are self-evident. An email is read later and out of context.
  checkout_group_id: string;
  paystack_reference: string | null;
  user_id: string | null;
  paid_at: string | null;
  collection_channel: 'PAYSTACK' | 'OFF_PLATFORM' | null;
};

const ROW_COLS = `payment_id, email, purpose, product_id, programme_id, cohort_id,
   strategy_id, installment_index, enrolment_id, currency, amount_minor,
   checkout_group_id, paystack_reference, user_id, paid_at, collection_channel`;

// How many positions a plan has — mirrors schedule.ts positionsFor() without
// needing a frozen snapshot (the receipt only needs the count for "k of N").
function planTotalPayments(kind: StrategyKind, installmentCount: number | null): number {
  switch (kind) {
    case 'UPFRONT_FULL':
      return 1;
    case 'DEPOSIT_BALANCE':
      return 2;
    case 'EQUAL_INSTALLMENTS':
      return installmentCount ?? 1;
  }
}

const BANK_PURPOSES: PaymentPurpose[] = [
  'BANK_PURCHASE',
  'READINESS_PURCHASE',
  'BANK_OPTIN_AT_PROGRAMME',
  // A trial lands in the same place a bought pass does — the bank. Without
  // this the receipt's button falls through to no destination at all.
  'BANK_TRIAL',
];

export async function getPaymentReceipt(reference: string): Promise<PaymentReceipt | null> {
  const ref = reference.trim();
  if (!ref) return null;

  const admin = createServiceRoleClient();
  const { data: payRows } = await admin
    .from('nclex_payments')
    .select(ROW_COLS)
    .eq('paystack_reference', ref);
  const rows = (payRows ?? []) as Row[];
  if (rows.length === 0) return null;
  return assembleReceipt(rows, ref);
}

/**
 * The same receipt, found by CHECKOUT GROUP rather than by Paystack
 * reference.
 *
 * ⭐ Needed by the emailed receipt, because the reference is not always
 * there: a tutor recording money they collected themselves writes a
 * payment row with `paystack_reference: null` and a freshly minted
 * checkout_group_id. The group is the one identifier BOTH anchors have,
 * which is also why it is what the email is fingerprinted on.
 */
export async function getPaymentReceiptByGroup(
  checkoutGroupId: string
): Promise<PaymentReceipt | null> {
  const groupId = checkoutGroupId.trim();
  if (!groupId) return null;

  const admin = createServiceRoleClient();
  const { data: payRows } = await admin
    .from('nclex_payments')
    .select(ROW_COLS)
    .eq('checkout_group_id', groupId);
  const rows = (payRows ?? []) as Row[];
  if (rows.length === 0) return null;
  return assembleReceipt(rows, rows[0].paystack_reference ?? '');
}

async function assembleReceipt(rows: Row[], ref: string): Promise<PaymentReceipt | null> {
  const admin = createServiceRoleClient();

  // Gather the ids that need names.
  const programmeIds = [...new Set(rows.map((r) => r.programme_id).filter((x): x is string => !!x))];
  const productIds = [...new Set(rows.map((r) => r.product_id).filter((x): x is string => !!x))];
  const cohortIds = [...new Set(rows.map((r) => r.cohort_id).filter((x): x is string => !!x))];
  const strategyIds = [...new Set(rows.map((r) => r.strategy_id).filter((x): x is string => !!x))];
  const enrolmentIds = [...new Set(rows.map((r) => r.enrolment_id).filter((x): x is string => !!x))];

  const progById = new Map<string, { title: string; deliveryMode: string }>();
  if (programmeIds.length) {
    const { data } = await admin
      .from('nclex_programmes')
      .select('programme_id, title, delivery_mode')
      .in('programme_id', programmeIds);
    for (const p of (data ?? []) as { programme_id: string; title: string; delivery_mode: string }[]) {
      progById.set(p.programme_id, { title: p.title, deliveryMode: p.delivery_mode });
    }
  }

  const productNameById = new Map<string, string>();
  if (productIds.length) {
    const { data } = await admin
      .from('nclex_products')
      .select('product_id, name')
      .in('product_id', productIds);
    for (const p of (data ?? []) as { product_id: string; name: string }[]) {
      productNameById.set(p.product_id, p.name);
    }
  }

  const cohortLabelById = new Map<string, string>();
  if (cohortIds.length) {
    const { data } = await admin
      .from('nclex_cohorts')
      .select('cohort_id, name, start_date, end_date')
      .in('cohort_id', cohortIds);
    for (const c of (data ?? []) as {
      cohort_id: string;
      name: string | null;
      start_date: string;
      end_date: string;
    }[]) {
      cohortLabelById.set(c.cohort_id, formatCohortName(c));
    }
  }

  const strategyById = new Map<
    string,
    { kind: StrategyKind; label: string | null; installmentCount: number | null }
  >();
  if (strategyIds.length) {
    const { data } = await admin
      .from('nclex_programme_payment_strategies')
      .select('strategy_id, kind, label, installment_count')
      .in('strategy_id', strategyIds);
    for (const s of (data ?? []) as {
      strategy_id: string;
      kind: StrategyKind;
      label: string | null;
      installment_count: number | null;
    }[]) {
      strategyById.set(s.strategy_id, { kind: s.kind, label: s.label, installmentCount: s.installment_count });
    }
  }

  // Enrolment lookup, by id, for installment rows: the cohort lives on the
  // enrolment (not the row — cohort_scope CHECK) for the deep-link, and the
  // frozen plan snapshot is the canonical "of N" total (the live strategy row
  // can be null/edited; the snapshot is what the student actually owes).
  const enrolInfo = new Map<string, { cohortId: string | null; planTotal: number | null }>();
  if (enrolmentIds.length) {
    const { data } = await admin
      .from('nclex_enrolments')
      .select('enrolment_id, cohort_id, strategy_snapshot_json')
      .in('enrolment_id', enrolmentIds);
    for (const e of (data ?? []) as {
      enrolment_id: string;
      cohort_id: string | null;
      strategy_snapshot_json: FrozenStrategySnapshot | null;
    }[]) {
      const snap = e.strategy_snapshot_json;
      enrolInfo.set(e.enrolment_id, {
        cohortId: e.cohort_id,
        planTotal: snap ? planTotalPayments(snap.kind, snap.installment_count) : null,
      });
    }
  }

  // One receipt line per payment row.
  const lines: ReceiptLine[] = rows.map((r) => {
    if (r.purpose === 'PROGRAMME_INITIAL' || r.purpose === 'PROGRAMME_INSTALLMENT') {
      const name = (r.programme_id && progById.get(r.programme_id)?.title) || 'Programme';
      const metaBits: string[] = [];
      if (r.cohort_id) {
        const label = cohortLabelById.get(r.cohort_id);
        if (label) metaBits.push(label);
      }
      const strat = r.strategy_id ? strategyById.get(r.strategy_id) : undefined;
      if (r.purpose === 'PROGRAMME_INSTALLMENT') {
        const total =
          (r.enrolment_id ? enrolInfo.get(r.enrolment_id)?.planTotal ?? null : null) ??
          (strat ? planTotalPayments(strat.kind, strat.installmentCount) : null);
        metaBits.push(
          r.installment_index
            ? total
              ? `Payment ${r.installment_index} of ${total}`
              : `Payment ${r.installment_index}`
            : 'Instalment'
        );
      } else if (strat) {
        if (strat.kind === 'UPFRONT_FULL') metaBits.push('Paid in full');
        else if (strat.kind === 'DEPOSIT_BALANCE') metaBits.push('Deposit · balance to follow');
        else metaBits.push(`Payment 1 of ${planTotalPayments(strat.kind, strat.installmentCount)}`);
      }
      return {
        key: r.payment_id,
        name,
        meta: metaBits.join(' · ') || null,
        amountMinor: r.amount_minor,
        purpose: r.purpose,
      };
    }
    // Bank / readiness / programme bank opt-in.
    const name = (r.product_id && productNameById.get(r.product_id)) || 'Bank access';
    const meta =
      r.purpose === 'READINESS_PURCHASE'
        ? 'Readiness pack credits'
        : r.purpose === 'BANK_OPTIN_AT_PROGRAMME'
          ? 'Added with your programme'
          : 'Question bank access';
    return { key: r.payment_id, name, meta, amountMinor: r.amount_minor, purpose: r.purpose };
  });

  const totalMinor = lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const currency = rows[0].currency ?? 'GHS';

  // Forward destination + retry target. A programme purchase (initial or a
  // later installment) wins over a bank line; bank-only orders fall back to
  // the bank store.
  let destinationHref: string | null = null;
  let destinationLabel: string | null = null;
  let retryHref: string | null = null;

  const isTutorLed = rows.some((r) => {
    if (r.purpose !== 'PROGRAMME_INITIAL' && r.purpose !== 'PROGRAMME_INSTALLMENT') return false;
    const prog = r.programme_id ? progById.get(r.programme_id) : undefined;
    return !!prog && prog.deliveryMode !== 'SELF_PACED';
  });

  // Readiness credits only (no bank pass, no programme). Interim until the
  // claim UI ships: the buyer holds unclaimed credits, so we send them to
  // their dashboard — NOT "start practising" (there's nothing to practise
  // yet) — and retry goes back to the readiness page. Slice ②b.2 will
  // re-point this at the claim surface with a "Claim your pack →" CTA.
  const isReadinessOnly =
    rows.length > 0 && rows.every((r) => r.purpose === 'READINESS_PURCHASE');

  const progRow = rows.find((r) => r.purpose === 'PROGRAMME_INITIAL' || r.purpose === 'PROGRAMME_INSTALLMENT');
  if (progRow?.programme_id) {
    const prog = progById.get(progRow.programme_id);
    const cohortId =
      progRow.cohort_id ?? (progRow.enrolment_id ? enrolInfo.get(progRow.enrolment_id)?.cohortId ?? null : null);
    if (prog?.deliveryMode !== 'SELF_PACED' && cohortId) {
      destinationHref = `/student/cohort/${cohortId}`;
    } else {
      destinationHref = `/student/programme/${progRow.programme_id}`;
    }
    destinationLabel = 'Go to your programme';
    retryHref = `/programmes/${progRow.programme_id}`;
  } else if (isReadinessOnly) {
    // Interim (Slice ②b.1): the packs/claim surface (/student/bank/packs)
    // is behind the active-bank-subscription gate, so a credit-only buyer
    // would be bounced there. Land them on the picker (the canonical
    // student hub, no bank-sub required) until ②b.2 gives readiness its
    // own student-gated home and re-points this at it.
    destinationHref = '/student/picker';
    destinationLabel = 'Go to your account';
    retryHref = '/readiness';
  } else if (rows.some((r) => BANK_PURPOSES.includes(r.purpose))) {
    destinationHref = '/student/bank';
    destinationLabel = 'Start practising';
    retryHref = '/bank-access';
  }

  return {
    reference: ref,
    email: rows[0].email,
    currency,
    lines,
    totalMinor,
    destinationHref,
    destinationLabel,
    retryHref,
    isTutorLed,
    isReadinessOnly,
  };
}

// ─────────────────────────────────────────────────────────────────────
// The EMAILED receipt
// ─────────────────────────────────────────────────────────────────────
// Everything above assembles what the buyer sees on screen. Everything
// below turns the same facts into the frozen payload the email carries.
//
// ⭐ Built on getPaymentReceiptByGroup deliberately, rather than as a
// second reader: the screen and the email are the same receipt, and if
// they resolved names, cohorts and plan positions separately they would
// eventually disagree about the same purchase.
//
// ⭐ WHAT IS ADDED HERE IS THE "WHAT YOU NOW HAVE" HALF, and it is the
// only part that has to know the framing. The pay-first branch grants
// NOTHING at payment time (activate.ts marks the group SETUP_REQUIRED
// and creates no enrolment, no subscription, no credits until /welcome),
// so under that framing every grants line is null — there is nothing
// true to say yet, and a bank pass genuinely has no end date because
// end_at is computed AT activation.

function formatDueDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Assemble the payload for `payment.received`.
 *
 * @param checkoutGroupId the charge — also the email's fingerprint.
 * @param framing         how far the purchase actually got. The caller
 *                        knows this; it is the outcome activate.ts just
 *                        produced.
 */
export async function buildPaymentReceiptEmail(
  checkoutGroupId: string,
  framing: ReceiptFraming,
  /**
   * The one-time setup link, for the pay-first guest only.
   *
   * ⚠ Passed IN rather than looked up, because it cannot be looked up:
   * generateLink mints a secret that exists for one instant in
   * activate.ts and is never stored anywhere this function could read.
   * Every other field on this payload is derived from the database.
   */
  setUpUrl?: string | null
): Promise<{ payload: PaymentReceiptPayload; toEmail: string; toUserId: string | null } | null> {
  const receipt = await getPaymentReceiptByGroup(checkoutGroupId);
  if (!receipt) return null;

  const admin = createServiceRoleClient();
  const { data: payRows } = await admin
    .from('nclex_payments')
    .select(ROW_COLS)
    .eq('checkout_group_id', checkoutGroupId);
  const rows = (payRows ?? []) as Row[];
  if (rows.length === 0) return null;

  // Who it goes to. The ADDRESS is the recipient; the profile is looked
  // up only for a first name, and legitimately will not exist for a
  // pay-first buyer.
  const toEmail = receipt.email;
  const { data: profile } = await admin
    .from('nclex_users')
    .select('id, forename, name')
    .ilike('email', toEmail.trim().toLowerCase())
    .maybeSingle();
  const recipientName =
    (profile?.forename as string | null) ??
    ((profile?.name as string | null)?.split(' ')[0] ?? null);

  // ── grants, per purpose ──────────────────────────────────────────
  const grantsByPaymentId = new Map<string, string | null>();

  if (framing !== 'SETUP_REQUIRED') {
    // Bank passes: the end date lives on the subscription, which only
    // exists once activation has run.
    const bankPaymentIds = rows
      .filter(
        (r) =>
          r.purpose === 'BANK_PURCHASE' ||
          r.purpose === 'BANK_OPTIN_AT_PROGRAMME' ||
          // The trial writes an ordinary BANK_DURATION subscription, so the
          // same read produces its end date — "Bank access until 11 September
          // 2026", the one sentence a trial email most needs to carry.
          r.purpose === 'BANK_TRIAL'
      )
      .map((r) => r.payment_id);
    if (bankPaymentIds.length) {
      const { data: subs } = await admin
        .from('nclex_subscriptions')
        .select('payment_id, end_at')
        .in('payment_id', bankPaymentIds);
      for (const s of (subs ?? []) as { payment_id: string; end_at: string | null }[]) {
        grantsByPaymentId.set(
          s.payment_id,
          s.end_at ? `Bank access until ${formatDueDate(new Date(s.end_at))}` : 'Bank access is now open'
        );
      }
      // ⚠ Fallback when no subscription row is found. Today's
      // activate.ts always writes one before marking a payment
      // ACTIVATED, so this should not happen — but dev holds ACTIVATED
      // bank payments with no subscription (older rows), and if that
      // ever recurs the receipt would silently lose its entire "what you
      // now have" section. Saying less is better than saying nothing:
      // the payment IS activated, so access IS open; only the date is
      // unknown.
      for (const id of bankPaymentIds) {
        if (!grantsByPaymentId.has(id)) grantsByPaymentId.set(id, 'Bank access is now open');
      }
    }

    // Readiness: the count comes from the product, never from pack_type.
    const readinessRows = rows.filter((r) => r.purpose === 'READINESS_PURCHASE' && r.product_id);
    if (readinessRows.length) {
      const { data: prods } = await admin
        .from('nclex_products')
        .select('product_id, readiness_credits')
        .in('product_id', readinessRows.map((r) => r.product_id as string));
      const creditsById = new Map(
        ((prods ?? []) as { product_id: string; readiness_credits: number }[]).map((p) => [
          p.product_id,
          p.readiness_credits,
        ])
      );
      for (const r of readinessRows) {
        const n = creditsById.get(r.product_id as string) ?? 0;
        grantsByPaymentId.set(
          r.payment_id,
          n > 0 ? `${n} readiness pack${n === 1 ? '' : 's'} added to your account` : null
        );
      }
    }

    // Programme money: where they stand on the plan, read from the
    // enrolment's FROZEN snapshot — the same source the nightly sweep
    // uses, so the receipt cannot quote a schedule the sweep disagrees
    // with.
    const progRows = rows.filter(
      (r) => r.purpose === 'PROGRAMME_INITIAL' || r.purpose === 'PROGRAMME_INSTALLMENT'
    );
    if (progRows.length) {
      // ⚠ enrolment_id can be missing even on an ACTIVATED row (dev has
      // such rows). Everything below tolerates that and falls back to
      // the programme name rather than dropping the section.
      const linkedIds = progRows
        .map((r) => r.enrolment_id)
        .filter((x): x is string => !!x);
      const { data: enrols } = linkedIds.length
        ? await admin
            .from('nclex_enrolments')
            .select('enrolment_id, status, paused_reason, cohort_id, enrolled_at, strategy_snapshot_json')
            .in('enrolment_id', linkedIds)
        : { data: [] };

      const enrolRows = (enrols ?? []) as {
        enrolment_id: string;
        status: string;
        /** Why she is paused. 'INSTALLMENT_OVERDUE' | 'TUTOR_MANUAL' | null. */
        paused_reason: string | null;
        cohort_id: string | null;
        enrolled_at: string;
        strategy_snapshot_json: FrozenStrategySnapshot | null;
      }[];
      const enrolById = new Map(enrolRows.map((e) => [e.enrolment_id, e]));

      // ⚠ The cohort has to come from the ENROLMENT, not from the
      // payment row or its receipt line. A PROGRAMME_INSTALLMENT row
      // carries cohort_id = NULL by the cohort_scope CHECK, so its line
      // meta is just "Payment 2 of 4" — reading a place out of that
      // produced "Enrolled in Payment 2 of 4". Found by reading the
      // rendered text, 2026-08-11.
      const cohortNameById = new Map<string, string>();
      const enrolCohortIds = [
        ...new Set(enrolRows.map((e) => e.cohort_id).filter((x): x is string => !!x)),
      ];
      if (enrolCohortIds.length) {
        const { data: cs } = await admin
          .from('nclex_cohorts')
          .select('cohort_id, name, start_date, end_date')
          .in('cohort_id', enrolCohortIds);
        for (const c of (cs ?? []) as {
          cohort_id: string;
          name: string | null;
          start_date: string;
          end_date: string;
        }[]) {
          cohortNameById.set(c.cohort_id, formatCohortName(c));
        }
      }

      for (const r of progRows) {
        const line = receipt.lines.find((l) => l.key === r.payment_id);
        const e = r.enrolment_id ? enrolById.get(r.enrolment_id) : undefined;

        if (!e) {
          // No enrolment to read a schedule from. The payment is
          // activated, so the place is real — say that much and stop.
          grantsByPaymentId.set(r.payment_id, `Enrolled in ${line?.name ?? 'your programme'}`);
          continue;
        }

        // The cohort when there is one (tutor-led), otherwise the
        // programme itself (self-paced enrolments have no cohort).
        const place =
          (e.cohort_id ? cohortNameById.get(e.cohort_id) : null) ?? line?.name ?? 'your programme';

        if (e.status === 'PENDING_APPROVAL') {
          grantsByPaymentId.set(r.payment_id, `A place in ${place}, once your tutor approves it`);
          continue;
        }

        const snap = e.strategy_snapshot_json;
        if (!snap) {
          // ⚠ Same "Enrolled in" trap as below — a paused student
          // reaches this branch too when her plan has no snapshot, and
          // the statement would be just as false. No schedule here, so
          // it says the state and stops.
          grantsByPaymentId.set(
            r.payment_id,
            e.status === 'PAUSED' ? `Your place in ${place} is currently paused` : `Enrolled in ${place}`
          );
          continue;
        }

        const { count } = await admin
          .from('nclex_payments')
          .select('payment_id', { count: 'exact', head: true })
          .eq('enrolment_id', e.enrolment_id)
          .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'])
          .in('status', ['PAID', 'ACTIVATED']);

        const schedule = buildSchedule(snap, new Date(e.enrolled_at), count ?? 0);
        const remaining = schedule.payments
          .slice(schedule.paidCount)
          .reduce((sum, p) => sum + p.amountMinor, 0);

        // ⚠⚠ A PAUSED ENROLMENT IS NOT "Enrolled in". Found 2026-08-19
        // by reading a real receipt: a student 74 days behind paid one
        // instalment, stayed locked out — the gate asks "are you
        // current?", not "did you just pay" — and her receipt told her
        // "Enrolled in Q3 Upcoming Cohort". Not an omission: a false
        // statement, to the one person who had just paid.
        //
        // ⭐ It needs ONE day of pause, not seventy-four. The extremity
        // was seed data; the state is not — the nightly sweep pauses
        // people on prod every night, and paying what you can afford is
        // the most ordinary thing an overdue student does.
        //
        // ⚠ Branch on paused_reason, not just on PAUSED. A TUTOR_MANUAL
        // pause has nothing to do with arrears, and explaining it as
        // money would send her to fix a bill that is not the problem.
        const paused = e.status === 'PAUSED';
        const pausedForArrears = paused && e.paused_reason === 'INSTALLMENT_OVERDUE';

        const bits = [
          pausedForArrears
            ? `Access to ${place} is paused until the plan is up to date`
            : paused
              ? `Your place in ${place} is currently paused — your tutor can tell you more`
              : `Enrolled in ${place}`,
        ];
        if (schedule.next && remaining > 0) {
          // ⚠ TENSE. "next due 6 June" printed in August is the wrong
          // word for a date that has gone. Sam's phrasing, and it needs
          // no jargon: the payment WAS due.
          const due = schedule.next.dueDate;
          bits.push(
            `${formatMinor(remaining, receipt.currency)} remaining, ` +
              (due.getTime() < Date.now()
                ? `the next payment was due ${formatDueDate(due)}`
                : `next due ${formatDueDate(due)}`)
          );
        } else {
          bits.push('Paid in full');
        }
        grantsByPaymentId.set(r.payment_id, bits.join(' · '));
      }
    }
  }

  // ── the payload ──────────────────────────────────────────────────
  const first = rows[0];
  const paidAtISO = first.paid_at ?? new Date().toISOString();
  const method: PaymentReceiptPayload['method'] =
    first.collection_channel === 'OFF_PLATFORM' ? 'OFF_PLATFORM' : 'CARD';

  const lineItems: ReceiptLineItem[] = receipt.lines.map((l) => ({
    purpose: l.purpose as ReceiptLineItem['purpose'],
    // The line's name plus its qualifier — "NCLEX Intensive — Cohort 3 ·
    // Payment 2 of 4" reads as one thing out of context, which is how an
    // email is read.
    label: l.meta ? `${l.name} — ${l.meta}` : l.name,
    amountMinor: l.amountMinor,
    grants: grantsByPaymentId.get(l.key) ?? null,
  }));

  // ⚠ No IN-APP call to action while setup is outstanding: every in-app
  // destination would bounce her to a login she cannot complete yet.
  const showCta = framing === 'ACTIVATED' && !!receipt.destinationHref;

  // ⭐⭐ THE ONE DESTINATION THAT DOES WORK BEFORE SHE HAS AN ACCOUNT
  // (2026-08-19). The line above was right for as long as the only
  // candidates were app pages — and it is why this slot sat empty for
  // exactly the reader who most needed something to press. The setup
  // link is not an app page: it mints her session on the way in. So
  // SETUP_REQUIRED fills the SAME slot rather than growing a field of
  // its own, which also means a receipt queued before this shipped
  // (ctaHref null) renders exactly as it did before.
  const setUpCta = framing === 'SETUP_REQUIRED' && !!setUpUrl;

  return {
    toEmail,
    toUserId: (profile?.id as string | null) ?? first.user_id ?? null,
    payload: {
      framing,
      recipientName,
      currency: receipt.currency,
      totalMinor: receipt.totalMinor,
      paidAtISO,
      reference: first.paystack_reference,
      method,
      lineItems,
      ctaHref: setUpCta
        ? (setUpUrl as string)
        : showCta
          ? `${appOrigin()}${receipt.destinationHref}`
          : null,
      ctaLabel: setUpCta ? 'Set up your account' : showCta ? receipt.destinationLabel : null,
      // ⭐ `every`, not `some`: a trial is written as a standalone order and
      // can never share a checkout group with something bought, so the whole
      // email is either a trial or it isn't. If that ever stopped being true
      // the mixed case would read as an ordinary receipt, which is the safe
      // way round — it would understate, never claim a payment was free.
      isTrial: rows.length > 0 && rows.every((r) => r.purpose === 'BANK_TRIAL'),
    },
  };
}

/**
 * Queue the receipt for a checkout, and start sending it immediately.
 *
 * ⚠ STILL NEVER THROWS — the money landing outranks the receipt.
 *
 * ⭐ But it now REPORTS whether the row reached the queue, and that
 * matters for one framing only. On ACTIVATED and PENDING_APPROVAL the
 * receipt is a courtesy: she already holds what she bought, or a tutor
 * does, and a lost receipt costs her nothing she cannot see in the app.
 * On SETUP_REQUIRED since 2026-08-19 this email carries the ONLY link
 * into an account she has already paid for — so a queue failure is the
 * difference between "check your email" and total silence, and the one
 * human who can act on it is looking at the callback page right now.
 * Same reasoning that gave enqueueAndSend its `queued` flag on
 * 2026-08-12 for the tutor path; the person present is different.
 *
 * ⚠ `queued: true` means QUEUED, not delivered — including the two
 * outcomes enqueueEmail treats as success-with-nothing-to-send (a
 * suppressed @example.com address, a duplicate the fingerprint refused).
 * Both are correct here: neither is something to alarm a buyer about.
 */
export async function sendPaymentReceipt(
  checkoutGroupId: string,
  framing: ReceiptFraming,
  setUpUrl?: string | null
): Promise<{ queued: boolean }> {
  try {
    const built = await buildPaymentReceiptEmail(checkoutGroupId, framing, setUpUrl);
    // No receipt could be built at all (the group vanished between the
    // write and here). Nothing is going out, so say so rather than
    // report a silent success.
    if (!built) return { queued: false };
    return await enqueueAndSend({
      eventKey: 'payment.received',
      // ⭐ The CHECKOUT, not the payment row — one debit, one receipt.
      subjectRef: checkoutGroupId,
      toEmail: built.toEmail,
      toUserId: built.toUserId,
      payload: built.payload as unknown as Record<string, unknown>,
    });
  } catch (e) {
    // The money landing outranks the receipt. Never let this throw into
    // a payment path.
    console.error('[email] receipt failed for checkout', checkoutGroupId, (e as Error).message);
    return { queued: false };
  }
}
