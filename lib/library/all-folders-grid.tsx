// mynclex/lib/library/all-folders-grid.tsx
//
// "All folders" view in the main pane (slice 11.2a). Shown when
// `?folder=all` is in the URL. Renders the tutor's folders as
// large clickable cards in a CSS grid, with a dashed "New folder"
// card at the end of the grid as a repeat affordance.
//
// Each card carries: folder icon + name + description (optional) +
// "N notes" count line. Recency ("edited 2d ago") that the CD
// prototype shows isn't here yet — pure polish, can land in a
// follow-up.

'use client';

import Link from 'next/link';
import type { LibraryFolderWithCount } from './types';

interface AllFoldersGridProps {
  folders: LibraryFolderWithCount[];
  onNewFolder: () => void;
}

export function AllFoldersGrid({
  folders,
  onNewFolder,
}: AllFoldersGridProps) {
  return (
    <div className="lib-all-folders">
      <header className="lib-pane-head">
        <div>
          <div className="lib-pane-crumb">
            <Link href="/tutor/library" className="lib-pane-crumb-link">
              Library
            </Link>
            <span className="sep">/</span>
            <span className="b">All folders</span>
          </div>
          <h2 className="lib-pane-title">All folders</h2>
          <p className="lib-pane-sub">
            Your primary filing bin. Flat — one folder per note in v1.
          </p>
        </div>
        <button
          type="button"
          className="lib-btn lib-btn-primary"
          onClick={onNewFolder}
        >
          + New folder
        </button>
      </header>

      {folders.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            📁
          </div>
          <p className="lib-empty-sub">
            You don&apos;t have any folders yet. Create your first one
            to start organising your library.
          </p>
          <button
            type="button"
            className="lib-btn lib-btn-primary"
            onClick={onNewFolder}
          >
            + New folder
          </button>
        </div>
      ) : (
        <div className="lib-folder-grid">
          {folders.map((f) => (
            <Link
              key={f.folder_id}
              href={`/tutor/library?folder=${f.folder_id}`}
              className="lib-folder-card"
            >
              <div className="lib-folder-card-ic" aria-hidden="true">
                📁
              </div>
              <div className="lib-folder-card-title">{f.name}</div>
              {f.description && (
                <div className="lib-folder-card-desc">{f.description}</div>
              )}
              <div className="lib-folder-card-meta">
                {f.note_count} {f.note_count === 1 ? 'note' : 'notes'}
              </div>
            </Link>
          ))}
          <button
            type="button"
            className="lib-folder-card lib-folder-card-new"
            onClick={onNewFolder}
          >
            <div className="lib-folder-card-ic" aria-hidden="true">
              +
            </div>
            <div className="lib-folder-card-title">New folder</div>
          </button>
        </div>
      )}
    </div>
  );
}
