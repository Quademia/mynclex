// mynclex/app/(app)/tutor/cohort/[cohort_id]/students/page.tsx
//
// Cohort Students tab (Slice 1b). Roster of enrolled students +
// off-platform "Add student". Ownership is gated inside both reads
// (RLS-scoped); either returning null → 404.

import { notFound } from 'next/navigation';
import { getCohortForShell } from '@/lib/cohorts/queries';
import { formatCohortName } from '@/lib/cohorts/format';
import { getCohortRoster, getCohortWaitlist } from '@/lib/enrolments/queries';
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
  const waitlist = await getCohortWaitlist(cohort_id);

  return (
    <EnrolmentRosterView
      cohortId={cohort_id}
      cohortName={formatCohortName(ctx.cohort)}
      roster={roster}
      waitlist={waitlist}
    />
  );
}
