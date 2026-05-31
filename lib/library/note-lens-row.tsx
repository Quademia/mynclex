// mynclex/lib/library/note-lens-row.tsx
//
// Canonical "per-note lens row" component (slice 11.4 follow-on,
// P3 + P4 bundle).
//
// One component, used everywhere the library renders a note as a
// full-width clickable row — folder list, shelf detail, future All
// Notes / Drafts / Used nowhere views. The carousel card stays
// distinct because horizontal scroll demands a compact card.
//
// Renders per the planning doc's lens-row spec:
//   • Title + inline subtitle
//   • Description-or-body-excerpt fallback (2-line clamp)
//   • Inline meta — 📁 folder · coloured shelf pip(s) · pillar
//     chips · #tags
//   • Right column — Pub/Draft pill + ↳ used in N + edited Xd ago
//
// Optional props let callers add a number prefix (for shelf
// detail's ordered list) and exclude a particular shelf from the
// pip cluster (so shelf-detail rows don't repeat the page-scope
// shelf's pip).
//
// The row IS a <Link> — clicking anywhere navigates to the editor.
// External affordances (reorder arrows, hover ✕) live as siblings
// of this component, positioned absolutely over the row, with
// stopPropagation on their click handlers.

'use client';

import Link from 'next/link';
import { formatRelative, lensRowFallback, pillarShortName } from './format';
import type { LibraryNoteLensRow as LibraryNoteLensRowData } from './types';

interface NoteLensRowProps {
  note: LibraryNoteLensRowData;
  /**
   * When set, prepends a tabular-numerals number column to the row
   * (e.g. `1.`, `2.`). Used by the shelf-detail numbered list.
   */
  numberPrefix?: number;
  /**
   * When set, filters this shelf_id out of the pip cluster. Used
   * by shelf-detail rows so they don't render the page-scope
   * shelf's pip on every row.
   */
  excludeShelfId?: string;
}

export function NoteLensRow({
  note,
  numberPrefix,
  excludeShelfId,
}: NoteLensRowProps) {
  const fallbackLine = lensRowFallback(note.description, note.subtitle);
  const pips = excludeShelfId
    ? note.shelf_memberships.filter((s) => s.shelf_id !== excludeShelfId)
    : note.shelf_memberships;

  return (
    <Link
      href={`/tutor/library/note/${note.note_id}`}
      className="lib-note-lens-row"
    >
      {numberPrefix != null && (
        <span className="lib-note-lens-num" aria-hidden="true">
          {numberPrefix}.
        </span>
      )}
      <div className="lib-note-lens-main">
        <div className="lib-note-title-line">
          <span className="lib-note-title">{note.title}</span>
          {note.subtitle && (
            <span className="lib-note-subtitle">{note.subtitle}</span>
          )}
        </div>
        {fallbackLine && (
          <div className="lib-note-desc">{fallbackLine}</div>
        )}
        <div className="lib-note-meta">
          {note.folder_name && (
            <span className="lib-meta-chip lib-meta-chip-folder">
              <span aria-hidden="true">📁</span> {note.folder_name}
            </span>
          )}
          {pips.map((s) => (
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
      <div className="lib-note-lens-state">
        <span
          className={`lib-state-pill is-${
            note.is_published ? 'pub' : 'draft'
          }`}
        >
          {note.is_published ? 'Pub' : 'Draft'}
        </span>
        {note.used_in_count > 0 && (
          <span
            className="lib-state-used"
            title={`Attached to ${note.used_in_count} programme unit${
              note.used_in_count === 1 ? '' : 's'
            }`}
          >
            ↳ used in {note.used_in_count}
          </span>
        )}
        <span
          className="lib-state-edited"
          title={`Last edited ${new Date(note.updated_at).toLocaleString()}`}
        >
          edited {formatRelative(note.updated_at)}
        </span>
      </div>
    </Link>
  );
}
