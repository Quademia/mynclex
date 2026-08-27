// mynclex/lib/library/programme/programme-library-shell.tsx
//
// The TUTOR programme-level library preview shell (the "student
// preview"). A faithful mirror of lib/library/student/student-library-
// shell.tsx, reusing the same .lib-* / .lens-* CSS so the two surfaces
// read as one design system — recontextualised for a tutor viewing what
// students enrolled in THIS programme see.
//
// Three differences from the student shell (per the CD handoff):
//   • A tutor-only PREVIEW BANNER at the top ("Student preview — exactly
//     what the N students in <programme> see. Read-only.") with a
//     "Manage in Library ↗" link out to the editable /tutor/library.
//   • A VISIBILITY CHIP on every note row — "All students" (TUTOR_WIDE)
//     vs "This programme" (PROGRAMME_SCOPED) — so the tutor sees WHY
//     each note appears. Driven by the existing visibility_mode field.
//   • A PREVIEW HOME (content overview: counts, not per-student
//     progress) replaces the student's personal Study Home. The Recent
//     / Bookmarked views are dropped — they're per-student reading
//     state, meaningless in a tutor preview.
//
// Scope is URL-driven (mirrors the student route): the server parses
// searchParams into `scope` and passes it in; lens entries are <Link>s.
// Note rows link to the read-view route (slice 2).

'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { NCLEX_PILLARS, type NclexPillar } from '../types';
import { pillarShortName } from '../format';
import {
  LibraryScopeBar,
  type LensSectionData,
} from '../student/library-scope-bar';
import type { ProgrammeLibraryScope } from './scope';
import type {
  ProgrammeLibrarySnapshot,
  ProgrammeLibraryFolder,
  ProgrammeLibraryShelf,
} from './queries';
import type { LibraryNoteLensRow } from '../types';

interface ProgrammeLibraryShellProps {
  snapshot: ProgrammeLibrarySnapshot;
  /** Route base, e.g. `/tutor/programme/<id>/library`. */
  basePath: string;
  /** Programme title — banner + hero copy. */
  programmeTitle: string;
  /** Count of actively-enrolled students — banner + hero copy. */
  studentCount: number;
  scope: ProgrammeLibraryScope;
}

const LS_RAILED = 'mynclex.programmelibrary.railed';
const RAILED_EVENT = 'mynclex:programmelibrary:railed';

// Collapse-to-rail preference (localStorage), read via
// useSyncExternalStore — SSR-safe (server snapshot = expanded). Mirrors
// the student shell's pattern with its own storage key.
function railedSubscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(RAILED_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(RAILED_EVENT, cb);
  };
}
function railedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(LS_RAILED) === '1';
  } catch {
    return false;
  }
}
function useRailed(): [boolean, () => void] {
  const railed = useSyncExternalStore(
    railedSubscribe,
    railedSnapshot,
    () => false,
  );
  const toggle = () => {
    try {
      window.localStorage.setItem(LS_RAILED, railedSnapshot() ? '0' : '1');
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(RAILED_EVENT));
  };
  return [railed, toggle];
}

type LensKey = 'views' | 'folders' | 'shelves' | 'pillars' | 'tags';
const SECTION_GLYPH: Record<LensKey, string> = {
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

// ── Small inline icon set (Preview Home + visibility chip) ───────────
function Svg({
  size = 16,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const EyeIcon = ({ size = 12 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
const GridIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
);
const FolderIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </Svg>
);
const ShelvesIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M3 14.5h18" />
  </Svg>
);
const SparkIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </Svg>
);
const DocIcon = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
    <path d="M14 3v6h6" />
  </Svg>
);

