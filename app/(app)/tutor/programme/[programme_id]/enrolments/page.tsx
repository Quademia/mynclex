// mynclex/app/(app)/tutor/programme/[programme_id]/enrolments/page.tsx
//
// Programme Enrolments tab — the single enrolment roster for BOTH
// delivery modes (settled 2026-06-12; the cohort-level mount was
// retired). Tutor-led shows every cohort's enrolments (cohort-tagged,
// filterable via ?cohort=, which the cohort workspace's "Manage
// enrolments →" link pre-fills) plus the cross-cohort Waitlist tab;
// self-paced shows the cohortless rows. Same lifecycle/payment
// actions and Add-student either way.

import { notFound } from 'next/navigation';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getCohortsForProgramme } from '@/lib/cohorts/queries';
import { formatCohortName } from '@/lib/cohorts/format';
import {
  getProgrammeRoster,
  getProgrammeWaitlist,
  getRosterPlanContext,
} from '@/lib/enrolments/queries';
import { EnrolmentRosterView } from '@/lib/enrolments/enrolment-roster-view';
import type { CohortOption } from '@/lib/enrolments/types';

export const dynamic = 'force-dynamic';

export default async function ProgrammeEnrolmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ programme_id: string }>;
  searchParams: Promise<{ cohort?: string }>;
}) {
  const [{ programme_id }, { cohort }] = await Promise.all([params, searchParams]);

  // Ownership gate (RLS-scoped, null → 404).
  const programme = await getProgrammeForShell(programme_id);
  if (!programme) notFound();

  const roster = await getProgrammeRoster(programme_id);
  if (roster === null) notFound();

  const tutorLed = programme.delivery_mode === 'TUTOR_LED';
  const [waitlist, cohortRows, planCtx] = await Promise.all([
    tutorLed ? getProgrammeWaitlist(programme_id) : Promise.resolve([]),
    tutorLed ? getCohortsForProgramme(programme_id) : Promise.resolve([]),
    getRosterPlanContext(programme_id),
  ]);

  const cohorts: CohortOption[] = cohortRows.map((c) => ({
    cohort_id: c.cohort_id,
    label: formatCohortName(c),
    cancelled: c.cancelled_at != null,
  }));

  return (
    <EnrolmentRosterView
      programmeId={programme_id}
      deliveryMode={programme.delivery_mode}
      contextName={programme.title}
      roster={roster}
      waitlist={waitlist}
      cohorts={cohorts}
      initialCohortId={cohort}
      plans={planCtx.plans}
      plansByCohort={planCtx.plansByCohort}
      currency={planCtx.currency}
      paymentGatesAccess={planCtx.paymentGatesAccess}
    />
  );
}
