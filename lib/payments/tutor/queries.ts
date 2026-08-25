// mynclex/lib/payments/tutor/queries.ts
//
// Server-side read for the global tutor Payments page. Returns every
// programme-fee payment across the tutor's own programmes (newest first)
// PLUS the tutor's cohort list for the filter — including cohorts with no
// payments yet, so a tutor can drill in and confirm "nothing collected
// here."
//
// Ownership + RLS (same pattern as lib/enrolments/queries.ts):
//   1. List the tutor's programmes with the AUTHED, RLS-scoped client —
//      it returns only programmes the caller owns (or all, for a
//      SUPER_ADMIN). That set is the access boundary.
//   2. Read nclex_payments + the payer/enrolment/cohort joins with the
//      SERVICE-ROLE client (nclex_payments has no tutor-read policy, and
//      nclex_users is self-read-only). Safe because step 1 already
//      scoped us to the caller's own programmes.
// No migration — this is a read over existing tables.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { buildSchedule } from '@/lib/payments/schedule';
import { formatCohortName } from '@/lib/cohorts/format';
import type { Currency } from '@/lib/payments/types';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';
import type { TutorPaymentRow, TutorCohortOption, TutorPaymentsData } from './types';

export async function getTutorPayments(): Promise<TutorPaymentsData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], cohorts: [] };

  // 1. Owned programmes. Empty → nothing to show.
  //
  // ⚠⚠ THE OWNER FILTER IS LOAD-BEARING — do not remove it because
  // "RLS covers it". It does not: nclex_programmes carries
  // _student_select too, so an unfiltered read returns programmes the
  // caller is merely ENROLLED on. Those ids are handed to the
  // service-role client below, which bypasses RLS by design — so this
  // filter is the ONLY thing keeping another tutor's students' names,
  // emails and payment history off this page. Measured on dev
  // 2026-08-25: an account owning zero programmes was shown three of
  // another student's payments. See lib/programmes/tutor-scope.ts.
  const { data: progs } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title, price_currency')
    .eq('tutor_id', user.id);
  const programmes = (progs ?? []) as {
    programme_id: string;
    title: string;
    price_currency: Currency;
  }[];
  if (programmes.length === 0) return { rows: [], cohorts: [] };

  const progMap = new Map<string, { title: string; currency: Currency }>();
  for (const p of programmes) {
    progMap.set(p.programme_id, { title: p.title, currency: p.price_currency });
  }
  const programmeIds = [...progMap.keys()];

  const admin = createServiceRoleClient();

  // 2. All the tutor's cohorts, in one read. Builds BOTH the per-row label
  //    map (incl. cancelled — a payment to a since-cancelled cohort still
  //    shows its name) AND the Cohort-filter dropdown (non-cancelled,
  //    INCLUDING cohorts with zero payments, so the tutor can drill in and
  //    confirm "nothing collected here").
  const { data: cohData } = await admin
    .from('nclex_cohorts')
    .select('cohort_id, programme_id, name, start_date, end_date, cancelled_at')
    .in('programme_id', programmeIds);
  const cohortLabelById = new Map<string, string>();
  const cohorts: TutorCohortOption[] = [];
  for (const c of (cohData ?? []) as {
    cohort_id: string;
    programme_id: string;
    name: string | null;
    start_date: string;
    end_date: string;
    cancelled_at: string | null;
  }[]) {
    const label = formatCohortName(c);
    cohortLabelById.set(c.cohort_id, label);
    if (!c.cancelled_at) {
      cohorts.push({
        cohortId: c.cohort_id,
        label,
        programmeId: c.programme_id,
        programmeName: progMap.get(c.programme_id)?.title ?? 'Programme',
      });
    }
  }
  cohorts.sort(
    (a, b) => a.programmeName.localeCompare(b.programmeName) || a.label.localeCompare(b.label),
  );

  // 3. Programme-fee payments for those programmes (service role).
  const { data: pays } = await admin
    .from('nclex_payments')
    .select(
      `payment_id, user_id, email, programme_id, enrolment_id, installment_index,
       currency, amount_minor, status, purpose, collection_channel,
       paid_at, activated_at, created_at`,
    )
    .in('programme_id', programmeIds)
    .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'])
    .in('status', ['PAID', 'ACTIVATED', 'SETUP_REQUIRED', 'REFUNDED']);

  type PayRow = {
    payment_id: string;
    user_id: string | null;
    email: string;
    programme_id: string;
    enrolment_id: string | null;
    installment_index: number | null;
    currency: Currency;
    amount_minor: number;
    status: string;
    purpose: 'PROGRAMME_INITIAL' | 'PROGRAMME_INSTALLMENT';
    collection_channel: 'PAYSTACK' | 'OFF_PLATFORM' | null;
    paid_at: string | null;
    activated_at: string | null;
    created_at: string;
  };
  const rows = (pays ?? []) as PayRow[];
  if (rows.length === 0) return { rows: [], cohorts };

  // 4. Payer names (nclex_users is self-read-only — service role).
  const userIds = [
    ...new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  ];
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('nclex_users')
      .select('id, name')
      .in('id', userIds);
    for (const u of (users ?? []) as { id: string; name: string }[]) {
      nameById.set(u.id, u.name);
    }
  }

  // 5. Enrolment → cohort_id + frozen plan snapshot. Cohort_id lives on
  //    the enrolment, so this carries cohort onto installment rows too;
  //    the snapshot gives the plan total for "k of N" + the clock gate.
  const enrolmentIds = [
    ...new Set(rows.map((r) => r.enrolment_id).filter((id): id is string => !!id)),
  ];
  const enrolMap = new Map<
    string,
    { cohortId: string | null; snapshot: FrozenStrategySnapshot | null }
  >();
  if (enrolmentIds.length > 0) {
    const { data: enrs } = await admin
      .from('nclex_enrolments')
      .select('enrolment_id, cohort_id, strategy_snapshot_json')
      .in('enrolment_id', enrolmentIds);
    for (const e of (enrs ?? []) as {
      enrolment_id: string;
      cohort_id: string | null;
      strategy_snapshot_json: FrozenStrategySnapshot | null;
    }[]) {
      enrolMap.set(e.enrolment_id, {
        cohortId: e.cohort_id,
        snapshot: e.strategy_snapshot_json,
      });
    }
  }

  // 6. Assemble.
  const out: TutorPaymentRow[] = rows.map((r) => {
    const prog = progMap.get(r.programme_id);
    const enrol = r.enrolment_id ? enrolMap.get(r.enrolment_id) : undefined;
    const cohortId = enrol?.cohortId ?? null;
    const snapshot = enrol?.snapshot ?? null;
    const isInstallment = r.purpose === 'PROGRAMME_INSTALLMENT';
    return {
      paymentId: r.payment_id,
      name: r.user_id ? (nameById.get(r.user_id) ?? r.email) : r.email,
      email: r.email,
      programmeId: r.programme_id,
      programmeName: prog?.title ?? 'Unknown programme',
      cohortId,
      cohortLabel: cohortId ? (cohortLabelById.get(cohortId) ?? null) : null,
      purpose: isInstallment ? 'installment' : 'initial',
      installmentIndex: isInstallment ? r.installment_index : null,
      installmentTotal:
        isInstallment && snapshot
          ? buildSchedule(snapshot, new Date(0), 0).totalPayments
          : null,
      channel: r.collection_channel === 'OFF_PLATFORM' ? 'offplatform' : 'online',
      amountMinor: r.amount_minor,
      currency: r.currency ?? prog?.currency ?? 'GHS',
      status: r.status === 'REFUNDED' ? 'refunded' : 'received',
      dateIso: r.paid_at ?? r.activated_at ?? r.created_at,
      enrolmentId: r.enrolment_id,
      hasHistory: !!r.enrolment_id && !!snapshot,
    };
  });

  out.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  return { rows: out, cohorts };
}
