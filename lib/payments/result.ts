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
import type { Currency, PaymentPurpose } from './types';
import type { StrategyKind, FrozenStrategySnapshot } from '@/lib/strategies/types';

export type ReceiptLine = {
  key: string;
  name: string;
  meta: string | null;
  amountMinor: number;
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
};

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
];

export async function getPaymentReceipt(reference: string): Promise<PaymentReceipt | null> {
  const ref = reference.trim();
  if (!ref) return null;

  const admin = createServiceRoleClient();
  const { data: payRows } = await admin
    .from('nclex_payments')
    .select(
      `payment_id, email, purpose, product_id, programme_id, cohort_id,
       strategy_id, installment_index, enrolment_id, currency, amount_minor`
    )
    .eq('paystack_reference', ref);
  const rows = (payRows ?? []) as Row[];
  if (rows.length === 0) return null;

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
      return { key: r.payment_id, name, meta: metaBits.join(' · ') || null, amountMinor: r.amount_minor };
    }
    // Bank / readiness / programme bank opt-in.
    const name = (r.product_id && productNameById.get(r.product_id)) || 'Bank access';
    const meta =
      r.purpose === 'READINESS_PURCHASE'
        ? 'Readiness pack credits'
        : r.purpose === 'BANK_OPTIN_AT_PROGRAMME'
          ? 'Added with your programme'
          : 'Question bank access';
    return { key: r.payment_id, name, meta, amountMinor: r.amount_minor };
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
