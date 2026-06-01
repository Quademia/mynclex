// mynclex/lib/curriculum/shelf-viewer.tsx
//
// Slice 11.12b — the student's shelf popup. A shelf activity is several
// notes wearing one card; "Open" launches this table-of-contents rather
// than a single read view. Each member note links to its own read view
// (the same 11.13a destination a standalone Library Note activity uses)
// and shows the student's derived done state; "Go to shelf" jumps to the
// shelf view in the student library (?shelf=<id>).
//
// Completion is DERIVED — there's no "mark the shelf done" here; the
// shelf rolls up to done once every (visible, non-skipped) member is
// marked done from its own read view.

'use client';

import Link from 'next/link';
import { ViewerModalShell } from './viewer-modal-shell';
import type { StudentActivity } from './types';

export function ShelfViewer({
  activity,
  libraryBasePath,
  onClose,
}: {
  activity: StudentActivity;
  libraryBasePath?: string;
  onClose: () => void;
}) {
  const members = activity.shelfMembers ?? [];
  const doneCount = members.filter((m) => m.isDone).length;
  const total = members.length;

  return (
    <ViewerModalShell title={activity.title} onClose={onClose} size="wide">
      <div className="shelf-viewer">
        <p className="shelf-viewer-progress">
          {total === 0
            ? 'No notes to read in this shelf yet.'
            : `${doneCount} of ${total} note${total === 1 ? '' : 's'} done`}
        </p>

        {total > 0 && (
          <ul className="shelf-viewer-list">
            {members.map((m) => {
              const href = libraryBasePath
                ? `${libraryBasePath}/note/${m.note_id}`
                : null;
              return (
                <li
                  key={m.note_id}
                  className={
                    'shelf-viewer-item' + (m.isDone ? ' is-done' : '')
                  }
                >
                  <span className="shelf-viewer-item-state" aria-hidden="true">
                    {m.isDone ? '✓' : '○'}
                  </span>
                  <span className="shelf-viewer-item-main">
                    <span className="shelf-viewer-item-title">{m.title}</span>
                    {m.subtitle && (
                      <span className="shelf-viewer-item-sub">{m.subtitle}</span>
                    )}
                  </span>
                  {href ? (
                    <Link className="shelf-viewer-open" href={href}>
                      {m.isDone ? 'Reread' : 'Open'}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="shelf-viewer-open"
                      disabled
                    >
                      Open
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {libraryBasePath && activity.shelfId && (
          <div className="shelf-viewer-foot">
            <Link
              className="shelf-viewer-go"
              href={`${libraryBasePath}?shelf=${activity.shelfId}`}
            >
              Go to shelf ↗
            </Link>
          </div>
        )}
      </div>
    </ViewerModalShell>
  );
}
