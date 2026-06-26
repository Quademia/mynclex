// mynclex/app/(app)/student/programme/[programme_id]/library/practice/[note_id]/page.tsx
//
// "My practice" — per-note reflection (Slice 2) for a SELF-PACED
// programme. Gated by the programme layout (same chain as the library).

import { notFound } from 'next/navigation';
import { getStudentPracticeNote } from '@/lib/library/student/practice-queries';
import { PracticeNoteView } from '@/lib/library/student/practice-note-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ programme_id: string; note_id: string }>;
}

export default async function StudentProgrammePracticeNotePage({
  params,
}: PageProps) {
  const { programme_id, note_id } = await params;

  const note = await getStudentPracticeNote(note_id);
  if (!note) notFound();

  return (
    <PracticeNoteView
      note={note}
      basePath={`/student/programme/${programme_id}/library`}
    />
  );
}
