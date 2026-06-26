// mynclex/app/(app)/student/cohort/[cohort_id]/page.tsx
//
// Landing on a cohort without a sub-route sends the student to the
// Overview home (the mode-aware programme/cohort dashboard, 2026-06).
// Was → /curriculum before the Overview surface existed.

import { redirect } from 'next/navigation';

export default async function StudentCohortIndexPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  redirect(`/student/cohort/${cohort_id}/overview`);
}
