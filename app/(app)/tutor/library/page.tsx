// mynclex/app/(app)/tutor/library/page.tsx
//
// Tutor library home — slice 11.2a wired folder data, 11.2b added
// per-folder notes, 11.3a adds shelves.
//
// Server component. Reads two mutually-coordinated URL params:
//   • `?folder=`  — folder lens scope
//       (none / all / <uuid> / unknown-uuid → "Folder not found")
//   • `?shelf=`   — shelf lens scope
//       (none / all / <uuid>; 11.3a routes all per-shelf to 'all',
//        the per-shelf detail view ships in 11.4)
//
// When `?shelf=` is set it wins — the main pane shows the shelves
// surface regardless of `?folder=`. The sidebar still renders both
// lenses fully (folder rows + shelf rows + counts), so the user can
// pivot back to a folder via a single click.
//
// Auth: gated by (app)/tutor/layout.tsx which enforces TUTOR role.

import { LibraryHomeShell } from '@/lib/library/home-shell';
import {
  getFoldersForTutor,
  getNotesForTutor,
  getShelvesForTutor,
} from '@/lib/library/queries';

interface PageProps {
  // Next.js 16: searchParams is a Promise on server components.
  searchParams: Promise<{
    folder?: string | string[];
    shelf?: string | string[];
  }>;
}

function firstOrNull(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export default async function TutorLibraryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selected = firstOrNull(params.folder);
  const shelfSelected = firstOrNull(params.shelf);

  // Folders + shelves always — both lenses render their rows in the
  // sidebar regardless of which scope the main pane is showing. Run
  // them in parallel to keep TTFB tight.
  const [folders, shelves] = await Promise.all([
    getFoldersForTutor(),
    getShelvesForTutor(),
  ]);

  // Notes only when a real folder is selected AND no shelf scope is
  // active. The shelf scope (?shelf=...) takes the main pane over
  // wholesale in 11.3a — the per-folder notes list isn't visible
  // there, so skip the fetch.
  const folderIsReal =
    shelfSelected == null &&
    selected != null &&
    selected !== 'all' &&
    folders.some((f) => f.folder_id === selected);

  const notes = folderIsReal ? await getNotesForTutor(selected) : null;

  return (
    <LibraryHomeShell
      folders={folders}
      shelves={shelves}
      notes={notes}
      selected={selected}
      shelfSelected={shelfSelected}
    />
  );
}
