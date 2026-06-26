// mynclex/lib/enrolments/queries.ts
//
// Server-side reads for the tutor cohort roster (Slice 1b).
//
// Ownership + RLS note: the roster joins each enrolment to the
// student's nclex_users profile (name + email). But nclex_users RLS
// is self-read-only — a tutor can't SELECT another user's profile
// row through their own authed client, so an !inner join on the
// authed client would filter every roster row out. So we:
//   1. Gate ownership with the AUTHED client (RLS only returns the
//      cohort row if the caller owns its parent programme, or is a
//      SUPER_ADMIN). Null → caller 404s.
//   2. Read the roster (enrolment + joined profile) with the SERVICE
//      ROLE client, which bypasses RLS. Safe because step 1 already
//      proved the caller is entitled to this cohort's roster.
// A future RLS helper ("tutor may read profiles of students enrolled
// in their programmes") could replace step 2 — left for later.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { nextPaymentView } from '@/lib/payments/schedule';
import { formatCohortName } from '@/lib/cohorts/format';
import type { Currency } from '@/lib/payments/types';
import type { FrozenStrategySnapshot, PaymentStrategy } from '@/lib/strategies/types';
import type { EnrolmentRosterRow, EnrolmentStatus, WaitlistEntry } from './types';

// Active statuses win over terminal ones when a student has both a past
// (e.g. CANCELLED) and a current row for the same scope. Mirrors the
// same rule in lib/programmes/student-actions.ts (the switcher).
const ACTIVE_STATUSES: ReadonlySet<EnrolmentStatus> = new Set([
  'PENDING_APPROVAL',
  'ENROLLED',
  'PAUSED',
]);

function pickStatus(
  rows: { status: EnrolmentStatus }[],
): EnrolmentStatus | null {
  let chosen: EnrolmentStatus | null = null;
  for (const r of rows) {
    if (
      !chosen ||
      (ACTIVE_STATUSES.has(r.status) && !ACTIVE_STATUSES.has(chosen))
    ) {
      chosen = r.status;
    }
  }
  return chosen;
}

/**
 * The calling student's own enrolment status for a SELF-PACED
 * programme (cohort_id IS NULL), active-wins-over-terminal.
 * null = no enrolment row at all. RLS scopes to user_id = auth.uid(),
 * so this only ever sees the caller's rows.
 */
export async function getMyProgrammeEnrolmentStatus(
  programmeId: string,
): Promise<EnrolmentStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_enrolments')
    .select('status')
    .eq('programme_id', programmeId)
    .is('cohort_id', null);
  return pickStatus((data ?? []) as { status: EnrolmentStatus }[]);
}

/**
 * The calling student's own enrolment status for a tutor-led COHORT,
 * active-wins-over-terminal. null = no enrolment row.
 */
export async function getMyCohortEnrolmentStatus(
  cohortId: string,
): Promise<EnrolmentStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_enrolments')
    .select('status')
    .eq('cohort_id', cohortId);
  return pickStatus((data ?? []) as { status: EnrolmentStatus }[]);
}

export async function getCohortRoster(
  cohortId: string,
): Promise<EnrolmentRosterRow[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Ownership gate (RLS-scoped). Returns the row only for the owning
  // tutor or a SUPER_ADMIN; anyone else gets null. The parent programme's
  // currency rides along (every plan inherits it) for the payment column.
  const { data: owned } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id, nclex_programmes!inner(price_currency)')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!owned) return null;
  const ownedProg = (
    owned as typeof owned & {
      nclex_programmes: { price_currency: Currency } | { price_currency: Currency }[] | null;
    }
  ).nclex_programmes;
  const currency = (Array.isArray(ownedProg) ? ownedProg[0] : ownedProg)?.price_currency ?? 'GHS';

  return readRoster({ column: 'cohort_id', id: cohortId, selfPaced: false }, currency);
}

/**
 * Roster for a programme — the single roster mount for BOTH delivery
 * modes (the cohort-level mount was retired 2026-06-12). Self-paced
 * reads the cohortless rows; tutor-led reads every cohort's rows
 * (cohort-tagged). Same ownership-then-service-role pattern as
 * getCohortRoster; null = not the caller's programme (page 404s).
 */
