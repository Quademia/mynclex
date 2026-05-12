// mynclex/app/(app)/tutor/cohort/[cohort_id]/page.tsx
//
// Cohort root — redirects to /overview. The Overview tab is the
// natural landing point when a tutor clicks into a cohort.

import { redirect } from 'next/navigation';

export default async function TutorCohortRootPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  redirect(`/tutor/cohort/${cohort_id}/overview`);
}
