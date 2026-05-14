// mynclex/app/(app)/tutor/cohort/[cohort_id]/curriculum/page.tsx
//
// Cohort Curriculum tab. Renders the cohort's checklist — every
// template activity with the cohort's inclusion + release-date
// controls overlaid. Slice 9.3f.

import { notFound } from 'next/navigation';
import { getCohortChecklist } from '@/lib/cohorts/queries';
import { CohortCurriculum } from '@/lib/cohorts/cohort-curriculum';

export const dynamic = 'force-dynamic';

export default async function CohortCurriculumPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  const tree = await getCohortChecklist(cohort_id);
  if (!tree) notFound();

  return (
    <div className="cohort-page">
      <CohortCurriculum tree={tree} />
    </div>
  );
}
