// mynclex/app/(app)/tutor/library/page.tsx
//
// Tutor library home — slice 11.2a wired folder data, 11.2b added
// per-folder notes, 11.3a-b added shelves + the All Shelves
// carousel, 11.4 makes per-shelf URLs real.
//
// Server component. Reads two mutually-coordinated URL params:
//   • `?folder=` — folder lens scope
//       (none / all / <uuid> / unknown-uuid → "Folder not found")
//   • `?shelf=`  — shelf lens scope
//       (none / all → All Shelves carousel
//        / <uuid> → per-shelf detail view (11.4)
//        / unknown-uuid → "Shelf not found")
//
// When `?shelf=` is set it wins — the main pane shows a shelves
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
  getShelfDetail,
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

  // Three branches on the shelf scope:
  //   null     → sidebar lens only (cheap lean fetch)
  //   'all'    → carousel page (heavy fetch with note embeds)
  //   <uuid>   → per-shelf detail (single shelf + its notes)
  //
  // The sidebar lens always needs the lean shelf list with counts —
  // we fetch it unconditionally now. That's one cheap round trip
  // either way and avoids the "derive lean from heavy" branch the
  // 11.3b version carried.
  const carouselScope = shelfSelected === 'all';
  const detailScope = shelfSelected != null && shelfSelected !== 'all';

  const [folders, shelves, shelvesWithNotes, shelfDetail] = await Promise.all([
    getFoldersForTutor(),
    getShelvesForTutor(),
    carouselScope ? getShelvesWithNotes() : Promise.resolve(null),
    detailScope ? getShelfDetail(shelfSelected) : Promise.resolve(null),
  ]);

  // Notes only when a real folder is selected AND no shelf scope is
  // active. The shelf scope takes the main pane over wholesale.
  const shelfScopeActive = shelfSelected != null;
  const folderIsReal =
    !shelfScopeActive &&
    selected != null &&
    selected !== 'all' &&
    folders.some((f) => f.folder_id === selected);

  const notes = folderIsReal ? await getNotesForTutor(selected) : null;

  // Pre-fetch eligible-notes for the AddNotesToShelfModal.
  // Carousel — one entry per shelf.
  // Detail — one entry for the focused shelf (when it resolved).
  // Empty object otherwise to keep the prop shape stable.
  const eligibleByShelf: Record<string, LibraryEligibleNote[]> = {};
  if (carouselScope && shelvesWithNotes && shelvesWithNotes.length > 0) {
    const results = await Promise.all(
      shelvesWithNotes.map((s) => getEligibleNotesForShelf(s.shelf_id)),
    );
    shelvesWithNotes.forEach((s, i) => {
      eligibleByShelf[s.shelf_id] = results[i];
    });
  } else if (detailScope && shelfDetail) {
    eligibleByShelf[shelfDetail.shelf_id] = await getEligibleNotesForShelf(
      shelfDetail.shelf_id,
    );
  }

  return (
    <LibraryHomeShell
      folders={folders}
      shelves={shelves}
      shelvesWithNotes={shelvesWithNotes}
      shelfDetail={shelfDetail}
      eligibleByShelf={eligibleByShelf}
      notes={notes}
      selected={selected}
      shelfSelected={shelfSelected}
    />
  );
}