// ── Visibility chip — the tutor-only "why does this appear?" badge ───
function VisibilityChip({
  mode,
}: {
  mode: LibraryNoteLensRow['visibility_mode'];
}) {
  const wide = mode === 'TUTOR_WIDE';
  return (
    <span
      className={`tlib-vis ${wide ? 'is-wide' : 'is-scoped'}`}
      title={
        wide
          ? 'Visible to every student enrolled with you (tutor-wide note).'
          : 'Scoped to students enrolled in this programme.'
      }
    >
      <EyeIcon size={12} />
      {wide ? 'All students' : 'This programme'}
    </span>
  );
}

export function ProgrammeLibraryShell({
  snapshot,
  basePath,
  programmeTitle,
  studentCount,
  scope,
}: ProgrammeLibraryShellProps) {
  const { folders, shelves, notes } = snapshot;

  const [railed, toggleRailed] = useRailed();

  // ── Derived counts (drive the sidebar + hide-empty) ───────────────
  const folderCount = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) => {
      if (n.folder_id) m.set(n.folder_id, (m.get(n.folder_id) ?? 0) + 1);
    });
    return m;
  }, [notes]);

  const shelfCount = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) =>
      n.shelf_memberships.forEach((s) =>
        m.set(s.shelf_id, (m.get(s.shelf_id) ?? 0) + 1),
      ),
    );
    return m;
  }, [notes]);

  const pillarCount = useMemo(() => {
    const m = new Map<NclexPillar, number>();
    notes.forEach((n) =>
      n.pillars.forEach((p) => m.set(p, (m.get(p) ?? 0) + 1)),
    );
    return m;
  }, [notes]);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) => n.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [notes]);

  const visibleFolders = folders.filter(
    (f) => (folderCount.get(f.folder_id) ?? 0) > 0,
  );
  const visibleShelves = shelves.filter(
    (s) => (shelfCount.get(s.shelf_id) ?? 0) > 0,
  );
  const visiblePillars = NCLEX_PILLARS.filter(
    (p) => (pillarCount.get(p) ?? 0) > 0,
  );

  const counts = {
    notes: notes.length,
    folders: visibleFolders.length,
    shelves: visibleShelves.length,
    pillars: visiblePillars.length,
  };

  const railHref: Partial<Record<LensKey, string>> = {
    views: `${basePath}?view=all-notes`,
    folders: `${basePath}?folder=all`,
    shelves: `${basePath}?shelf=all`,
  };

  // ── The lens tree, as DATA ──────────────────────────────────────────
  // Same one-array-two-renderers arrangement as the student shell (see
  // ../student/student-library-shell.tsx): the desktop sidebar and the
  // phone Browse sheet both render this, so the sheet cannot quietly stop
  // holding everything the sidebar holds.
  //
  // ⚠ Deliberately SHORTER than the student's. Recent, Bookmarked and My
  // practice are per-student state, which a tutor previewing the surface
  // does not have — so they are absent here exactly as they are absent
  // from this shell's sidebar today.
  const lensSections: LensSectionData[] = useMemo(() => {
    const out: LensSectionData[] = [
      {
        key: 'views',
        title: 'Views',
        glyph: SECTION_GLYPH.views,
        rows: [
          {
            key: 'home',
            label: '🏠 Home',
            href: basePath,
            active: scope.kind === 'home',
          },
          {
            key: 'all-notes',
            label: 'All notes',
            href: `${basePath}?view=all-notes`,
            count: notes.length,
            active: scope.kind === 'all-notes',
          },
          {
            key: 'by-unit',
            label: 'By unit',
            hint: 'Shows notes attached to a curriculum unit — coming soon.',
            active: false,
          },
        ],
      },
    ];

    if (visibleFolders.length > 0) {
      out.push({
        key: 'folders',
        title: 'Folders',
        glyph: SECTION_GLYPH.folders,
        rows: [
          {
            key: 'all-folders',
            label: 'All folders',
            href: `${basePath}?folder=all`,
            count: visibleFolders.length,
            active: scope.kind === 'all-folders',
          },
          ...visibleFolders.map((f) => ({
            key: f.folder_id,
            label: f.name,
            href: `${basePath}?folder=${f.folder_id}`,
            count: folderCount.get(f.folder_id) ?? 0,
            active: scope.kind === 'folder' && scope.id === f.folder_id,
          })),
        ],
      });
    }

    if (visibleShelves.length > 0) {
      out.push({
        key: 'shelves',
        title: 'Shelves',
        glyph: SECTION_GLYPH.shelves,
        rows: [
          {
            key: 'all-shelves',
            label: 'All shelves',
            href: `${basePath}?shelf=all`,
            count: visibleShelves.length,
            active: scope.kind === 'all-shelves',
          },
          ...visibleShelves.map((s) => ({
            key: s.shelf_id,
            label: s.title,
            href: `${basePath}?shelf=${s.shelf_id}`,
            count: shelfCount.get(s.shelf_id) ?? 0,
            active: scope.kind === 'shelf' && scope.id === s.shelf_id,
            dotColor: s.color,
          })),
        ],
      });
    }

    if (visiblePillars.length > 0) {
      out.push({
        key: 'pillars',
        title: 'Pillars',
        glyph: SECTION_GLYPH.pillars,
        rows: visiblePillars.map((p) => ({
          key: p,
          label: pillarShortName(p),
          title: p,
          href: `${basePath}?pillar=${encodeURIComponent(p)}`,
          count: pillarCount.get(p) ?? 0,
          active: scope.kind === 'pillar' && scope.id === p,
        })),
      });
    }

    if (tagCounts.length > 0) {
      out.push({
        key: 'tags',
        title: 'Tags',
        glyph: SECTION_GLYPH.tags,
        rows: tagCounts.map((t) => ({
          key: t.name,
          label: `#${t.name}`,
          href: `${basePath}?tag=${encodeURIComponent(t.name)}`,
          count: t.count,
          active: scope.kind === 'tag' && scope.id === t.name,
        })),
      });
    }

    return out;
  }, [
    basePath,
    scope,
    notes.length,
    visibleFolders,
    visibleShelves,
    visiblePillars,
    tagCounts,
    folderCount,
    shelfCount,
    pillarCount,
  ]);

  return (
    <div className="slm">
    <div className="lib-page">
      {/* Tutor-only preview banner */}
      <div className="tlib-preview">
        <span className="tlib-preview-ic">
          <EyeIcon size={15} />
        </span>
        <span className="tlib-preview-txt">
          <b>Student preview</b> — exactly what the {studentCount} student
          {studentCount === 1 ? '' : 's'} in {programmeTitle} see. Read-only.
        </span>
        <Link href="/tutor/library" className="tlib-preview-edit">
          Manage in Library ↗
        </Link>
      </div>

      <header className="lib-page-head">
        <div>
          <h1 className="lib-page-title">Library</h1>
          <p className="lib-page-subtitle">
            Teaching notes shared with students enrolled in this programme —
            the read view they study from.
          </p>
        </div>
      </header>

      {/* The student's phone navigation, same component and same contract
          — the preview shows what she sees, so it navigates how she does. */}
      <LibraryScopeBar
        sections={lensSections}
        chips={[
          {
            key: 'home',
            label: 'Home',
            icon: '🏠',
            href: basePath,
            active: scope.kind === 'home',
          },
          {
            key: 'all-notes',
            label: 'All notes',
            href: `${basePath}?view=all-notes`,
            count: notes.length,
            active: scope.kind === 'all-notes',
          },
        ]}
      />

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

          {railed ? (
            <>
              <div className="lens-section">
                <Link
                  href={basePath}
                  className={`lens-rail-icon${scope.kind === 'home' ? ' is-active' : ''}`}
                  title="Home"
                  aria-label="Home"
                >
                  🏠
                </Link>
              </div>
              {(['views', 'folders', 'shelves', 'pillars', 'tags'] as LensKey[])
                .filter(
                  (k) =>
                    k === 'views' ||
                    (k === 'folders' && visibleFolders.length > 0) ||
                    (k === 'shelves' && visibleShelves.length > 0) ||
                    (k === 'pillars' && visiblePillars.length > 0) ||
                    (k === 'tags' && tagCounts.length > 0),
                )
                .map((k) => {
                  const href = railHref[k];
                  return (
                    <div className="lens-section" key={k}>
                      {href ? (
                        <Link
                          href={href}
                          className="lens-rail-icon"
                          title={SECTION_LABEL[k]}
                          aria-label={SECTION_LABEL[k]}
                        >
                          {SECTION_GLYPH[k]}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="lens-rail-icon"
                          title={`${SECTION_LABEL[k]} — click to expand`}
                          aria-label={`Expand ${SECTION_LABEL[k]}`}
                          onClick={toggleRailed}
                        >
                          {SECTION_GLYPH[k]}
                        </button>
                      )}
                    </div>
                  );
                })}
            </>
          ) : (
            // Expanded: rendered from `lensSections` — the SAME array the
            // phone Browse sheet renders. See the builder above.
            <>
              {lensSections.map((section) => (
                <LensSection
                  key={section.key}
                  title={section.title}
                  glyph={section.glyph}
                >
                  {section.rows.map((row) =>
                    row.href ? (
                      <LensLink
                        key={row.key}
                        href={row.href}
                        label={row.label}
                        title={row.title}
                        count={row.count}
                        active={row.active}
                        dotColor={row.dotColor}
                      />
                    ) : (
                      <LensDisabled
                        key={row.key}
                        label={row.label}
                        hint={row.hint ?? ''}
                      />
                    ),
                  )}
                </LensSection>
              ))}
            </>
          )}
        </aside>

        <main className="lib-main">
          <MainPane
            scope={scope}
            notes={notes}
            folders={folders}
            shelves={shelves}
            basePath={basePath}
            programmeTitle={programmeTitle}
            studentCount={studentCount}
            counts={counts}
          />
        </main>
      </div>
    </div>
    </div>
  );
}

