// mynclex/app/(app)/tutor/programme/[programme_id]/quizzes/page.tsx
//
// Programme Quizzes tab — Tutor Quiz Slice 5 (§9.4). Lists every
// quiz attached to this programme via the junction. Two add
// paths from the page header (Add existing picker / New quiz
// create-and-attach); per-row Remove subject to the §9.3 block
// rule.
//
// Programme-scope ownership is enforced by RLS on the junction +
// nclex_programmes. The page's null-programme branch covers the
// "doesn't exist OR not yours" case generically.

import { notFound } from 'next/navigation';
import { getOwnedProgrammeForShell } from '@/lib/programmes/queries';
import {
  getEligiblePickerQuizzes,
  getProgrammeQuizzes,
} from '@/lib/programme-quizzes/queries';
import { ProgrammeQuizzesView } from '@/lib/programme-quizzes/programme-quizzes-view';

export const dynamic = 'force-dynamic';

export default async function ProgrammeQuizzesPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  const programme = await getOwnedProgrammeForShell(programme_id);
  if (!programme) notFound();

  // Server-fetched in parallel — both are small queries.
  const [quizzes, pickerCandidates] = await Promise.all([
    getProgrammeQuizzes(programme_id),
    getEligiblePickerQuizzes(programme_id),
  ]);

  return (
    <ProgrammeQuizzesView
      programmeId={programme.programme_id}
      programmeTitle={programme.title}
      quizzes={quizzes}
      pickerCandidates={pickerCandidates}
    />
  );
}
