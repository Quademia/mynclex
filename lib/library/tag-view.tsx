// mynclex/lib/library/tag-view.tsx
//
// Tag-filtered main pane (slice 11.16b-1). Mounted at `?tag=<tag>`.
// Lists every note carrying the tag via the canonical <NoteLensRow>.

import Link from 'next/link';
import { NoteLensRow } from './note-lens-row';
import type { LibraryNoteLensRow } from './types';

export function TagView({
  tag,
  notes,
}: {
  tag: string;
  notes: LibraryNoteLensRow[];
}) {
  return (
    <div className="lib-notes-view">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <span className="b">Tags</span>
            <span className="sep">/</span>
            <span className="b">#{tag}</span>
          </div>
          <h1 className="lib-pane-title">
            <span className="lens-tag-hash" aria-hidden="true">
              #
            </span>
            {tag}
          </h1>
          <p className="lib-pane-sub">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} tagged
            “{tag}”.
          </p>
        </div>
      </header>

      {notes.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            🏷️
          </div>
          <p className="lib-empty-sub">
            No notes carry this tag anymore.
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
    </div>
  );
}
