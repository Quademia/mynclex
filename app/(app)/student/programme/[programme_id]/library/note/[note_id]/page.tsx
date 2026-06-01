// mynclex/app/(app)/student/programme/[programme_id]/library/note/[note_id]/page.tsx
//
// Slice 11.13a — student note read view (self-paced programme route).
// Auth + enrolment gated by the programme layout; note visibility is
// enforced by RLS inside getStudentNoteForRead (a note the student
// can't see → null → 404). The cohort route is the tutor-led sibling.

import { notFound } from 'next/navigation';
import { getStudentNoteForRead } from '@/lib/library/student/note-read-queries';
import { ReadNoteView } from '@/lib/library/student/read-note-view';

export const dynamic = 'force-dynamic';

export default async function StudentProgrammeNoteReadPage({
  params,
}: {
  params: Promise<{ programme_id: string; note_id: string }>;
}) {
  const { programme_id, note_id } = await params;

  const note = await getStudentNoteForRead(note_id);
  if (!note) notFound();

  return (
    <ReadNoteView
      note={note}
      basePath={`/student/programme/${programme_id}/library`}
    />
  );
}
