// mynclex/lib/library/search-results.tsx
//
// Search-results main pane (slice 11.16a). Mounted at `?q=<term>`
// (with an optional `?qf=` field scope). Renders the canonical
// lens-row list via <NoteLensRow>, ordered by relevance (title
// matches first — that ordering is decided server-side by the
// `nclex_search_library_notes` RPC's ts_rank).

import Link from 'next/link';
import { NoteLensRow } from './note-lens-row';
import {
  LIBRARY_SEARCH_FIELDS,
  type LibraryNoteLensRow,
  type LibrarySearchField,
  type LibrarySearchFieldFlags,
} from './types';

const FIELD_LABEL: Record<LibrarySearchField, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  description: 'Description',
  body: 'Body',
};

export function SearchResults({
  query,
  fields,
  notes,
}: {
  query: string;
  fields: LibrarySearchFieldFlags;
  notes: LibraryNoteLensRow[];
}) {
  const onFields = LIBRARY_SEARCH_FIELDS.filter((f) => fields[f]);
  const allOn = onFields.length === LIBRARY_SEARCH_FIELDS.length;

  return (
    <div className="lib-notes-view">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <span className="b">Search</span>
          </div>
          <h1 className="lib-pane-title">Results for “{query}”</h1>
          <p className="lib-pane-sub">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} matched
            {allOn
              ? ''
              : ` · searching ${onFields
                  .map((f) => FIELD_LABEL[f])
                  .join(', ')}`}
            . Title matches rank first.
          </p>
        </div>
      </header>

      {notes.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            🔍
          </div>
          <p className="lib-empty-sub">
            No notes matched “{query}”. Try fewer or different words, or
            widen the field filters above.
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
