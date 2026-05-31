// mynclex/lib/library/student/student-library-shell.tsx
//
// The STUDENT library shell (slice 11.14 — the "front door"). A
// read-only mirror of the tutor's <LibraryHomeShell>, reusing the same
// .lib-* / .lens-* CSS so the two surfaces read as one design system.
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
import { useMemo, useState } from 'react';
import { NCLEX_PILLARS, type NclexPillar } from '../types';
import { pillarShortName } from '../format';
import { StudentNoteRow } from './student-note-row';
import type {
  StudentLibrarySnapshot,
  StudentLibraryFolder,
  StudentLibraryShelf,
} from './queries';

// The active lens scope, resolved from the URL by the route.
export type StudentLibraryScope =
  | { kind: 'all-notes' }
  | { kind: 'folder'; id: string }
  | { kind: 'all-folders' }
  | { kind: 'shelf'; id: string }
  | { kind: 'all-shelves' }
  | { kind: 'pillar'; id: NclexPillar }
  | { kind: 'tag'; id: string };

interface StudentLibraryShellProps {
  snapshot: StudentLibrarySnapshot;
  programmeId: string;
  scope: StudentLibraryScope;
}

// Base path for every lens link — keeps the programme scope.
function base(programmeId: string) {
  return `/student/programme/${programmeId}/library`;
}

export function StudentLibraryShell({
  snapshot,
  programmeId,
  scope,
}: StudentLibraryShellProps) {
  const { folders, shelves, notes } = snapshot;
  const b = base(programmeId);

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
      .sort((a, b2) => b2.count - a.count || a.name.localeCompare(b2.name));
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

  return (
    <div className="lib-page">
      <header className="lib-page-head">
        <div>
          <h1 className="lib-page-title">Library</h1>
          <p className="lib-page-subtitle">
            Teaching notes your tutor has shared for this programme — read,
            practise the embedded questions, and revisit any time.
          </p>
        </div>
      </header>

      <div className="lib-body">
        <aside className="lens-side" aria-label="Library lenses">
          {/* Views */}
          <LensSection title="Views" glyph="☰">
            <LensLink
              href={`${b}?view=all-notes`}
              label="All notes"
              count={notes.length}
              active={scope.kind === 'all-notes'}
            />
            <LensDisabled
              label="Recent"
              hint="Lights up once you've opened a few notes."
            />
            <LensDisabled
              label="By unit"
              hint="Shows notes your tutor attaches to a unit — coming soon."
            />
            <LensDisabled
              label="Bookmarked"
              hint="Bookmark a note while reading to collect it here."
            />
          </LensSection>

          {/* Folders */}
          {visibleFolders.length > 0 && (
            <LensSection title="Folders" glyph="📁">
              <LensLink
                href={`${b}?folder=all`}
                label="All folders"
                count={visibleFolders.length}
                active={scope.kind === 'all-folders'}
              />
              {visibleFolders.map((f) => (
                <LensLink
                  key={f.folder_id}
                  href={`${b}?folder=${f.folder_id}`}
                  label={f.name}
                  count={folderCount.get(f.folder_id) ?? 0}
                  active={scope.kind === 'folder' && scope.id === f.folder_id}
                />
              ))}
            </LensSection>
          )}

          {/* Shelves */}
          {visibleShelves.length > 0 && (
            <LensSection title="Shelves" glyph="📚">
              <LensLink
                href={`${b}?shelf=all`}
                label="All shelves"
                count={visibleShelves.length}
                active={scope.kind === 'all-shelves'}
              />
              {visibleShelves.map((s) => (
                <LensLink
                  key={s.shelf_id}
                  href={`${b}?shelf=${s.shelf_id}`}
                  label={s.title}
                  count={shelfCount.get(s.shelf_id) ?? 0}
                  active={scope.kind === 'shelf' && scope.id === s.shelf_id}
                  dotColor={s.color}
                />
              ))}
            </LensSection>
          )}

          {/* Pillars */}
          {visiblePillars.length > 0 && (
            <LensSection title="Pillars" glyph="◆">
              {visiblePillars.map((p) => (
                <LensLink
                  key={p}
                  href={`${b}?pillar=${encodeURIComponent(p)}`}
                  label={pillarShortName(p)}
                  title={p}
                  count={pillarCount.get(p) ?? 0}
                  active={scope.kind === 'pillar' && scope.id === p}
                />
              ))}
            </LensSection>
          )}

          {/* Tags */}
          {tagCounts.length > 0 && (
            <LensSection title="Tags" glyph="#">
              {tagCounts.map((t) => (
                <LensLink
                  key={t.name}
                  href={`${b}?tag=${encodeURIComponent(t.name)}`}
                  label={`#${t.name}`}
                  count={t.count}
                  active={scope.kind === 'tag' && scope.id === t.name}
                />
              ))}
            </LensSection>
          )}
        </aside>

        <main className="lib-main">
          <MainPane
            scope={scope}
            notes={notes}
            folders={folders}
            shelves={shelves}
            programmeId={programmeId}
          />
        </main>
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
  programmeId,
}: {
  scope: StudentLibraryScope;
  notes: StudentLibrarySnapshot['notes'];
  folders: StudentLibraryFolder[];
  shelves: StudentLibraryShelf[];
  programmeId: string;
}) {
  if (scope.kind === 'all-folders') {
    return (
      <FoldersGrid
        folders={folders}
        notes={notes}
        programmeId={programmeId}
      />
    );
  }
  if (scope.kind === 'all-shelves') {
    return (
      <ShelvesCarousel
        shelves={shelves}
        notes={notes}
        programmeId={programmeId}
      />
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
      programmeId={programmeId}
    />
  );
}

// A note list with a client-side search box over the scoped set.
function NotesPane({
  title,
  sub,
  crumb,
  notes,
  programmeId,
}: {
  title: string;
  sub: string;
  crumb: string;
  notes: StudentLibrarySnapshot['notes'];
  programmeId: string;
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
            {q.trim()
              ? 'No notes match your search.'
              : 'No notes here yet.'}
          </p>
        </div>
      ) : (
        <div className="lib-notes-list">
          {filtered.map((n) => (
            <StudentNoteRow
              key={n.note_id}
              note={n}
              programmeId={programmeId}
            />
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
  programmeId,
}: {
  folders: StudentLibraryFolder[];
  notes: StudentLibrarySnapshot['notes'];
  programmeId: string;
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
            href={`${base(programmeId)}?folder=${f.folder_id}`}
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
              {count(f.folder_id)} note
              {count(f.folder_id) === 1 ? '' : 's'}
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
  programmeId,
}: {
  shelves: StudentLibraryShelf[];
  notes: StudentLibrarySnapshot['notes'];
  programmeId: string;
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
                  href={`${base(programmeId)}?shelf=${s.shelf_id}`}
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
                    href={`${base(programmeId)}/note/${n.note_id}`}
                    className="lib-shelf-card lib-shelf-card-link"
                    style={
                      { '--shelf-accent': s.color } as React.CSSProperties
                    }
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
  count: number;
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
      <span className="cnt">{count}</span>
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
