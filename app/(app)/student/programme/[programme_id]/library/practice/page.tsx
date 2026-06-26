// mynclex/app/(app)/student/programme/[programme_id]/library/practice/page.tsx
//
// "My practice" (Slice 1) for a SELF-PACED programme — the practice-first
// reflection over the embedded questions in this library's notes. Auth +
// enrolment are gated by the programme layout (same chain as the library
// front door); this page resolves the index and renders the shared view.

import { notFound } from 'next/navigation';
import { getStudentPracticeIndexForProgramme } from '@/lib/library/student/practice-queries';
import { PracticeIndexView } from '@/lib/library/student/practice-index-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ programme_id: string }>;
}

export default async function StudentProgrammePracticePage({ params }: PageProps) {
  const { programme_id } = await params;

  const index = await getStudentPracticeIndexForProgramme(programme_id);
  if (!index) notFound();

  return (
    <PracticeIndexView
      index={index}
      basePath={`/student/programme/${programme_id}/library`}
    />
  );
}
