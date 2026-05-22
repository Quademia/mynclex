// mynclex/lib/programmes/student-actions.ts
//
// Slice 10.1 — server action that backs the
// <ProgrammeSwitcherOverlay>. Returns the student's accessible
// programmes + cohorts, lazily fetched when the overlay opens.
//
// Enrolment-gated since the access-gating step: metadata-tier RLS
// (nclex_has_programme_enrolment / nclex_has_cohort_enrolment) returns
// only programmes + cohorts the student holds an enrolment row in (any
// status). So this list narrows to enrolled-only automatically — no
// EXISTS in the query body — and a row's `status` is the pill the
// overlay shows. ENROLLED rows are enterable; the rest are shown
// non-clickable (the overlay gates entry; require-*-access is the
// server-side safety net for direct URLs).

'use server';

import { requireStudent } from '@/lib/access';
import type { EnrolmentStatus } from '@/lib/enrolments/types';
import { nextPaymentView, type NextPaymentView } from '@/lib/payments/schedule';
import type { Currency } from '@/lib/payments/types';
import type { FrozenStrategySnapshot } from '@/lib/strategies/types';
import type { DeliveryMode, UnitLabel } from './types';

export type SwitcherProgramme = {
  programme_id: string;
  title: string;
  tagline: string | null;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
  cohorts: SwitcherCohort[];
  // Self-paced only: the student's enrolment status on this programme
  // (cohort_id IS NULL). null = listed but not enrolled (v1 permissive).
  status: EnrolmentStatus | null;
  // Self-paced only: the next payment owed on this enrolment, or null when
  // fully paid / no plan (Slice 7d).
  nextPayment: NextPaymentView | null;
};

export type SwitcherCohort = {
  cohort_id: string;
  programme_id: string;
  name: string | null;
  start_date: string;
  end_date: string;
  // The student's enrolment status in this cohort, or null if they're
  // not enrolled (the cohort is still listed under permissive v1).
  status: EnrolmentStatus | null;
  // The next payment owed on this cohort enrolment, or null (Slice 7d).
  nextPayment: NextPaymentView | null;
};

// Active statuses win over terminal ones when a student has both a
// past (e.g. CANCELLED) and a current row for the same cohort.
const ACTIVE_STATUSES: ReadonlySet<EnrolmentStatus> = new Set([
  'PENDING_APPROVAL',
  'ENROLLED',
  'PAUSED',
]);

export async function getMyAccessibleProgrammesAction(): Promise<{
  programmes: SwitcherProgramme[];
}> {
  const ctx = await requireStudent();
  const supabase = ctx.supabase;

  const [progRes, cohortRes, enrolRes, payRes] = await Promise.all([
    supabase
      .from('nclex_programmes')
      .select(
        'programme_id, title, tagline, delivery_mode, unit_label, length_units, price_currency'
      )
      .order('title', { ascending: true }),
    supabase
      .from('nclex_cohorts')
      .select('cohort_id, programme_id, name, start_date, end_date')
      .order('start_date', { ascending: true }),
    // The student's own enrolment rows (RLS: user_id = auth.uid()).
    supabase
      .from('nclex_enrolments')
      .select('enrolment_id, programme_id, cohort_id, status, enrolled_at, strategy_snapshot_json, installment_grace_until'),
    // The student's own programme payments that count toward "paid so far"
    // (RLS: user_id = auth.uid()). PAID counts even before activation.
    supabase
      .from('nclex_payments')
      .select('enrolment_id')
      .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'])
      .in('status', ['PAID', 'ACTIVATED']),
  ]);

  type ProgrammeRow = Omit<SwitcherProgramme, 'cohorts' | 'status' | 'nextPayment'> & {
    price_currency: Currency;
  };
  const programmes = (progRes.data ?? []) as ProgrammeRow[];
  const cohorts = (cohortRes.data ?? []) as Omit<SwitcherCohort, 'status' | 'nextPayment'>[];
  const enrolments = (enrolRes.data ?? []) as {
    enrolment_id: string;
    programme_id: string;
    cohort_id: string | null;
    status: EnrolmentStatus;
    enrolled_at: string;
    strategy_snapshot_json: FrozenStrategySnapshot | null;
    installment_grace_until: string | null;
  }[];
  const payments = (payRes.data ?? []) as { enrolment_id: string | null }[];

  const currencyByProgramme = new Map<string, Currency>(
    programmes.map((p) => [p.programme_id, p.price_currency])
  );

  // Settled-payment count per enrolment → the schedule engine's paidCount.
  const paidByEnrolment = new Map<string, number>();
  for (const pay of payments) {
    if (!pay.enrolment_id) continue;
    paidByEnrolment.set(pay.enrolment_id, (paidByEnrolment.get(pay.enrolment_id) ?? 0) + 1);
  }

  // Status lookup keyed by cohort_id (tutor-led) or "prog:<id>" for
  // self-paced (cohort_id IS NULL). Active status wins over terminal.
  const statusByKey = new Map<string, EnrolmentStatus>();
  // Next-payment lookup, same keying. Computed only for active-ish rows with
  // a frozen plan; an active row wins over a terminal one for the same key.
  const nextPaymentByKey = new Map<string, NextPaymentView | null>();
  for (const e of enrolments) {
    const key = e.cohort_id ?? `prog:${e.programme_id}`;
    const existing = statusByKey.get(key);
    const winsKey = !existing || (ACTIVE_STATUSES.has(e.status) && !ACTIVE_STATUSES.has(existing));
    if (winsKey) {
      statusByKey.set(key, e.status);
      const currency = currencyByProgramme.get(e.programme_id);
      const showsPayment = e.status === 'ENROLLED' || e.status === 'PAUSED';
      nextPaymentByKey.set(
        key,
        showsPayment && e.strategy_snapshot_json && currency
          ? nextPaymentView(
              e.strategy_snapshot_json,
              new Date(e.enrolled_at),
              paidByEnrolment.get(e.enrolment_id) ?? 0,
              currency,
              e.enrolment_id,
              new Date(),
              e.installment_grace_until ? new Date(e.installment_grace_until) : null
            )
          : null
      );
    }
  }

  const cohortsByProgramme = new Map<string, SwitcherCohort[]>();
  for (const c of cohorts) {
    const arr = cohortsByProgramme.get(c.programme_id) ?? [];
    arr.push({
      ...c,
      status: statusByKey.get(c.cohort_id) ?? null,
      nextPayment: nextPaymentByKey.get(c.cohort_id) ?? null,
    });
    cohortsByProgramme.set(c.programme_id, arr);
  }

  return {
    programmes: programmes.map(({ price_currency: _drop, ...p }) => ({
      ...p,
      cohorts: cohortsByProgramme.get(p.programme_id) ?? [],
      status: statusByKey.get(`prog:${p.programme_id}`) ?? null,
      nextPayment: nextPaymentByKey.get(`prog:${p.programme_id}`) ?? null,
    })),
  };
}
