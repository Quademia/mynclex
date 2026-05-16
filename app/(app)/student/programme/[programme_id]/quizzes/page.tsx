// mynclex/app/(app)/student/programme/[programme_id]/quizzes/page.tsx
//
// Student Quizzes — Tutor Quiz Slice 6 (§9.5). Lists every quiz in
// the programme's `nclex_programme_quizzes` junction with progress
// state + launch affordance. Self-paced delivery: reads programme
// directly. Cohort variant (tutor-led) lives at
// /student/cohort/[id]/quizzes and resolves to its parent programme.

import { getStudentProgrammeQuizzes } from '@/lib/student-quizzes/queries';
import { StudentQuizzesView } from '@/lib/student-quizzes/student-quizzes-view';

export const dynamic = 'force-dynamic';

export default async function StudentProgrammeQuizzesPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  // RLS on the junction's student SELECT policy gates by parent
  // PUBLISHED programme. Empty list = "no quizzes attached" OR
  // "programme not visible to this student." Both surface as the
  // empty state — Slice 6 doesn't try to distinguish them (the
  // student doesn't need to).
  const rows = await getStudentProgrammeQuizzes(programme_id);

  return <StudentQuizzesView programmeId={programme_id} rows={rows} />;
}
