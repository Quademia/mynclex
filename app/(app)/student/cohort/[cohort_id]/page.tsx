// mynclex/app/(app)/student/cohort/[cohort_id]/page.tsx
//
// Landing on a cohort without a sub-route sends the student to the
// curriculum tab. Curriculum is the only tab in 10.1; additional
// surfaces (sessions, tasks, announcements) ship later.

import { redirect } from 'next/navigation';

export default async function StudentCohortIndexPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  redirect(`/student/cohort/${cohort_id}/curriculum`);
}
