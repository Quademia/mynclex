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
  getEligibleNotesForShelf,
  getFoldersForTutor,
  getNotesForTutor,
  getShelvesForTutor,
  getShelvesWithNotes,
} from '@/lib/library/queries';
import type { LibraryEligibleNote } from '@/lib/library/types';

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

  // Folders always — needed for the sidebar lens + the picker's
  // folder filter dropdown. Shelves: when the shelf scope is active,
  // fetch the carousel-shape projection (members embedded); otherwise
  // the lean sidebar-only projection. Sidebar lens always uses the
  // lean version's counts so swap the projection for the sidebar
  // when we have the rich one.
  const shelfScopeActive = shelfSelected != null;
  const [folders, shelvesForCarousel, shelvesLean] = await Promise.all([
    getFoldersForTutor(),
    shelfScopeActive ? getShelvesWithNotes() : Promise.resolve(null),
    shelfScopeActive ? Promise.resolve(null) : getShelvesForTutor(),
  ]);

  // Sidebar lens needs the lean shape (LibraryShelfWithCount). The
  // rich carousel projection is a superset, so we can derive the
  // lean version from it when needed.
  const shelves =
    shelvesLean ??
    (shelvesForCarousel ?? []).map(({ notes: _notes, ...rest }) => {
      void _notes;
      return rest;
    });

  // Notes only when a real folder is selected AND no shelf scope is
  // active. The shelf scope takes the main pane over wholesale.
  const folderIsReal =
    !shelfScopeActive &&
    selected != null &&
    selected !== 'all' &&
    folders.some((f) => f.folder_id === selected);

  const notes = folderIsReal ? await getNotesForTutor(selected) : null;

  // Pre-fetch eligible-notes per shelf for the AddNotesToShelfModal
  // (so opening the dialog is instant). Only fires when the shelf
  // scope is active — empty object otherwise to keep the prop shape
  // stable.
  const eligibleByShelf: Record<string, LibraryEligibleNote[]> = {};
  if (shelvesForCarousel && shelvesForCarousel.length > 0) {
    const results = await Promise.all(
      shelvesForCarousel.map((s) => getEligibleNotesForShelf(s.shelf_id)),
    );
    shelvesForCarousel.forEach((s, i) => {
      eligibleByShelf[s.shelf_id] = results[i];
    });
  }

  return (
    <LibraryHomeShell
      folders={folders}
      shelves={shelves}
      shelvesWithNotes={shelvesForCarousel}
      eligibleByShelf={eligibleByShelf}
      notes={notes}
      selected={selected}
      shelfSelected={shelfSelected}
    />
  );
}
