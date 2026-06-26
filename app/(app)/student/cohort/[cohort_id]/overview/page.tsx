// mynclex/app/(app)/student/cohort/[cohort_id]/overview/page.tsx
//
// Student Overview — tutor-led cohort home (2026-06). The landing surface
// (the cohort index redirects here). STUDENT role + cohort enrolment are
// gated by the cohort layout (StudentCohortShell → requireStudentCohortAccess)
// before this runs.

import { notFound } from 'next/navigation';
import { getStudentCohortOverview } from '@/lib/home/student/overview-queries';
import { StudentOverview } from '@/lib/home/student/student-overview';

export const dynamic = 'force-dynamic';

export default async function StudentCohortOverviewPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  const data = await getStudentCohortOverview(cohort_id);
  if (!data) notFound();

  return <StudentOverview data={data} />;
}
