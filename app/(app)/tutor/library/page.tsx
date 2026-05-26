// mynclex/app/(app)/tutor/library/page.tsx
//
// Tutor library home — slice 11.2a wired folder data, 11.2b adds
// the per-folder notes fetch + the `+ New note` modal-first flow.
//
// Server component. Reads `?folder=` to decide what to fetch:
//   • no `?folder=`                — folders only (empty-state hero)
//   • `?folder=all`                — folders only (cards grid)
//   • `?folder=<uuid>`             — folders + that folder's notes
//   • `?folder=<bad-uuid>`         — folders only (home-shell renders
//                                    "Folder not found")
//
// Auth: gated by (app)/tutor/layout.tsx which enforces TUTOR role.

import { LibraryHomeShell } from '@/lib/library/home-shell';
import {
  getFoldersForTutor,
  getNotesForTutor,
} from '@/lib/library/queries';

interface PageProps {
  // Next.js 16: searchParams is a Promise on server components.
  searchParams: Promise<{ folder?: string | string[] }>;
}

export default async function TutorLibraryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.folder;
  const selected =
    typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? null) : null;

  // Folders always — needed for the sidebar lens regardless of view.
  const folders = await getFoldersForTutor();

  // Notes only when a real folder is selected. 'all' = no per-folder
  // notes fetch (the cards grid doesn't list notes). Unknown ids
  // also skip the fetch — the home shell renders "Folder not found"
  // when `selected` doesn't match.
  const folderIsReal =
    selected != null &&
    selected !== 'all' &&
    folders.some((f) => f.folder_id === selected);

  const notes = folderIsReal ? await getNotesForTutor(selected) : null;

  return (
    <LibraryHomeShell folders={folders} notes={notes} selected={selected} />
  );
}
