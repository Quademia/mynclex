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

import { useEffect, useState } from 'react';
import { FolderRows } from './folder-rows';
import { ShelfRows } from './shelf-rows';
import { AllFoldersGrid } from './all-folders-grid';
import { NewFolderModal } from './new-folder-modal';
import { NewShelfModal } from './new-shelf-modal';
import { NewNoteModal } from './new-note-modal';
import { NotesList } from './notes-list';
import type {
  LibraryFolderWithCount,
  LibraryNoteListRow,
  LibraryShelfWithCount,
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
  /** All shelves owned by the signed-in tutor, ordered by `position`. */
  shelves: LibraryShelfWithCount[];
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
}

export function LibraryHomeShell({
  folders,
  shelves,
  notes,
  selected,
  shelfSelected,
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
        <div className="lib-search">
          <svg
            className="lib-search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search notes…"
            disabled
            aria-label="Search notes"
          />
        </div>
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

          {ALL_SECTIONS.map((key) => (
            <LensSection
              key={key}
              lens={key}
              railed={railed}
              closed={closedSections.has(key)}
              onToggle={() => toggleSection(key)}
              folders={folders}
              shelves={shelves}
              selected={selected}
              shelfSelected={shelfSelected}
            />
          ))}
        </aside>

        <main className="lib-main">
          {shelfSelected != null ? (
            // 11.3a placeholder for the All Shelves carousel — the real
            // carousel ships in 11.3b. For now every shelf nav lands
            // here (per the scope decision: route all `?shelf=` URLs to
            // `?shelf=all` until 11.4 ships shelf-detail).
            <ShelvesComingSoon
              shelfCount={shelves.length}
              onNewShelf={openNewShelf}
            />
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
          ) : (
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


function LensSection({
  lens,
  railed,
  closed,
  onToggle,
  folders,
  shelves,
  selected,
  shelfSelected,
}: {
  lens: LensKey;
  railed: boolean;
  closed: boolean;
  onToggle: () => void;
  folders: LibraryFolderWithCount[];
  shelves: LibraryShelfWithCount[];
  selected: string | null;
  shelfSelected: string | null;
}) {
  if (railed) {
    // Railed mode: one icon glyph per section, hovering shows the
    // label as a native tooltip.
    return (
      <div className="lens-section">
        <span
          className="lens-rail-icon"
          title={SECTION_LABEL[lens]}
          aria-label={SECTION_LABEL[lens]}
        >
          {SECTION_RAIL_GLYPH[lens]}
        </span>
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
        <span>{SECTION_LABEL[lens]}</span>
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>
      <div className="lens-section-body">
        {renderLensBody(lens, folders, shelves, selected, shelfSelected)}
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
) {
  switch (lens) {
    case 'views':
      // System views always render — they're structural, not data-
      // driven. Counts will land when slice 11.2b ships notes.
      return (
        <>
          <LensItemStatic label="All notes" count={0} />
          <LensItemStatic label="Recent" count={0} />
          <LensItemStatic label="Drafts" count={0} />
          <LensItemStatic label="Used nowhere" count={0} />
        </>
      );

    case 'folders':
      return <FolderRows folders={folders} selected={selected} />;

    case 'shelves':
      return <ShelfRows shelves={shelves} selected={shelfSelected} />;

    case 'pillars':
      // The 8 NCLEX-RN Client Needs sub-categories. All counts zero
      // until notes exist.
      return (
        <>
          {PILLAR_NAMES.map((name) => (
            <LensItemStatic key={name} label={name} count={0} />
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
function LensItemStatic({ label, count }: { label: string; count: number }) {
  return (
    <button type="button" className="lens-item" disabled>
      <span className="label">{label}</span>
      <span className="cnt">{count}</span>
    </button>
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
 * Placeholder main pane for any `?shelf=...` URL in 11.3a. The
 * Spotify-style All Shelves carousel — the real consumer of this
 * surface — ships in 11.3b. Until then, every shelf-related nav
 * lands here so the rest of the entity (create / edit / delete from
 * the sidebar kebab) works end-to-end without a half-built
 * intermediate page.
 */
function ShelvesComingSoon({
  shelfCount,
  onNewShelf,
}: {
  shelfCount: number;
  onNewShelf: () => void;
}) {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph" aria-hidden="true">
        📚
      </div>
      <h2 className="lib-empty-title">
        {shelfCount === 0 ? 'No shelves yet' : 'All shelves'}
      </h2>
      <p className="lib-empty-sub">
        {shelfCount === 0
          ? 'Shelves are curated cross-folder packs — "Foundational SATA pack", "Drug deep dives", "Week 1 essentials". Each one carries its own identity colour wherever it appears.'
          : `You have ${shelfCount} shelf${shelfCount === 1 ? '' : 'es'}. The Spotify-style carousel that lays out every shelf with its notes lands in slice 11.3b — for now create + edit shelves from the sidebar; notes attach in 11.3b.`}
      </p>
      <div className="lib-empty-actions">
        <button className="lib-btn lib-btn-primary" type="button" onClick={onNewShelf}>
          + New shelf
        </button>
      </div>
    </div>
  );
}
