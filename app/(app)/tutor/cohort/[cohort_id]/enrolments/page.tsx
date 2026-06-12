// mynclex/app/(app)/tutor/cohort/[cohort_id]/enrolments/page.tsx
//
// Cohort Enrolments tab (formerly "Students"; renamed in the cohort-
// analytics slice). The administrative roster of enrolled students +
// waitlist + off-platform "Add student". Ownership is gated inside both
// reads (RLS-scoped); either returning null → 404. "How students are
// doing" lives in the sibling Analytics tab.

import { notFound } from 'next/navigation';
import { getCohortForShell } from '@/lib/cohorts/queries';
import { formatCohortName } from '@/lib/cohorts/format';
import {
  getCohortRoster,
  getCohortWaitlist,
  getRosterPlanContext,
} from '@/lib/enrolments/queries';
import { EnrolmentRosterView } from '@/lib/enrolments/enrolment-roster-view';

export const dynamic = 'force-dynamic';

export default async function CohortStudentsPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;

  const ctx = await getCohortForShell(cohort_id);
  if (!ctx) notFound();

  const roster = await getCohortRoster(cohort_id);
  if (roster === null) notFound();

  // Ownership already proven by getCohortRoster above (null → 404).
  const [waitlist, planCtx] = await Promise.all([
    getCohortWaitlist(cohort_id),
    getRosterPlanContext(ctx.cohort.programme_id),
  ]);

  return (
    <EnrolmentRosterView
      scope={{ kind: 'COHORT', cohortId: cohort_id }}
      contextName={formatCohortName(ctx.cohort)}
      roster={roster}
      waitlist={waitlist}
      plans={planCtx.plans}
      currency={planCtx.currency}
    />
  );
}
