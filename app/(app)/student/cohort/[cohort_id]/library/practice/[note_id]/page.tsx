// mynclex/app/(app)/student/cohort/[cohort_id]/library/practice/[note_id]/page.tsx
//
// "My practice" — per-note reflection (Slice 2) for a TUTOR-LED cohort.
// Gated by the cohort layout (same chain as the library).

import { notFound } from 'next/navigation';
import { getStudentPracticeNote } from '@/lib/library/student/practice-queries';
import { PracticeNoteView } from '@/lib/library/student/practice-note-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ cohort_id: string; note_id: string }>;
}

export default async function StudentCohortPracticeNotePage({
  params,
}: PageProps) {
  const { cohort_id, note_id } = await params;

  const note = await getStudentPracticeNote(note_id);
  if (!note) notFound();

  return (
    <PracticeNoteView
      note={note}
      basePath={`/student/cohort/${cohort_id}/library`}
    />
  );
}
