// mynclex/lib/library/notes-list.tsx
//
// Per-folder (or root) notes list in the main pane.
//
// Slice 11.2b shipped this with a bespoke row layout. The 11.4
// follow-on slice consolidates every full-width note row onto the
// shared `<NoteLensRow>` component — same data shape, same visual,
// across folder list / shelf detail / future Views.

'use client';

import Link from 'next/link';
import { NoteLensRow } from './note-lens-row';
import type { LibraryNoteListRow } from './types';

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
              <NoteLensRow note={n} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