// =====================================================================
// Main pane — branches on scope
// =====================================================================

function MainPane({
  scope,
  notes,
  folders,
  shelves,
  basePath,
  programmeTitle,
  studentCount,
  counts,
}: {
  scope: ProgrammeLibraryScope;
  notes: LibraryNoteLensRow[];
  folders: ProgrammeLibraryFolder[];
  shelves: ProgrammeLibraryShelf[];
  basePath: string;
  programmeTitle: string;
  studentCount: number;
  counts: { notes: number; folders: number; shelves: number; pillars: number };
}) {
  if (scope.kind === 'home') {
    return (
      <PreviewHome
        notes={notes}
        basePath={basePath}
        programmeTitle={programmeTitle}
        studentCount={studentCount}
        counts={counts}
      />
    );
  }

  if (scope.kind === 'all-folders') {
    return <FoldersGrid folders={folders} notes={notes} basePath={basePath} />;
  }
  if (scope.kind === 'all-shelves') {
    return (
      <ShelvesCarousel shelves={shelves} notes={notes} basePath={basePath} />
    );
  }

  let title = 'All notes';
  let sub = `${notes.length} note${notes.length === 1 ? '' : 's'} shared with students in this programme.`;
  let crumb = 'All notes';
  let list = notes;

  if (scope.kind === 'folder') {
    const f = folders.find((x) => x.folder_id === scope.id);
    list = notes.filter((n) => n.folder_id === scope.id);
    title = f?.name ?? 'Folder';
    sub = f?.description ?? `${list.length} note${list.length === 1 ? '' : 's'}.`;
    crumb = title;
  } else if (scope.kind === 'shelf') {
    const s = shelves.find((x) => x.shelf_id === scope.id);
    list = notes.filter((n) =>
      n.shelf_memberships.some((m) => m.shelf_id === scope.id),
    );
    title = s?.title ?? 'Shelf';
    sub = s?.description ?? `${list.length} note${list.length === 1 ? '' : 's'}.`;
    crumb = title;
  } else if (scope.kind === 'pillar') {
    list = notes.filter((n) => n.pillars.includes(scope.id));
    title = scope.id;
    sub = 'Notes classified under this NCLEX Client Needs sub-category.';
    crumb = pillarShortName(scope.id);
  } else if (scope.kind === 'tag') {
    list = notes.filter((n) => n.tags.includes(scope.id));
    title = `#${scope.id}`;
    sub = `Notes tagged ${scope.id}.`;
    crumb = `#${scope.id}`;
  }

  return (
    <NotesPane
      title={title}
      sub={sub}
      crumb={crumb}
      notes={list}
      basePath={basePath}
    />
  );
}