export async function getProgrammeRoster(
  programmeId: string,
): Promise<EnrolmentRosterRow[] | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Ownership gate (RLS-scoped): the programme row returns only for the
  // owning tutor / SUPER_ADMIN.
  const { data: owned } = await supabase
    .from('nclex_programmes')
    .select('programme_id, price_currency, delivery_mode')
    .eq('programme_id', programmeId)
    .maybeSingle();
  if (!owned) return null;
  const currency = (owned.price_currency as Currency | null) ?? 'GHS';

  return readRoster(
    {
      column: 'programme_id',
      id: programmeId,
      selfPaced: owned.delivery_mode === 'SELF_PACED',
    },
    currency,
  );
}

// Shared roster read (service role — student profiles are self-read-only
// under RLS; callers prove ownership first). Self-paced filters to the
// cohortless rows; a tutor-led programme read deliberately spans every
// cohort's rows (the programme page tags + filters them by cohort).
async function readRoster(
  scope: { column: 'cohort_id' | 'programme_id'; id: string; selfPaced: boolean },
  currency: Currency,
): Promise<EnrolmentRosterRow[]> {
  const admin = createServiceRoleClient();
  let query = admin
    .from('nclex_enrolments')
    // nclex_enrolments has three FKs to nclex_users (user_id,
    // enrolled_by_user_id, approved_by_user_id), so the embed MUST name
    // the constraint — an unqualified nclex_users!inner is ambiguous and
    // PostgREST errors (which this function would swallow into an empty
    // roster). Follow the user_id FK explicitly. The cohort embed is a
    // LEFT join (cohort_id is NULL on self-paced rows).
    .select(
      `enrolment_id, user_id, cohort_id, status, enrolment_source, enrolled_at, paused_reason,
       strategy_snapshot_json, installment_grace_until,
       nclex_users!nclex_enrolments_user_id_fkey!inner(name, email),
       nclex_cohorts(name, start_date, end_date)`,
    )
    .eq(scope.column, scope.id);
  if (scope.selfPaced) query = query.is('cohort_id', null);
  const { data, error } = await query.order('enrolled_at', { ascending: false });

  if (error || !data) return [];

  type RawCohort = { name: string | null; start_date: string; end_date: string };
  type RawRow = {
    enrolment_id: string;
    user_id: string;
    cohort_id: string | null;
    status: EnrolmentRosterRow['status'];
    enrolment_source: EnrolmentRosterRow['enrolment_source'];
    enrolled_at: string;
    paused_reason: EnrolmentRosterRow['paused_reason'];
    strategy_snapshot_json: FrozenStrategySnapshot | null;
    installment_grace_until: string | null;
    nclex_users:
      | { name: string; email: string }
      | { name: string; email: string }[]
      | null;
    nclex_cohorts: RawCohort | RawCohort[] | null;
  };

  const rows = data as RawRow[];

  // Settled-payment counts per enrolment, in one read, for the schedule
  // engine's paidCount. PAID counts even before activation.
  const paidByEnrolment = new Map<string, number>();
  const enrolmentIds = rows.map((r) => r.enrolment_id);
  if (enrolmentIds.length > 0) {
    const { data: pays } = await admin
      .from('nclex_payments')
      .select('enrolment_id')
      .in('enrolment_id', enrolmentIds)
      .in('purpose', ['PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT'])
      .in('status', ['PAID', 'ACTIVATED']);
    for (const p of (pays ?? []) as { enrolment_id: string | null }[]) {
      if (!p.enrolment_id) continue;
      paidByEnrolment.set(p.enrolment_id, (paidByEnrolment.get(p.enrolment_id) ?? 0) + 1);
    }
  }

  return rows
    .map((r) => {
      const profile = Array.isArray(r.nclex_users)
        ? r.nclex_users[0]
        : r.nclex_users;
      if (!profile) return null;
      const cohort = Array.isArray(r.nclex_cohorts)
        ? r.nclex_cohorts[0]
        : r.nclex_cohorts;
      // A plan only "shows" payment state for active enrolments. With a plan,
      // a null next-payment means fully paid; without one it just means
      // "no payment plan" (bare dash).
      const hasPlan =
        (r.status === 'ENROLLED' || r.status === 'PAUSED') && !!r.strategy_snapshot_json;
      const nextPayment = hasPlan
        ? nextPaymentView(
            r.strategy_snapshot_json!,
            new Date(r.enrolled_at),
            paidByEnrolment.get(r.enrolment_id) ?? 0,
            currency,
            r.enrolment_id,
            new Date(),
            r.installment_grace_until ? new Date(r.installment_grace_until) : null,
          )
        : null;
      return {
        enrolment_id: r.enrolment_id,
        user_id: r.user_id,
        status: r.status,
        enrolment_source: r.enrolment_source,
        enrolled_at: r.enrolled_at,
        paused_reason: r.paused_reason,
        name: profile.name,
        email: profile.email,
        cohort_id: r.cohort_id,
        cohort_label: cohort ? formatCohortName(cohort) : null,
        nextPayment,
        paymentFullyPaid: hasPlan && nextPayment === null,
      } satisfies EnrolmentRosterRow;
    })
    .filter((r): r is EnrolmentRosterRow => r !== null);
}

