'use client';

// mynclex/lib/library/home-shell.tsx
//
// Tutor library home shell. Renders the page frame: title +
// toolbar + (sidebar + main pane).
//
// Slice 11.1b shipped this as chrome-only (no data calls). Slice
// 11.2a wires it to real folder data:
//   • Folders lens — real rows from `nclex_tutor_library_folders`
//     via the `folders` prop. URL-driven selection (`?folder=...`).
//   • Toolbar `+ New folder` opens the new-folder modal.
//   • Main pane branches on `selected`:
//       null     → EmptyState (no folder picked)
//       'all'    → AllFoldersGrid
//       <uuid>   → folder selected, but notes aren't built yet —
//                  shows a "this folder is empty" placeholder until
//                  slice 11.2b lands.
//
// Notes / shelves / search remain static placeholders until their
// own slices (11.2b, 11.3+, 11.16).
//
// State held client-side:
//   • `railed`        — whole sidebar collapsed to a 48 px icon strip.
//                       Persisted in localStorage.
//   • `closedSections`— per-lens-section open/closed (chevron toggle).
//                       Persisted in localStorage.
//   • `newFolderOpen` — modal open state.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FolderRows } from './folder-rows';
import { ShelfRows } from './shelf-rows';
import { AllFoldersGrid } from './all-folders-grid';
import { AllShelvesCarousel } from './all-shelves-carousel';
import { LibraryOverview } from './library-overview';
import { LibrarySearchBox } from './library-search-box';
import { NewFolderModal } from './new-folder-modal';
import { NewShelfModal } from './new-shelf-modal';
import { NewNoteModal } from './new-note-modal';
import { NotesList } from './notes-list';
import { NotesView } from './notes-view';
import { SearchResults } from './search-results';
import { ShelfDetail, ShelfNotFound } from './shelf-detail';
import type {
  LibraryEligibleNote,
  LibraryFolderWithCount,
  LibraryNoteLensRow,
  LibraryNoteListRow,
  LibraryOverviewStats,
  LibrarySearchFieldFlags,
  LibraryShelfDetail,
  LibraryShelfWithCount,
  LibraryShelfWithNotes,
  LibraryViewCounts,
  LibraryViewKey,
  NclexPillar,
} from './types';

const LS_RAILED = 'mynclex.library.home.railed';
const LS_SECTIONS = 'mynclex.library.home.sections';

type LensKey = 'views' | 'folders' | 'shelves' | 'pillars' | 'tags';

const ALL_SECTIONS: LensKey[] = [
  'views',
  'folders',
  'shelves',
  'pillars',
  'tags',
];

// Section-level icon used in the railed (collapsed) sidebar.
// Single Unicode glyphs are fine for a v1 chrome — we can swap in
// real SVG icons once the lens entries gain richer affordances.
const SECTION_RAIL_GLYPH: Record<LensKey, string> = {
  views: '☰',
  folders: '📁',
  shelves: '📚',
  pillars: '◆',
  tags: '#',
};

const SECTION_LABEL: Record<LensKey, string> = {
  views: 'Views',
  folders: 'Folders',
  shelves: 'Shelves',
  pillars: 'Pillars',
  tags: 'Tags',
};

// The 8 NCLEX-RN Client Needs sub-categories, full NCSBN names. Must
// match the `nclex_pillar` domain in db/migrations/20260616120000_*.sql.
const PILLAR_NAMES: string[] = [
  'Management of Care',
  'Safety and Infection Control',
  'Health Promotion and Maintenance',
  'Psychosocial Integrity',
  'Basic Care and Comfort',
  'Pharmacological and Parenteral Therapies',
  'Reduction of Risk Potential',
  'Physiological Adaptation',
];

