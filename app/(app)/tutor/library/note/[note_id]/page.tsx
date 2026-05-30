// mynclex/app/(app)/tutor/library/note/[note_id]/page.tsx
//
// Editor route for a single library note (slice 11.2b). Server
// component fetches the note + the tutor's folders (needed for the
// reparent picker), then hands off to <NoteEditor> client-side.
//
// RLS scopes the note read to the signed-in tutor — `getNoteForEdit`
// returns null on both "doesn't exist" and "not yours," which we
// surface as a Next.js 404.
//
// Layout inheritance: this route lives under the existing
// (app)/tutor/layout.tsx + tutor/library/layout.tsx chain, so the
// global tutor sidebar + topbar render around the editor. The
// editor's own toolbar + grid sit inside that chrome.

import { notFound } from 'next/navigation';
import { NoteEditor } from '@/lib/library/note-editor';
import {
  getFoldersForTutor,
  getNoteForEdit,
  getTutorProgrammesForPicker,
} from '@/lib/library/queries';

interface PageProps {
  params: Promise<{ note_id: string }>;
}

export default async function TutorLibraryNoteEditorPage({ params }: PageProps) {
  const { note_id } = await params;

  // Fetch the note, the folder list and the tutor's programmes in
  // parallel. Folders feed the reparent picker; programmes feed the
  // Publish dialog's programme-scope checklist (slice 11.10).
  const [note, folders, programmes] = await Promise.all([
    getNoteForEdit(note_id),
    getFoldersForTutor(),
    getTutorProgrammesForPicker(),
  ]);

  if (!note) notFound();

  return <NoteEditor note={note} folders={folders} programmes={programmes} />;
}
