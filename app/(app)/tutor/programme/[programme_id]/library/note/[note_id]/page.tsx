// mynclex/app/(app)/tutor/programme/[programme_id]/library/note/[note_id]/page.tsx
//
// The note read view inside the programme Library preview (tutor) — the
// read view a student opens, shown read-only. Sibling of the list page;
// both live under the programme's Library tab.
//
// Two gates: getProgrammeForShell proves the tutor owns the programme
// (RLS; null → 404), and getProgrammeNoteForRead proves the note is
// actually in THIS programme's library (published + entitled). The note
// body renders via the shared student RenderBlocks; the read view makes
// the stateful controls inert and embeds read-only.

import { notFound } from 'next/navigation';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getProgrammeNoteForRead } from '@/lib/library/programme/note-read-queries';
import { ProgrammeNoteReadView } from '@/lib/library/programme/programme-note-read-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ programme_id: string; note_id: string }>;
}

export default async function TutorProgrammeLibraryNotePage({
  params,
}: PageProps) {
  const { programme_id, note_id } = await params;

  const programme = await getProgrammeForShell(programme_id);
  if (!programme) notFound();

  const note = await getProgrammeNoteForRead(programme_id, note_id);
  if (!note) notFound();

  return (
    <ProgrammeNoteReadView
      note={note}
      basePath={`/tutor/programme/${programme_id}/library`}
      noteEditHref={`/tutor/library/note/${note_id}`}
    />
  );
}
