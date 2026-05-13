// mynclex/app/(app)/student/cohort/[cohort_id]/curriculum/page.tsx
//
// Slice 10.1 — student curriculum viewer (tutor-led delivery
// mode). Reads the cohort checklist via
// getStudentCohortCurriculum() — routes every activity through
// the cohort's inclusion flag + release date. Visibility filter:
// programme PUBLISHED → unit Live → block Live (if any) → activity
// Live AND checklist is_included AND release_date <= today.

import { notFound } from 'next/navigation';
import { StudentCurriculumViewer } from '@/lib/curriculum/student-viewer';
import { getStudentCohortCurriculum } from '@/lib/curriculum/student-queries';

export const dynamic = 'force-dynamic';

export default async function StudentCohortCurriculumPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;

  const tree = await getStudentCohortCurriculum(cohort_id);
  if (!tree) notFound();

  return <StudentCurriculumViewer tree={tree} />;
}
