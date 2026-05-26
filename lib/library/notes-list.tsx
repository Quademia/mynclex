// mynclex/lib/library/notes-list.tsx
//
// Per-folder (or root) notes list in the main pane (slice 11.2b).
// Each row uses the "per-note lens row" shape from the CD prototype:
//   title (+ subtitle inline) ↘
//                              description fallback (or subtitle if
//                              no description)
//                              pillar chips · #tag · #tag
//                                                       state pill →
//
// Rows are <Link>-based — clicking anywhere on the row opens the
// editor route. The state pill (Draft / Pub) is informational only.

'use client';

import Link from 'next/link';
import type { LibraryNoteListRow } from './types';
import { lensRowFallback, pillarShortName } from './format';

interface NotesListProps {
  notes: LibraryNoteListRow[];
  /** The folder this list is for — drives the header copy. Null = root. */
  folderName: string | null;
  folderDescription?: string | null;
  onNewNote: () => void;
}

export function NotesList({
  notes,
  folderName,
  folderDescription,
  onNewNote,
}: NotesListProps) {
  return (
    <div className="lib-all-folders">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <span className="b">{folderName ?? 'Root'}</span>
          </div>
          <h2 className="lib-pane-title">{folderName ?? 'Root notes'}</h2>
          {folderDescription && (
            <p className="lib-pane-sub">{folderDescription}</p>
          )}
          {!folderName && !folderDescription && (
            <p className="lib-pane-sub">
              Notes not filed under any folder. Reparent any note from
              its editor if you want it inside one.
            </p>
          )}
        </div>
        <button
          type="button"
          className="lib-btn lib-btn-primary"
          onClick={onNewNote}
        >
          + New note
        </button>
      </header>

      {notes.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">📒</div>
          <p className="lib-empty-sub">
            This folder is empty. Create your first note to start
            building this section of your library.
          </p>
          <button
            type="button"
            className="lib-btn lib-btn-primary"
            onClick={onNewNote}
          >
            + New note
          </button>
        </div>
      ) : (
        <ul className="lib-notes-list">
          {notes.map((n) => (
            <li key={n.note_id}>
              <Link
                href={`/tutor/library/note/${n.note_id}`}
                className="lib-note-row"
              >
                <div className="lib-note-row-main">
                  <div className="lib-note-title-line">
                    <span className="lib-note-title">{n.title}</span>
                    {n.subtitle && (
                      <span className="lib-note-subtitle">{n.subtitle}</span>
                    )}
                  </div>
                  {lensRowFallback(n.description, n.subtitle) && (
                    <div className="lib-note-desc">
                      {lensRowFallback(n.description, n.subtitle)}
                    </div>
                  )}
                  <div className="lib-note-meta">
                    {n.pillars.map((p) => (
                      <span
                        key={p}
                        className="lib-meta-chip"
                        title={p}
                      >
                        {pillarShortName(p)}
                      </span>
                    ))}
                    {n.tags.length > 0 && n.pillars.length > 0 && (
                      <span className="lib-note-sep" aria-hidden="true">·</span>
                    )}
                    {n.tags.map((t) => (
                      <span key={t} className="lib-tag-inline">#{t}</span>
                    ))}
                  </div>
                </div>
                <div className="lib-note-row-side">
                  <span
                    className={`lib-state-pill is-${
                      n.is_published ? 'pub' : 'draft'
                    }`}
                  >
                    {n.is_published ? 'Pub' : 'Draft'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
