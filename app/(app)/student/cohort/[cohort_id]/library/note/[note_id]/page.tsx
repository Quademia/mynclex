// mynclex/app/(app)/student/cohort/[cohort_id]/library/note/[note_id]/page.tsx
//
// Slice 11.13a — student note read view (tutor-led cohort route). Same
// read view as the programme route; only the basePath (back link) and
// the gating layout differ. Note visibility is enforced by RLS inside
// getStudentNoteForRead.

import { notFound } from 'next/navigation';
import { getStudentNoteForRead } from '@/lib/library/student/note-read-queries';
import { ReadNoteView } from '@/lib/library/student/read-note-view';

export const dynamic = 'force-dynamic';

export default async function StudentCohortNoteReadPage({
  params,
}: {
  params: Promise<{ cohort_id: string; note_id: string }>;
}) {
  const { cohort_id, note_id } = await params;

  const note = await getStudentNoteForRead(note_id);
  if (!note) notFound();

  return (
    <ReadNoteView
      note={note}
      basePath={`/student/cohort/${cohort_id}/library`}
    />
  );
}