// ── Note row — mirror of StudentNoteRow + the visibility chip ────────
function NoteRow({
  note,
  basePath,
}: {
  note: LibraryNoteLensRow;
  basePath: string;
}) {
  const fb =
    (note.description && note.description.trim()) ||
    (note.subtitle && note.subtitle.trim()) ||
    null;
  return (
    <Link
      href={`${basePath}/note/${note.note_id}`}
      className="lib-note-lens-row"
    >
      <div className="lib-note-lens-main">
        <div className="lib-note-title-line">
          <span className="lib-note-title">{note.title}</span>
          {note.subtitle && (
            <span className="lib-note-subtitle">{note.subtitle}</span>
          )}
        </div>
        {fb && <div className="lib-note-desc">{fb}</div>}
        <div className="lib-note-meta">
          {note.folder_name && (
            <span className="lib-meta-chip lib-meta-chip-folder">
              <span aria-hidden="true">📁</span> {note.folder_name}
            </span>
          )}
          {note.shelf_memberships.map((s) => (
            <span
              key={s.shelf_id}
              className="lib-meta-chip lib-meta-chip-shelf"
              title={`On shelf: ${s.title}`}
            >
              <span
                className="lib-meta-shelf-dot"
                style={{ background: s.color }}
                aria-hidden="true"
              />
              {s.title}
            </span>
          ))}
          {note.pillars.map((p) => (
            <span key={p} className="lib-meta-chip" title={p}>
              {pillarShortName(p)}
            </span>
          ))}
          {note.tags.map((t) => (
            <span key={t} className="lib-tag-inline">
              #{t}
            </span>
          ))}
        </div>
      </div>
      <VisibilityChip mode={note.visibility_mode} />
    </Link>
  );
}

