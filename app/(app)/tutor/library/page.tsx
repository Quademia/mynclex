// mynclex/app/(app)/tutor/library/page.tsx
//
// Tutor library home — composes folder / shelf / view / overview
// scopes onto a single route.
//
// Server component. Reads three mutually-coordinated URL params:
//   • `?folder=` — folder lens scope
//       (none / all / <uuid> / unknown-uuid → "Folder not found")
//   • `?shelf=`  — shelf lens scope
//       (none / all → All Shelves carousel
//        / <uuid> → per-shelf detail view (11.4)
//        / unknown-uuid → "Shelf not found")
//   • `?view=`   — system view scope (slice 11.4 follow-on P2)
//       (none / all-notes / drafts / used-nowhere)
//
// Precedence when more than one is set:
//   shelf > view > folder > none(=overview)
//
// The sidebar always renders all five lenses with real counts.
//
// Auth: gated by (app)/tutor/layout.tsx which enforces TUTOR role.

import { LibraryHomeShell } from '@/lib/library/home-shell';
import {
  getEligibleNotesForShelf,
  getFoldersForTutor,
  getLibraryLensCounts,
  getLibraryOverviewStats,
  getNotesForTutor,
  getNotesForView,
  getShelfDetail,
  getShelvesForTutor,
  getShelvesWithNotes,
} from '@/lib/library/queries';
import type {
  LibraryEligibleNote,
  LibraryViewKey,
} from '@/lib/library/types';

interface PageProps {
  // Next.js 16: searchParams is a Promise on server components.
  searchParams: Promise<{
    folder?: string | string[];
    shelf?: string | string[];
    view?: string | string[];
  }>;
}

function firstOrNull(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

function parseViewKey(raw: string | null): LibraryViewKey | null {
  if (raw === 'all-notes' || raw === 'drafts' || raw === 'used-nowhere') {
    return raw;
  }
  return null;
}

export default async function TutorLibraryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selected = firstOrNull(params.folder);
  const shelfSelected = firstOrNull(params.shelf);
  const viewSelected = parseViewKey(firstOrNull(params.view));

  // Branch dispatch — precedence: shelf > view > folder > none(overview).
  // Lens counts always fetched so the sidebar lights up regardless
  // of scope.
  const carouselScope = shelfSelected === 'all';
  const detailScope = shelfSelected != null && shelfSelected !== 'all';
  const viewScope = shelfSelected == null && viewSelected != null;
  const folderScope =
    shelfSelected == null && viewSelected == null && selected != null;
  const overviewScope =
    shelfSelected == null && viewSelected == null && selected == null;

  const [
    folders,
    shelves,
    shelvesWithNotes,
    shelfDetail,
    viewNotes,
    overviewStats,
    lensCounts,
  ] = await Promise.all([
    getFoldersForTutor(),
    getShelvesForTutor(),
    carouselScope ? getShelvesWithNotes() : Promise.resolve(null),
    detailScope ? getShelfDetail(shelfSelected) : Promise.resolve(null),
    viewScope ? getNotesForView(viewSelected) : Promise.resolve(null),
    overviewScope ? getLibraryOverviewStats() : Promise.resolve(null),
    getLibraryLensCounts(),
  ]);

  // Folder list — only when a real folder is selected. The
  // overview / view / shelf scopes take the main pane over wholesale.
  const folderIsReal =
    folderScope &&
    selected != null &&
    selected !== 'all' &&
    folders.some((f) => f.folder_id === selected);

  const notes = folderIsReal ? await getNotesForTutor(selected) : null;

  // Pre-fetch eligible-notes for the AddNotesToShelfModal.
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
      viewSelected={viewSelected}
      viewNotes={viewNotes}
      viewCounts={lensCounts.view}
      pillarCounts={lensCounts.pillars}
      overviewStats={overviewStats}
    />
  );
}
