// mynclex/lib/library/student/student-note-row.tsx
//
// Read-only per-note row for the student library (slice 11.14). The
// student-side counterpart to the tutor's <NoteLensRow>: same left
// "lens row" meta (📁 folder · shelf pips · pillar chips · #tags) and
// the same CSS classes for visual consistency, but:
//
//   • the row links to the student READ view (slice 11.13), not the
//     editor;
//   • the right-hand state column (Pub/Draft · used-in · edited) is
//     dropped — every note a student sees is published, and the
//     tutor-facing usage/timestamps aren't the student's concern.
//
// The "Unit task · Week N" pill + reading-time that the CD prototype
// shows on the right are deferred: the unit pill needs note-as-activity
// attachments (slice 11.11) and reading-time wants a stored estimate.
// Until then the left meta carries the row.

'use client';

import Link from 'next/link';
import { lensRowFallback, pillarShortName } from '../format';
import type { LibraryNoteLensRow } from '../types';

interface StudentNoteRowProps {
  note: LibraryNoteLensRow;
  /** Route base for this library, e.g. `/student/programme/<id>/library`. */
  basePath: string;
}

export function StudentNoteRow({ note, basePath }: StudentNoteRowProps) {
  const fallbackLine = lensRowFallback(note.description, note.subtitle);

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
        {fallbackLine && <div className="lib-note-desc">{fallbackLine}</div>}
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
    </Link>
  );
}
