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

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ViewerModalShell } from './viewer-modal-shell';
import { markShelfSeenAction } from './student-actions';
import type { StudentActivity } from './types';

// Slice 11.12c — copy for the drift-hint popup line.
function updateLine(update: { added: number; removed: number }): string {
  const parts: string[] = [];
  if (update.added > 0) {
    parts.push(`added ${update.added} note${update.added === 1 ? '' : 's'}`);
  }
  if (update.removed > 0) {
    parts.push(
      `removed ${update.removed} note${update.removed === 1 ? '' : 's'}`
    );
  }
  // At least one is > 0 (the map only carries non-empty changes).
  return `Your tutor ${parts.join(' and ')} since you last opened this shelf.`;
}

export function ShelfViewer({
  activity,
  libraryBasePath,
  onClose,
}: {
  activity: StudentActivity;
  libraryBasePath?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const members = activity.shelfMembers ?? [];
  const doneCount = members.filter((m) => m.isDone).length;
  const total = members.length;

  // Capture the drift hint on first render so the popup line stays put
  // for this open even after the mark-seen refresh below clears it from
  // the server data (which removes the card chip).
  const [update] = useState(activity.shelfUpdate);

  // Opening the shelf IS the acknowledgement — record the current visible
  // set as the new "seen" baseline, then refresh so the card chip clears.
  useEffect(() => {
    let live = true;
    markShelfSeenAction(
      activity.activity_id,
      members.map((m) => m.note_id)
    ).then(() => {
      if (live) router.refresh();
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.activity_id]);

  return (
    <ViewerModalShell title={activity.title} onClose={onClose} size="wide">
      <div className="shelf-viewer">
        {update && (
          <p className="shelf-viewer-update">
            <span aria-hidden="true">🔄</span> {updateLine(update)}
          </p>
        )}

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
