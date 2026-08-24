// mynclex/lib/library/student/student-library-shell.tsx
//
// The STUDENT library shell (slice 11.14 — the "front door"). A
// read-only mirror of the tutor's <LibraryHomeShell>, reusing the same
// .lib-* / .lens-* CSS so the two surfaces read as one design system.
//
// Mounted on BOTH delivery modes via a `basePath` prop:
//   • self-paced → /student/programme/[id]/library   (slice 11.14a)
//   • tutor-led  → /student/cohort/[id]/library       (slice 11.14b)
// Same surface; only the route base + how the tutor was resolved differ.
//
// What differs from the tutor shell (per the CD prototype's "Student
// view"):
//   • Views = All notes (active) · Recent · By unit · Bookmarked. The
//     last three are placeholders here — Recent needs visit tracking
//     (slice 11.13 writes last_visited_at), By unit needs note-as-
//     activity attachments (11.11), Bookmarked needs 11.13. They render
//     disabled with a hint, exactly like the tutor's "Recent".
//   • Folders / Shelves / Pillars / Tags hide-empty — only containers
//     holding a visible note appear.
//   • No authoring affordances (no New folder/note, no kebabs, no
//     Save-as-view).
//   • Note rows link to the read view (11.13) and drop the tutor's
//     Pub/Draft · used-in · edited state column.
//
// Scope is URL-driven (mirrors the tutor route): the server parses
// searchParams into `scope` and passes it in; lens entries are <Link>s.
// Filtering of the snapshot's notes happens here, client-side — the set
// is small (one tutor's published notes) and this matches the prototype.

'use client';

import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { NCLEX_PILLARS, type NclexPillar } from '../types';
import { pillarShortName } from '../format';
import { StudentNoteRow } from './student-note-row';
import { StudentStudyHome } from './study-home';
import {
  LibraryScopeBar,
  type LensSectionData,
} from './library-scope-bar';
import type { StudentLibraryScope } from './scope';
import type { StudentLibraryHome } from './home-queries';
import type {
  StudentLibrarySnapshot,
  StudentLibraryFolder,
  StudentLibraryShelf,
} from './queries';

interface StudentLibraryShellProps {
  snapshot: StudentLibrarySnapshot;
  /** Route base for this library, e.g. `/student/programme/<id>/library`. */
  basePath: string;
  scope: StudentLibraryScope;
  /**
   * Study-home payload — present only for the home / recent / bookmarked
   * scopes (the route fetches it on demand). Drives the Study Home pane,
   * the Recent / Bookmarked note lists, and their sidebar counts.
   */
  home: StudentLibraryHome | null;
}

const LS_RAILED = 'mynclex.studentlibrary.railed';
const RAILED_EVENT = 'mynclex:studentlibrary:railed';

// Collapse-to-rail preference, persisted in localStorage. Read via
// useSyncExternalStore — the React-blessed way to subscribe to an
// external store: SSR-safe (server snapshot = expanded, no hydration
// mismatch) and free of the "setState in effect" cascade. Toggling
// writes localStorage and fires an event so every mounted shell (and
// other tabs, via the native `storage` event) re-reads.
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

