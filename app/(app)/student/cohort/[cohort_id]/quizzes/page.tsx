// mynclex/app/(app)/student/cohort/[cohort_id]/quizzes/page.tsx
//
// Tutor-led variant of the student Quizzes page (Tutor Quiz
// Slice 6, §9.5). Resolves the cohort's parent programme and
// renders the same view component as the self-paced route.
// Cohort-level divergence (per-cohort overrides / cohort-unique
// quizzes) is deliberately deferred (§9.9 — three options
// captured, decision deferred to its own build slice).

import { notFound } from 'next/navigation';
import { getStudentCohortQuizzes } from '@/lib/student-quizzes/queries';
import { StudentQuizzesView } from '@/lib/student-quizzes/student-quizzes-view';

export const dynamic = 'force-dynamic';

export default async function StudentCohortQuizzesPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;

  const result = await getStudentCohortQuizzes(cohort_id);
  if (!result) notFound();

  return (
    <StudentQuizzesView
      programmeId={result.programmeId}
      rows={result.rows}
    />
  );
}
