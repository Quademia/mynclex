// mynclex/lib/library/notes-list.tsx
//
// Per-folder notes list (slice 11.2b). Rendered in the main pane when
// a specific folder is selected (?folder=<uuid>). Mirrors the
// AllFoldersGrid header pattern; lists the folder's notes as lens
// rows via the shared <NoteLensRow>.
//
// 11.16c follow-on: the header grows Edit + Delete actions so a tutor
// managing the folder they're viewing doesn't have to round-trip to
// the sidebar kebab. Both reuse the same modals the kebab does;
// deleting from here navigates to All folders (the current URL would
// 404 on the gone folder).

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { NoteLensRow } from './note-lens-row';
import { NewFolderModal } from './new-folder-modal';
import { DeleteFolderConfirm } from './delete-folder-confirm';
import type { LibraryFolderWithCount, LibraryNoteListRow } from './types';

interface NotesListProps {
  notes: LibraryNoteListRow[];
  /** The folder being viewed — drives the header + Edit/Delete. */
  folder: LibraryFolderWithCount;
  /** All folders, for the edit modal's dup-check. */
  folders: LibraryFolderWithCount[];
  onNewNote: () => void;
}

export function NotesList({
  notes,
  folder,
  folders,
  onNewNote,
}: NotesListProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="lib-notes-list-pane">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <Link
              href="/tutor/library?folder=all"
              className="lib-pane-crumb-link"
            >
              Folders
            </Link>
            <span className="sep">/</span>
            <span className="b">{folder.name}</span>
          </div>
          <h1 className="lib-pane-title">{folder.name}</h1>
          {folder.description && (
            <p className="lib-pane-sub">{folder.description}</p>
          )}
        </div>
        <div className="lib-pane-actions">
          <button
            className="lib-btn lib-btn-sm"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            className="lib-btn lib-btn-sm lib-btn-danger"
            type="button"
            onClick={() => setDeleting(true)}
          >
            Delete
          </button>
          <button
            className="lib-btn lib-btn-primary"
            type="button"
            onClick={onNewNote}
          >
            + New note
          </button>
        </div>
      </header>

      {notes.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            📁
          </div>
          <p className="lib-empty-sub">
            This folder has no notes yet. Create one with{' '}
            <strong>+ New note</strong>.
          </p>
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

      {editing && (
        <NewFolderModal
          existingFolders={folders}
          variant={{ mode: 'edit', folder }}
          onClose={() => setEditing(false)}
        />
      )}

      {deleting && (
        <DeleteFolderConfirm
          folder={folder}
          redirectTo="/tutor/library?folder=all"
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