interface LibraryHomeShellProps {
  /** All folders owned by the signed-in tutor, ordered by `position`. */
  folders: LibraryFolderWithCount[];
  /** Lean shelf projection — used by the sidebar lens for counts. */
  shelves: LibraryShelfWithCount[];
  /**
   * Rich shelf projection with members embedded — non-null only when
   * the carousel scope (`?shelf=all`) is active. The main pane uses
   * this to render the Spotify-style carousels in 11.3b.
   */
  shelvesWithNotes: LibraryShelfWithNotes[] | null;
  /**
   * Single-shelf detail projection — non-null when the per-shelf
   * scope (`?shelf=<uuid>`) is active AND the shelf was found.
   * `null` when the URL points at a stale / cross-tutor uuid; the
   * main pane renders `<ShelfNotFound>` in that case.
   */
  shelfDetail: LibraryShelfDetail | null;
  /**
   * Pre-fetched eligible-notes per shelf for the
   * AddNotesToShelfModal. Non-empty only when a shelf scope is
   * active. Keyed by shelf_id.
   */
  eligibleByShelf: Record<string, LibraryEligibleNote[]>;
  /**
   * Notes in the currently-selected folder, or null when no folder
   * is selected (the home empty-state doesn't list any notes). When
   * `selected === 'all'` the parent route doesn't fetch notes either
   * — the all-folders grid is folder-scoped, not note-scoped.
   */
  notes: LibraryNoteListRow[] | null;
  /** The current `?folder=` URL value — null = nothing selected. */
  selected: string | null;
  /** The current `?shelf=` URL value — null = no shelf scope active. */
  shelfSelected: string | null;
  /** The current `?view=` URL value — null = no view scope active. */
  viewSelected: LibraryViewKey | null;
  /**
   * Lens-row data for the active view (when `viewSelected != null`).
   * Empty array when the filter happens to match no notes.
   */
  viewNotes: LibraryNoteLensRow[] | null;
  /**
   * Counts for the Views lens entries — drives the count chips on
   * All notes / Drafts / Used nowhere. Always present.
   */
  viewCounts: LibraryViewCounts;
  /**
   * Counts for the Pillars lens entries — drives the count chips on
   * each of the 8 NCLEX pillars. Always present (zero for unseeded
   * pillars).
   */
  pillarCounts: Record<NclexPillar, number>;
  /**
   * Overview dashboard data — non-null only when no scope is
   * active (`/tutor/library` with no query params). Drives stat
   * cards + recent activity + pillar coverage + quick links.
   */
  overviewStats: LibraryOverviewStats | null;
  /**
   * The active search term — non-null only when `?q=` is set. When
   * non-null, the search-results pane takes the main pane over
   * (top precedence, ahead of every other scope).
   */
  searchQuery: string | null;
  /** Current per-field search scope (Title / Subtitle / Description /
   *  Body). Seeds the toolbar field chips; all-on by default. */
  searchFields: LibrarySearchFieldFlags;
  /**
   * Ranked search results for `searchQuery` (null when not
   * searching). Ordered title-matches-first by the server RPC.
   */
  searchNotes: LibraryNoteLensRow[] | null;
}

