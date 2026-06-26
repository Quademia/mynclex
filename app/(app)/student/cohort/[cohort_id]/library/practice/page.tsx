// mynclex/app/(app)/student/cohort/[cohort_id]/library/practice/page.tsx
//
// "My practice" (Slice 1) for a TUTOR-LED cohort — the tutor-led sibling
// of the programme practice page. Resolves the cohort's tutor, then
// renders the same shared view. Auth + enrolment are gated by the cohort
// layout (same chain as the library front door).

import { notFound } from 'next/navigation';
import { getStudentPracticeIndexForCohort } from '@/lib/library/student/practice-queries';
import { PracticeIndexView } from '@/lib/library/student/practice-index-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ cohort_id: string }>;
}

export default async function StudentCohortPracticePage({ params }: PageProps) {
  const { cohort_id } = await params;

  const index = await getStudentPracticeIndexForCohort(cohort_id);
  if (!index) notFound();

  return (
    <PracticeIndexView
      index={index}
      basePath={`/student/cohort/${cohort_id}/library`}
    />
  );
}