/**
 * The programme's ACTIVE payment plans + currency, for the Add Student
 * modal's plan picker (add-with-plan, 2026-06-12). Authed client —
 * strategy RLS is owner-scoped, so a programme the tutor doesn't own
 * yields no plans. Callers gate ownership via the roster read anyway
 * (null → 404) before this.
 */
export async function getRosterPlanContext(
  programmeId: string,
): Promise<{
  plans: PaymentStrategy[];
  currency: Currency;
  plansByCohort: Record<string, PaymentStrategy[]>;
  paymentGatesAccess: boolean;
}> {
  const supabase = await createClient();
  const [{ data: prog }, { data: all, error }] = await Promise.all([
    supabase
      .from('nclex_programmes')
      .select('price_currency, payment_gates_access')
      .eq('programme_id', programmeId)
      .maybeSingle(),
    // All active plans, both scopes — partitioned below into the programme
    // defaults + a per-cohort map, so the Add-student / Convert pickers can
    // offer a custom cohort's own plans (cohort-aware add, 2026-06-22).
    supabase
      .from('nclex_programme_payment_strategies')
      .select(
        `strategy_id, programme_id, cohort_id, kind, label,
         total_price_minor, initial_price_minor,
         installment_count, installment_interval_days,
         balance_due_days_after_enrolment,
         is_active, sort_order, created_at, updated_at`,
      )
      .eq('programme_id', programmeId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  const rows = (error || !all ? [] : all) as (PaymentStrategy & {
    cohort_id: string | null;
  })[];
  const plans = rows.filter((r) => r.cohort_id == null);
  const plansByCohort: Record<string, PaymentStrategy[]> = {};
  for (const r of rows) {
    if (r.cohort_id != null) (plansByCohort[r.cohort_id] ??= []).push(r);
  }

  return {
    plans,
    currency: (prog?.price_currency as Currency | undefined) ?? 'GHS',
    plansByCohort,
    // Default TRUE if the row is somehow missing — fail to the safe (gating-on)
    // default rather than silently disabling enforcement.
    paymentGatesAccess: (prog?.payment_gates_access as boolean | undefined) ?? true,
  };
}

/**
 * PENDING student-initiated waitlist leads across ALL the programme's
 * cohorts (the Enrolments page moved to programme level 2026-06-12;
 * each lead carries its cohort badge). Unlike the roster, the waitlist
 * row itself is readable by the owning tutor — the RLS policy
 * nclex_cohort_waitlist_tutor_select is keyed on the lead's
 * programme_id ownership — so the authed client suffices, no
 * service-role hop. Callers gate ownership via getProgrammeRoster
 * (returns null → 404) before reaching this.
 */
export async function getProgrammeWaitlist(
  programmeId: string,
): Promise<WaitlistEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_cohort_waitlist')
    .select(
      `waitlist_id, cohort_id, forename, surname, email, phone,
       preferred_contact, message, created_at,
       nclex_cohorts(name, start_date, end_date)`,
    )
    .eq('programme_id', programmeId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  type RawCohort = { name: string | null; start_date: string; end_date: string };
  type RawLead = Omit<WaitlistEntry, 'cohort_label'> & {
    nclex_cohorts: RawCohort | RawCohort[] | null;
  };
  return (data as RawLead[]).map((lead) => {
    const cohort = Array.isArray(lead.nclex_cohorts)
      ? lead.nclex_cohorts[0]
      : lead.nclex_cohorts;
    return {
      waitlist_id: lead.waitlist_id,
      cohort_id: lead.cohort_id,
      cohort_label: cohort ? formatCohortName(cohort) : '—',
      forename: lead.forename,
      surname: lead.surname,
      email: lead.email,
      phone: lead.phone,
      preferred_contact: lead.preferred_contact,
      message: lead.message,
      created_at: lead.created_at,
    } satisfies WaitlistEntry;
  });
}
