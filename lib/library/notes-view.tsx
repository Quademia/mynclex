// mynclex/lib/library/notes-view.tsx
//
// System view main pane (slice 11.4 follow-on P2). Mounted at
// `?view=<key>` for key ∈ all-notes | drafts | used-nowhere.
//
// Renders the canonical lens-row list via <NoteLensRow>, with a
// view-specific header crumb / title / sub-line and a view-specific
// empty-state hint.

'use client';

import Link from 'next/link';
import { NoteLensRow } from './note-lens-row';
import type { LibraryNoteLensRow, LibraryViewKey } from './types';

interface NotesViewProps {
  viewKey: LibraryViewKey;
  notes: LibraryNoteLensRow[];
}

const VIEW_TITLE: Record<LibraryViewKey, string> = {
  'all-notes': 'All notes',
  drafts: 'Drafts',
  'used-nowhere': 'Not in a programme',
};

const VIEW_SUB: Record<LibraryViewKey, string> = {
  'all-notes':
    'Every note you own, newest edits first. Filters and search land in a future polish slice.',
  drafts:
    'Notes that haven’t been published yet — students don’t see these. Publish them from each note’s editor when slice 11.10 ships.',
  'used-nowhere':
    'Notes that aren’t attached to any programme unit. Useful for spotting orphan content you’d like to put to work.',
};

const VIEW_EMPTY: Record<LibraryViewKey, { glyph: string; copy: string }> = {
  'all-notes': {
    glyph: '📒',
    copy: "You don't have any notes yet. Start with + New note from the toolbar.",
  },
  drafts: {
    glyph: '✓',
    copy: 'No drafts — everything is published.',
  },
  'used-nowhere': {
    glyph: '✓',
    copy: 'Every note is doing some work — none of them are orphans.',
  },
};

export function NotesView({ viewKey, notes }: NotesViewProps) {
  const empty = VIEW_EMPTY[viewKey];

  return (
    <div className="lib-notes-view">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <span className="b">{VIEW_TITLE[viewKey]}</span>
          </div>
          <h1 className="lib-pane-title">{VIEW_TITLE[viewKey]}</h1>
          <p className="lib-pane-sub">{VIEW_SUB[viewKey]}</p>
        </div>
      </header>

      {notes.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            {empty.glyph}
          </div>
          <p className="lib-empty-sub">{empty.copy}</p>
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