export function StudentLibraryShell({
  snapshot,
  basePath,
  scope,
  home,
}: StudentLibraryShellProps) {
  const { folders, shelves, notes } = snapshot;

  // Collapse-to-rail (slice 11.14b) — persisted preference shared across
  // mounts + tabs. Default expanded on the server (no hydration mismatch).
  const [railed, toggleRailed] = useRailed();

  // Recent / Bookmarked counts for the Views lens — derivable only when
  // the study-home payload is loaded (home / recent / bookmarked scopes).
  // Off those scopes the entries render as plain links without a count.
  const recentCount = home
    ? Object.values(home.stateByNote).filter((s) => s.lastVisitedAt != null)
        .length
    : undefined;
  const bookmarkCount = home
    ? Object.values(home.stateByNote).filter((s) => s.bookmarkedAt != null)
        .length
    : undefined;

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

  // Hide-empty: only containers that hold a visible note appear.
  const visibleFolders = folders.filter(
    (f) => (folderCount.get(f.folder_id) ?? 0) > 0,
  );
  const visibleShelves = shelves.filter(
    (s) => (shelfCount.get(s.shelf_id) ?? 0) > 0,
  );
  const visiblePillars = NCLEX_PILLARS.filter(
    (p) => (pillarCount.get(p) ?? 0) > 0,
  );

  // Default landing per lens, used by the railed icons (Pillars / Tags
  // have no single destination → expand the rail instead).
  const railHref: Partial<Record<LensKey, string>> = {
    views: `${basePath}?view=all-notes`,
    folders: `${basePath}?folder=all`,
    shelves: `${basePath}?shelf=all`,
  };

  // ── The lens tree, as DATA ──────────────────────────────────────────
  // ⭐ Built once and rendered twice: as the desktop sidebar below, and as
  // the phone Browse sheet in <LibraryScopeBar>. The sheet's contract is
  // that it holds everything the sidebar holds, and the only way to keep
  // that true through later edits is for there to be one list. Adding a
  // lens here reaches both surfaces; adding it to one of two JSX trees
  // would not, and nothing would report the omission.
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
            key: 'practice',
            label: '🎯 My practice',
            href: `${basePath}/practice`,
            active: false,
          },
          {
            key: 'recent',
            label: 'Recent',
            href: `${basePath}?view=recent`,
            count: recentCount,
            active: scope.kind === 'recent',
          },
          {
            key: 'by-unit',
            label: 'By unit',
            hint: 'Shows notes your tutor attaches to a unit — coming soon.',
            active: false,
          },
          {
            key: 'bookmarked',
            label: 'Bookmarked',
            href: `${basePath}?view=bookmarked`,
            count: bookmarkCount,
            active: scope.kind === 'bookmarked',
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
    recentCount,
    bookmarkCount,
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
      <header className="lib-page-head">
        {scope.kind === 'home' && home ? (
          <div>
            <h1 className="lib-page-title">
              {home.studentForename
                ? `Welcome back, ${home.studentForename}`
                : 'Library'}
            </h1>
            <p className="lib-page-subtitle">
              {home.tutorName ? `Notes by ${home.tutorName} · ` : ''}
              {notes.length} note{notes.length === 1 ? '' : 's'} shared with you.
            </p>
          </div>
        ) : (
          <div>
            <h1 className="lib-page-title">Library</h1>
            <p className="lib-page-subtitle">
              Teaching notes your tutor has shared for this programme — read,
              practise the embedded questions, and revisit any time.
            </p>
          </div>
        )}
      </header>

      {/* Phone navigation. In the DOM at every width; the layer reveals it
          below 768px, where .lens-side is hidden. */}
      <LibraryScopeBar
        basePath={basePath}
        sections={lensSections}
        notesCount={notes.length}
        bookmarkCount={bookmarkCount}
        scopeKind={scope.kind}
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
            // Railed: a Home glyph, then one glyph per lens. Views / Folders
            // / Shelves link to their default landing; Pillars / Tags expand.
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
            <div className="lens-section">
              <Link
                href={`${basePath}/practice`}
                className="lens-rail-icon"
                title="My practice"
                aria-label="My practice"
              >
                🎯
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
            // phone Browse sheet renders. See the builder above for why.
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
            snapshot={snapshot}
            notes={notes}
            folders={folders}
            shelves={shelves}
            basePath={basePath}
            home={home}
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
  snapshot,
  notes,
  folders,
  shelves,
  basePath,
  home,
}: {
  scope: StudentLibraryScope;
  snapshot: StudentLibrarySnapshot;
  notes: StudentLibrarySnapshot['notes'];
  folders: StudentLibraryFolder[];
  shelves: StudentLibraryShelf[];
  basePath: string;
  home: StudentLibraryHome | null;
}) {
  // Study Home — the default landing.
  if (scope.kind === 'home') {
    if (home) {
      return (
        <StudentStudyHome home={home} snapshot={snapshot} basePath={basePath} />
      );
    }
    // Defensive: home payload missing → fall through to the All-notes list.
  }

  // Recent / Bookmarked — filtered + ordered note lists derived from the
  // student's reading state.
  if ((scope.kind === 'recent' || scope.kind === 'bookmarked') && home) {
    const state = home.stateByNote;
    let list = notes.filter((n) => {
      const s = state[n.note_id];
      return scope.kind === 'recent'
        ? s?.lastVisitedAt != null
        : s?.bookmarkedAt != null;
    });
    list = [...list].sort((a, b) => {
      const sa = state[a.note_id];
      const sb = state[b.note_id];
      const ka =
        (scope.kind === 'recent' ? sa?.lastVisitedAt : sa?.bookmarkedAt) ?? '';
      const kb =
        (scope.kind === 'recent' ? sb?.lastVisitedAt : sb?.bookmarkedAt) ?? '';
      return kb.localeCompare(ka);
    });
    return (
      <NotesPane
        title={scope.kind === 'recent' ? 'Recently opened' : 'Bookmarked'}
        sub={
          scope.kind === 'recent'
            ? "Notes you've opened, most recent first."
            : "Notes you've saved to revisit."
        }
        crumb={scope.kind === 'recent' ? 'Recent' : 'Bookmarked'}
        notes={list}
        basePath={basePath}
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

  // All the remaining scopes resolve to a filtered note list.
  let title = 'All notes';
  let sub = `${notes.length} note${notes.length === 1 ? '' : 's'} shared with you.`;
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
  notes: StudentLibrarySnapshot['notes'];
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
            <StudentNoteRow key={n.note_id} note={n} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

// All folders — read-only card grid (no "new folder" tile).
function FoldersGrid({
  folders,
  notes,
  basePath,
}: {
  folders: StudentLibraryFolder[];
  notes: StudentLibrarySnapshot['notes'];
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
            Your tutor&apos;s filing bins. Open one to see its notes.
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

// All shelves — read-only carousels (no "add to shelf" tile).
function ShelvesCarousel({
  shelves,
  notes,
  basePath,
}: {
  shelves: StudentLibraryShelf[];
  notes: StudentLibrarySnapshot['notes'];
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
                        <span key={p} className="lib-shelf-card-chip" title={p}>
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
  /** Omit to render no count badge (e.g. the Home entry). */
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
