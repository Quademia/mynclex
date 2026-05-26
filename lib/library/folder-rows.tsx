// mynclex/lib/library/folder-rows.tsx
//
// Folder lens body for the tutor library sidebar (slice 11.2a).
// Replaces the static "no folders yet" copy that 11.1b shipped with
// real folder rows fed from `getFoldersForTutor()`.
//
// Selection state is URL-driven: `?folder=<uuid>` for a specific
// folder, `?folder=all` for the All-folders grid. The component
// uses Next's <Link> components so clicks behave like real
// navigation (browser-back, middle-click open-in-new-tab, etc.) —
// no client-side state for selection.
//
// Active state lights up the row whose folder_id matches the
// current `?folder` param.

'use client';

import Link from 'next/link';
import type { LibraryFolderWithCount } from './types';

interface FolderRowsProps {
  folders: LibraryFolderWithCount[];
  /** The currently-selected ?folder= value, or null when unset. */
  selected: string | null;
}

export function FolderRows({ folders, selected }: FolderRowsProps) {
  const totalFolders = folders.length;
  const allActive = selected === 'all';

  return (
    <>
      <Link
        href="/tutor/library?folder=all"
        className={`lens-item${allActive ? ' is-active' : ''}`}
        aria-current={allActive ? 'page' : undefined}
      >
        <span className="label">All folders</span>
        <span className="cnt">{totalFolders}</span>
      </Link>

      {folders.length === 0 ? (
        <div className="lens-empty">
          No folders yet — create one with + New folder.
        </div>
      ) : (
        folders.map((f) => {
          const active = selected === f.folder_id;
          return (
            <Link
              key={f.folder_id}
              href={`/tutor/library?folder=${f.folder_id}`}
              className={`lens-item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={f.description ?? undefined}
            >
              <span className="label">{f.name}</span>
              <span className="cnt">{f.note_count}</span>
            </Link>
          );
        })
      )}
    </>
  );
}
