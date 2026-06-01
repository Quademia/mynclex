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
import { getEmbedCaps } from '@/lib/library/embed-actions';

interface PageProps {
  params: Promise<{ note_id: string }>;
}

export default async function TutorLibraryNoteEditorPage({ params }: PageProps) {
  const { note_id } = await params;

  // Fetch the note, the folder list, the tutor's programmes, and the
  // embed caps in parallel. Folders feed the reparent picker;
  // programmes feed the Publish dialog (slice 11.10); the embed caps
  // (admin-tunable via nclex_config — slice 11.15e) drive the
  // embedded-questions block limits.
  const [note, folders, programmes, embedCaps] = await Promise.all([
    getNoteForEdit(note_id),
    getFoldersForTutor(),
    getTutorProgrammesForPicker(),
    getEmbedCaps(),
  ]);

  if (!note) notFound();

  return (
    <NoteEditor
      note={note}
      folders={folders}
      programmes={programmes}
      embedMaxPerBlock={embedCaps.maxPerBlock}
      embedMaxBlocks={embedCaps.maxBlocks}
    />
  );
}