// A note list with a client-side search box over the scoped set.
function NotesPane({
  title,
  sub,
  crumb,
  notes,
  basePath,
}: {
  title: string;
  sub: string;
  crumb: string;
  notes: LibraryNoteLensRow[];
  basePath: string;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(ql) ||
        (n.subtitle ?? '').toLowerCase().includes(ql) ||
        (n.description ?? '').toLowerCase().includes(ql),
    );
  }, [q, notes]);

  return (
    <div className="lib-notes-view">
      <div className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <span>Library</span>
            <span className="sep">/</span>
            <span className="b">{crumb}</span>
          </div>
          <h2 className="lib-pane-title">{title}</h2>
          <p className="lib-pane-sub">{sub}</p>
        </div>
      </div>

      <div className="lib-student-search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search these notes…"
          aria-label="Search notes"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            🔍
          </div>
          <p className="lib-empty-sub">
            {q.trim() ? 'No notes match your search.' : 'No notes here yet.'}
          </p>
        </div>
      ) : (
        <div className="lib-notes-list">
          {filtered.map((n) => (
            <NoteRow key={n.note_id} note={n} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

// All folders — read-only card grid.
function FoldersGrid({
  folders,
  notes,
  basePath,
}: {
  folders: ProgrammeLibraryFolder[];
  notes: LibraryNoteLensRow[];
  basePath: string;
}) {
  const count = (fid: string) =>
    notes.filter((n) => n.folder_id === fid).length;
  const visible = folders.filter((f) => count(f.folder_id) > 0);

  return (
    <div className="lib-all-folders">
      <div className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <span>Library</span>
            <span className="sep">/</span>
            <span className="b">All folders</span>
          </div>
          <h2 className="lib-pane-title">All folders</h2>
          <p className="lib-pane-sub">
            Your filing bins, as students browse them. Open one to see its
            notes.
          </p>
        </div>
      </div>
      <div className="lib-folder-grid">
        {visible.map((f) => (
          <Link
            key={f.folder_id}
            href={`${basePath}?folder=${f.folder_id}`}
            className="lib-folder-card"
          >
            <div className="lib-folder-card-ic" aria-hidden="true">
              📁
            </div>
            <div className="lib-folder-card-title">{f.name}</div>
            {f.description && (
              <div className="lib-folder-card-desc">{f.description}</div>
            )}
            <div className="lib-folder-card-meta">
              {count(f.folder_id)} note{count(f.folder_id) === 1 ? '' : 's'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// All shelves — read-only carousels.
function ShelvesCarousel({
  shelves,
  notes,
  basePath,
}: {
  shelves: ProgrammeLibraryShelf[];
  notes: LibraryNoteLensRow[];
  basePath: string;
}) {
  const membersOf = (sid: string) =>
    notes.filter((n) => n.shelf_memberships.some((m) => m.shelf_id === sid));
  const visible = shelves.filter((s) => membersOf(s.shelf_id).length > 0);

  return (
    <div className="lib-all-shelves">
      <div className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <span>Library</span>
            <span className="sep">/</span>
            <span className="b">All shelves</span>
          </div>
          <h2 className="lib-pane-title">All shelves</h2>
          <p className="lib-pane-sub">
            Curated cross-cutting packs. Each shelf carries its own colour.
          </p>
        </div>
      </div>
      <div className="lib-shelf-carousels">
        {visible.map((s) => {
          const members = membersOf(s.shelf_id);
          return (
            <div key={s.shelf_id} className="lib-shelf-strip-wrap">
              <div className="lib-shelf-strip-head">
                <span
                  className="lib-shelf-strip-dot"
                  style={{ background: s.color }}
                />
                <Link
                  href={`${basePath}?shelf=${s.shelf_id}`}
                  className="lib-shelf-strip-title"
                >
                  {s.title}
                </Link>
                <span className="lib-shelf-strip-count">
                  {members.length} note{members.length === 1 ? '' : 's'}
                </span>
                {s.description && (
                  <span className="lib-shelf-strip-tagline">
                    {s.description}
                  </span>
                )}
              </div>
              <div className="lib-shelf-strip">
                {members.map((n) => (
                  <Link
                    key={n.note_id}
                    href={`${basePath}/note/${n.note_id}`}
                    className="lib-shelf-card lib-shelf-card-link"
                    style={{ '--shelf-accent': s.color } as React.CSSProperties}
                  >
                    <div className="lib-shelf-card-title">{n.title}</div>
                    <div className="lib-shelf-card-desc">
                      {n.description || n.subtitle || ''}
                    </div>
                    <div className="lib-shelf-card-chips">
                      {n.pillars.slice(0, 2).map((p) => (
                        <span
                          key={p}
                          className="lib-shelf-card-chip"
                          title={p}
                        >
                          {pillarShortName(p)}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// Preview Home — a content overview (counts, NOT per-student progress)
// =====================================================================

function PreviewHome({
  notes,
  basePath,
  programmeTitle,
  studentCount,
  counts,
}: {
  notes: LibraryNoteLensRow[];
  basePath: string;
  programmeTitle: string;
  studentCount: number;
  counts: { notes: number; folders: number; shelves: number; pillars: number };
}) {
  const wide = notes.filter((n) => n.visibility_mode === 'TUTOR_WIDE').length;
  const scoped = notes.length - wide;

  return (
    <div className="lib-study-home">
      <div className="sh">
        <div className="hero empty">
          <div>
            <div className="hero-eyebrow">
              <EyeIcon size={13} /> Student preview
            </div>
            <h2 className="hero-title">What students see in {programmeTitle}</h2>
            <p className="hero-empty-copy">
              This is the read-only Library the <b>{studentCount} student
              {studentCount === 1 ? '' : 's'}</b> enrolled in this programme
              open — same lenses, same notes, same order. {wide} note
              {wide === 1 ? '' : 's'} reach all of your students;{' '}
              {scoped} {scoped === 1 ? 'is' : 'are'} scoped to this programme.
            </p>
            <Link href={`${basePath}?view=all-notes`} className="btn btn-accent">
              <GridIcon size={14} /> Browse all notes
            </Link>
          </div>
        </div>

        {/* Content overview — counts, not per-student progress */}
        <div className="stat-row">
          <ContentStat
            icon={<DocIcon />}
            label="Notes shared"
            value={counts.notes}
            sub="Published & visible to this programme"
          />
          <ContentStat
            icon={<FolderIcon />}
            navy
            label="Folders"
            value={counts.folders}
            sub="Filing bins with notes"
          />
          <ContentStat
            icon={<ShelvesIcon />}
            label="Shelves"
            value={counts.shelves}
            sub="Curated cross-cutting packs"
          />
          <ContentStat
            icon={<SparkIcon />}
            navy
            label="NCLEX pillars"
            value={counts.pillars}
            sub="Client-Needs categories covered"
          />
        </div>

        <div>
          <div className="sh-block-label">Browse the library</div>
          <div className="browse-grid">
            <BrowseCard
              icon={<GridIcon />}
              title="All notes"
              meta={`${counts.notes} note${counts.notes === 1 ? '' : 's'} shared`}
              href={`${basePath}?view=all-notes`}
            />
            <BrowseCard
              icon={<FolderIcon />}
              title="Folders"
              meta={`${counts.folders} folder${counts.folders === 1 ? '' : 's'}`}
              href={`${basePath}?folder=all`}
            />
            <BrowseCard
              icon={<ShelvesIcon />}
              title="Shelves"
              meta={`${counts.shelves} curated pack${counts.shelves === 1 ? '' : 's'}`}
              href={`${basePath}?shelf=all`}
            />
            <BrowseCard
              icon={<SparkIcon />}
              title="NCLEX pillars"
              meta={`${counts.pillars} categor${counts.pillars === 1 ? 'y' : 'ies'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentStat({
  icon,
  navy,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  navy?: boolean;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span className={'stat-ico' + (navy ? ' navy' : '')}>{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function BrowseCard({
  icon,
  title,
  meta,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="browse-ico">{icon}</span>
      <span>
        <span className="browse-title">{title}</span>
        <span className="browse-meta">{meta}</span>
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="browse-card">
        {inner}
      </Link>
    );
  }
  return <div className="browse-card is-static">{inner}</div>;
}

// =====================================================================
// Sidebar primitives
// =====================================================================

function LensSection({
  title,
  glyph,
  children,
}: {
  title: string;
  glyph: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lens-section">
      <div className="lens-section-head" aria-hidden="true">
        <span className="lens-section-icon">{glyph}</span>
        <span>{title}</span>
      </div>
      <div className="lens-section-body">{children}</div>
    </div>
  );
}

function LensLink({
  href,
  label,
  count,
  active,
  title,
  dotColor,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
  title?: string;
  dotColor?: string;
}) {
  return (
    <Link
      href={href}
      className={`lens-item${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={title}
    >
      {dotColor && (
        <span
          className="lib-shelf-pip"
          style={{ background: dotColor, marginRight: 6 }}
          aria-hidden="true"
        />
      )}
      <span className="label">{label}</span>
      {count != null && <span className="cnt">{count}</span>}
    </Link>
  );
}

function LensDisabled({ label, hint }: { label: string; hint: string }) {
  return (
    <button type="button" className="lens-item" disabled title={hint}>
      <span className="label">{label}</span>
    </button>
  );
}