export function LibraryHomeShell({
  folders,
  shelves,
  shelvesWithNotes,
  shelfDetail,
  eligibleByShelf,
  notes,
  selected,
  shelfSelected,
  viewSelected,
  viewNotes,
  viewCounts,
  pillarCounts,
  overviewStats,
  searchQuery,
  searchFields,
  searchNotes,
}: LibraryHomeShellProps) {
  // Default to expanded + all sections open. localStorage rehydration
  // happens in a useEffect (so first paint is consistent across
  // server + client; no hydration mismatch).
  const [railed, setRailed] = useState(false);
  const [closedSections, setClosedSections] = useState<Set<LensKey>>(
    () => new Set(),
  );
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newShelfOpen, setNewShelfOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);

  useEffect(() => {
    try {
      const r = window.localStorage.getItem(LS_RAILED);
      if (r === '1') setRailed(true);
      const s = window.localStorage.getItem(LS_SECTIONS);
      if (s) {
        const parsed = JSON.parse(s) as LensKey[];
        if (Array.isArray(parsed)) setClosedSections(new Set(parsed));
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleRailed() {
    setRailed((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(LS_RAILED, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleSection(key: LensKey) {
    setClosedSections((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(
          LS_SECTIONS,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function openNewFolder() {
    setNewFolderOpen(true);
  }

  function openNewShelf() {
    setNewShelfOpen(true);
  }

  function openNewNote() {
    setNewNoteOpen(true);
  }

  // The default folder when the new-note modal opens: whichever
  // folder is currently selected (when `selected` is a real uuid),
  // else null (root). 'all' is treated as "no preference."
  const newNoteDefaultFolder =
    selected && selected !== 'all'
      ? folders.some((f) => f.folder_id === selected)
        ? selected
        : null
      : null;

  // Resolve the selected folder (when ?folder=<uuid>) for the
  // empty-folder placeholder in the main pane.
  const selectedFolder =
    selected && selected !== 'all'
      ? folders.find((f) => f.folder_id === selected) ?? null
      : null;

  // Overview is the bare-URL destination — no scope set at all (and
  // not while searching, which takes the pane over).
  const isOverviewActive =
    searchQuery == null &&
    selected == null &&
    shelfSelected == null &&
    viewSelected == null;

  return (
    <div className="lib-page">
      <header className="lib-page-head">
        <div>
          <h1 className="lib-page-title">Library</h1>
          <p className="lib-page-subtitle">
            Your reusable teaching notes — author once, reuse across
            cohorts and programmes.
          </p>
        </div>
      </header>

      <div className="lib-toolbar">
        <LibrarySearchBox
          initialQuery={searchQuery ?? ''}
          initialFields={searchFields}
        />
        <button className="lib-btn" type="button" onClick={openNewFolder}>
          + New folder
        </button>
        <button className="lib-btn" type="button" onClick={openNewShelf}>
          + New shelf
        </button>
        <button
          className="lib-btn lib-btn-primary"
          type="button"
          onClick={openNewNote}
        >
          + New note
        </button>
      </div>

      <div className={`lib-body${railed ? ' is-railed' : ''}`}>
        <aside
          className={`lens-side${railed ? ' is-railed' : ''}`}
          aria-label="Library lenses"
        >
          <button
            className="lens-rail-toggle"
            onClick={toggleRailed}
            aria-label={railed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={railed ? 'Expand sidebar' : 'Collapse to icon rail'}
          >
            {railed ? '»' : '«'}
          </button>

          {/* Overview / Home entry sits above the lens sections —
              distinct from any lens. Active when no scope is set;
              railed mode shows just the 🏠 glyph with a native
              tooltip. */}
          <Link
            href="/tutor/library"
            className={`lens-home${isOverviewActive ? ' is-active' : ''}`}
            aria-current={isOverviewActive ? 'page' : undefined}
            title={railed ? 'Overview' : undefined}
          >
            <span className="lens-home-icon" aria-hidden="true">🏠</span>
            {!railed && <span className="label">Overview</span>}
          </Link>

          {ALL_SECTIONS.map((key) => (
            <LensSection
              key={key}
              lens={key}
              railed={railed}
              closed={closedSections.has(key)}
              onToggle={() => toggleSection(key)}
              onExpandRail={() => {
                if (railed) toggleRailed();
              }}
              folders={folders}
              shelves={shelves}
              selected={selected}
              shelfSelected={shelfSelected}
              viewSelected={viewSelected}
              viewCounts={viewCounts}
              pillarCounts={pillarCounts}
            />
          ))}
        </aside>

        <main className="lib-main">
          {searchQuery != null ? (
            // Search scope (?q=). Ranked lens-row list, top precedence.
            <SearchResults
              query={searchQuery}
              fields={searchFields}
              notes={searchNotes ?? []}
            />
          ) : shelfSelected != null ? (
            shelves.length === 0 ? (
              // Empty-state hero — tutor has no shelves at all. Any
              // ?shelf= URL is stale; route them to the create CTA.
              <ShelvesEmptyHero onNewShelf={openNewShelf} />
            ) : shelfSelected === 'all' ? (
              // All Shelves carousel (11.3b).
              <AllShelvesCarousel
                shelves={shelvesWithNotes ?? []}
                folders={folders.map((f) => ({
                  folder_id: f.folder_id,
                  name: f.name,
                }))}
                eligibleByShelf={eligibleByShelf}
                onNewShelf={openNewShelf}
              />
            ) : shelfDetail ? (
              // Per-shelf detail view (11.4).
              <ShelfDetail
                shelf={shelfDetail}
                folders={folders.map((f) => ({
                  folder_id: f.folder_id,
                  name: f.name,
                }))}
                eligibles={eligibleByShelf[shelfDetail.shelf_id] ?? []}
              />
            ) : (
              // ?shelf=<uuid-that-doesn't-exist> — stale link or
              // someone else's id. RLS returned null; surface the
              // dedicated empty state.
              <ShelfNotFound />
            )
          ) : viewSelected != null ? (
            // System view scope (?view=<key>). Lens-row list of the
            // notes matching the view's filter — All notes / Drafts /
            // Used nowhere.
            <NotesView viewKey={viewSelected} notes={viewNotes ?? []} />
          ) : selected === 'all' ? (
            <AllFoldersGrid folders={folders} onNewFolder={openNewFolder} />
          ) : selectedFolder ? (
            <NotesList
              notes={notes ?? []}
              folderName={selectedFolder.name}
              folderDescription={selectedFolder.description}
              onNewNote={openNewNote}
            />
          ) : selected != null && selected !== 'all' ? (
            // ?folder=<uuid-that-doesn't-exist> — likely stale URL after
            // a deletion or share from another tutor.
            <FolderNotFound />
          ) : overviewStats ? (
            // No scope at all — Overview dashboard (P2 slice).
            // Replaces the generic EmptyState hero that used to sit
            // here.
            <LibraryOverview stats={overviewStats} />
          ) : (
            // Fallback: page-layer didn't fetch overview stats.
            // Shouldn't fire in practice; kept as a safety net.
            <EmptyState
              onNewFolder={openNewFolder}
              onNewNote={openNewNote}
            />
          )}
        </main>
      </div>

      {newFolderOpen && (
        <NewFolderModal
          existingFolders={folders}
          variant={{ mode: 'create' }}
          onClose={() => setNewFolderOpen(false)}
        />
      )}
      {newShelfOpen && (
        <NewShelfModal
          existingShelves={shelves}
          variant={{ mode: 'create' }}
          onClose={() => setNewShelfOpen(false)}
        />
      )}
      {newNoteOpen && (
        <NewNoteModal
          folders={folders}
          defaultFolderId={newNoteDefaultFolder}
          onClose={() => setNewNoteOpen(false)}
        />
      )}
    </div>
  );
}


// Default landing URL for each lens, used by the railed-mode icon
// click. Pillars and Tags don't have wired destinations yet — they
// expand the sidebar via `onExpandRail` instead. An "All tags" view
// is queued as a future follow-on; we'll swap that mapping in
// when it ships.
const SECTION_RAIL_HREF: Partial<Record<LensKey, string>> = {
  views: '/tutor/library?view=all-notes',
  folders: '/tutor/library?folder=all',
  shelves: '/tutor/library?shelf=all',
};

function LensSection({
  lens,
  railed,
  closed,
  onToggle,
  onExpandRail,
  folders,
  shelves,
  selected,
  shelfSelected,
  viewSelected,
  viewCounts,
  pillarCounts,
}: {
  lens: LensKey;
  railed: boolean;
  closed: boolean;
  onToggle: () => void;
  onExpandRail: () => void;
  folders: LibraryFolderWithCount[];
  shelves: LibraryShelfWithCount[];
  selected: string | null;
  shelfSelected: string | null;
  viewSelected: LibraryViewKey | null;
  viewCounts: LibraryViewCounts;
  pillarCounts: Record<NclexPillar, number>;
}) {
  if (railed) {
    // Railed mode: one icon glyph per section. Views / Folders /
    // Shelves are Link-clickable to their default landing; Pillars
    // and Tags expand the rail instead (no destination wired).
    const href = SECTION_RAIL_HREF[lens];
    if (href) {
      return (
        <div className="lens-section">
          <Link
            href={href}
            className="lens-rail-icon"
            title={SECTION_LABEL[lens]}
            aria-label={SECTION_LABEL[lens]}
          >
            {SECTION_RAIL_GLYPH[lens]}
          </Link>
        </div>
      );
    }
    return (
      <div className="lens-section">
        <button
          type="button"
          className="lens-rail-icon"
          title={`${SECTION_LABEL[lens]} — click to expand`}
          aria-label={`Expand ${SECTION_LABEL[lens]} lens`}
          onClick={onExpandRail}
        >
          {SECTION_RAIL_GLYPH[lens]}
        </button>
      </div>
    );
  }

  return (
    <div className={`lens-section${closed ? ' is-closed' : ''}`}>
      <button
        type="button"
        className="lens-section-head"
        onClick={onToggle}
        aria-expanded={!closed}
      >
        <span className="lens-section-icon" aria-hidden="true">
          {SECTION_RAIL_GLYPH[lens]}
        </span>
        <span>{SECTION_LABEL[lens]}</span>
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>
      <div className="lens-section-body">
        {renderLensBody(
          lens,
          folders,
          shelves,
          selected,
          shelfSelected,
          viewSelected,
          viewCounts,
          pillarCounts,
        )}
      </div>
    </div>
  );
}


function renderLensBody(
  lens: LensKey,
  folders: LibraryFolderWithCount[],
  shelves: LibraryShelfWithCount[],
  selected: string | null,
  shelfSelected: string | null,
  viewSelected: LibraryViewKey | null,
  viewCounts: LibraryViewCounts,
  pillarCounts: Record<NclexPillar, number>,
) {
  switch (lens) {
    case 'views':
      // 3 of 4 system views are wired (P2 slice). Recent stays
      // disabled until visit-tracking ships.
      return (
        <>
          <LensItemLink
            href="/tutor/library?view=all-notes"
            label="All notes"
            count={viewCounts.all}
            isActive={viewSelected === 'all-notes'}
          />
          <LensItemStatic
            label="Recent"
            count={0}
            hint="Needs visit tracking — ships with a later slice."
          />
          <LensItemLink
            href="/tutor/library?view=drafts"
            label="Drafts"
            count={viewCounts.drafts}
            isActive={viewSelected === 'drafts'}
          />
          <LensItemLink
            href="/tutor/library?view=used-nowhere"
            label="Used nowhere"
            count={viewCounts.used_nowhere}
            isActive={viewSelected === 'used-nowhere'}
          />
        </>
      );

    case 'folders':
      return <FolderRows folders={folders} selected={selected} />;

    case 'shelves':
      return <ShelfRows shelves={shelves} selected={shelfSelected} />;

    case 'pillars':
      // Real counts now — multi-pillar notes count in each of their
      // pillars (correct, not misleading double-counting). Rows
      // stay disabled until the pillar filter UI ships.
      return (
        <>
          {PILLAR_NAMES.map((name) => (
            <LensItemStatic
              key={name}
              label={name}
              count={pillarCounts[name as NclexPillar] ?? 0}
            />
          ))}
        </>
      );

    case 'tags':
      return (
        <div className="lens-empty">
          Tags from your notes appear here.
        </div>
      );
  }
}


/** A disabled placeholder lens row for lenses that aren't wired yet. */
function LensItemStatic({
  label,
  count,
  hint,
}: {
  label: string;
  count: number;
  hint?: string;
}) {
  return (
    <button type="button" className="lens-item" disabled title={hint}>
      <span className="label">{label}</span>
      <span className="cnt">{count}</span>
    </button>
  );
}

/** An active lens entry that links to a URL. */
function LensItemLink({
  href,
  label,
  count,
  isActive,
}: {
  href: string;
  label: string;
  count: number;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`lens-item${isActive ? ' is-active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="label">{label}</span>
      <span className="cnt">{count}</span>
    </Link>
  );
}


function EmptyState({
  onNewFolder,
  onNewNote,
}: {
  onNewFolder: () => void;
  onNewNote: () => void;
}) {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph" aria-hidden="true">
        📒
      </div>
      <h2 className="lib-empty-title">Your library is empty</h2>
      <p className="lib-empty-sub">
        Notes you write live here forever — reuse them across cohorts,
        attach them to units, or group them into curated shelves.
        Start with a folder or jump straight to a new note.
      </p>
      <div className="lib-empty-actions">
        <button className="lib-btn" type="button" onClick={onNewFolder}>
          + New folder
        </button>
        <button
          className="lib-btn lib-btn-primary"
          type="button"
          onClick={onNewNote}
        >
          + New note
        </button>
      </div>
    </div>
  );
}


/** Stale `?folder=` URL — folder id doesn't match any of the tutor's. */
function FolderNotFound() {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph" aria-hidden="true">
        ❔
      </div>
      <h2 className="lib-empty-title">Folder not found</h2>
      <p className="lib-empty-sub">
        That folder doesn&apos;t exist (or isn&apos;t yours). Try a folder
        from the sidebar.
      </p>
    </div>
  );
}


/**
 * Empty-state hero shown at `?shelf=…` when the tutor has 0 shelves.
 * When at least one shelf exists, the AllShelvesCarousel renders
 * instead (with its own dashed `+ Add to shelf` tiles).
 */
function ShelvesEmptyHero({ onNewShelf }: { onNewShelf: () => void }) {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph" aria-hidden="true">
        📚
      </div>
      <h2 className="lib-empty-title">No shelves yet</h2>
      <p className="lib-empty-sub">
        Shelves are curated cross-folder packs — &ldquo;Foundational SATA
        pack&rdquo;, &ldquo;Drug deep dives&rdquo;, &ldquo;Week 1
        essentials&rdquo;. Each one carries its own identity colour
        wherever it appears.
      </p>
      <div className="lib-empty-actions">
        <button
          className="lib-btn lib-btn-primary"
          type="button"
          onClick={onNewShelf}
        >
          + New shelf
        </button>
      </div>
    </div>
  );
}
