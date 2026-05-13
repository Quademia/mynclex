// mynclex/app/(app)/student/programme/[programme_id]/curriculum/page.tsx
//
// Slice 10.1 — student curriculum viewer (self-paced delivery
// mode). Reads the programme template directly via
// getStudentSelfPacedCurriculum() — no cohort layer, no release
// dates, no checklist. Visibility filter: programme PUBLISHED →
// unit Live → block Live (if any) → activity Live.
//
// For TUTOR_LED programmes accessed via this route the same query
// runs; the student sees the template at face value (no release-
// date gating). That's intentional permissive-testing behaviour
// in v1 — in production the access helpers + enrolment will route
// tutor-led students to /student/cohort/[id]/curriculum.

import { notFound } from 'next/navigation';
import { StudentCurriculumViewer } from '@/lib/curriculum/student-viewer';
import { getStudentSelfPacedCurriculum } from '@/lib/curriculum/student-queries';

export const dynamic = 'force-dynamic';

export default async function StudentProgrammeCurriculumPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  const tree = await getStudentSelfPacedCurriculum(programme_id);
  if (!tree) notFound();

  return <StudentCurriculumViewer tree={tree} />;
}
