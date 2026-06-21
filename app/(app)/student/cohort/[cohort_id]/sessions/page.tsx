// mynclex/app/(app)/student/cohort/[cohort_id]/sessions/page.tsx
//
// Slice 3b — the student "My sessions" page (tutor-led cohorts only). The
// read-only personalised mirror of the tutor Sessions tab: the student's
// own live sessions across the cohort (upcoming + past + their attendance
// record + streak), reading the per-cohort planner + their own attendance
// rows. STUDENT role + enrolment are gated by the cohort layout
// (StudentCohortShell → requireStudentCohortAccess).

import { notFound } from 'next/navigation';
import { getStudentCohortSessions } from '@/lib/cohorts/student/queries';
import { StudentSessionsView } from '@/lib/cohorts/student/student-sessions-view';

export const dynamic = 'force-dynamic';

export default async function StudentCohortSessionsPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  const data = await getStudentCohortSessions(cohort_id);
  if (!data) notFound();

  return <StudentSessionsView data={data} />;
}
