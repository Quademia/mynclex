// mynclex/lib/library/saved-view-pane.tsx
//
// Saved custom-view main pane (slice 11.16c-2). Mounted at
// `?view=<uuid>`. Shows the view's name, a read-only summary of its
// filter combo, and the matching note list — plus the management
// actions that live here (roomy) rather than in the scroll-capped
// sidebar: Edit (→ builder seeded), Rename (inline), Delete (confirm).

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { NoteLensRow } from './note-lens-row';
import { pillarShortName } from './format';
import { deleteViewAction, renameViewAction } from './view-actions';
import { isEmptyFilters, type LibrarySavedView } from './view-filters';
import type { LibraryNoteLensRow } from './types';

interface SavedViewPaneProps {
  view: LibrarySavedView;
  notes: LibraryNoteLensRow[];
}

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  draft: 'Drafts',
};

export function SavedViewPane({ view, notes }: SavedViewPaneProps) {
  const router = useRouter();
  const { filters } = view;

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(view.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doRename(e: React.FormEvent) {
    e.preventDefault();
    const next = nameDraft.trim();
    if (next.length === 0 || next === view.name) {
      setRenaming(false);
      setNameDraft(view.name);
      return;
    }
    setPending(true);
    setError(null);
    const result = await renameViewAction(view.view_id, next);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRenaming(false);
    router.refresh();
  }

  async function doDelete() {
    setPending(true);
    setError(null);
    const result = await deleteViewAction(view.view_id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push('/tutor/library?view=all-notes');
  }

  const noFilters = isEmptyFilters(filters);

  return (
    <div className="lib-notes-view lib-saved-view">
      <header className="lib-pane-head">
        <div className="lib-saved-view-head">
          <div className="lib-saved-view-head-main">
            <div className="lib-pane-crumb">
              <Link href="/tutor/library" className="lib-pane-crumb-link">
                Library
              </Link>
              <span className="sep">/</span>
              <span className="b">Views</span>
              <span className="sep">/</span>
              <span className="b">{view.name}</span>
            </div>

            {renaming ? (
              <form className="lib-saved-view-rename" onSubmit={doRename}>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={60}
                  autoFocus
                  aria-label="View name"
                />
                <button
                  type="submit"
                  className="lib-btn lib-btn-primary lib-btn-sm"
                  disabled={pending || nameDraft.trim().length === 0}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="lib-btn lib-btn-sm"
                  onClick={() => {
                    setRenaming(false);
                    setNameDraft(view.name);
                  }}
                  disabled={pending}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <h1 className="lib-pane-title">{view.name}</h1>
            )}

            <p className="lib-pane-sub">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'} ·{' '}
              {noFilters ? (
                'All notes'
              ) : (
                <span className="lib-saved-view-summary">
                  {filters.status !== 'any' && (
                    <span className="lib-sv-pill">
                      {STATUS_LABEL[filters.status]}
                    </span>
                  )}
                  {filters.pillars.map((p) => (
                    <span key={p} className="lib-sv-pill lib-sv-pill-pillar">
                      ◆ {pillarShortName(p)}
                    </span>
                  ))}
                  {filters.tags.map((t) => (
                    <span key={t} className="lib-sv-pill lib-sv-pill-tag">
                      #{t}
                    </span>
                  ))}
                </span>
              )}
            </p>
          </div>

          {!renaming && (
            <div className="lib-saved-view-actions">
              <Link
                href={`/tutor/library?view=${view.view_id}&edit=1`}
                className="lib-btn lib-btn-sm"
              >
                Edit filters
              </Link>
              <button
                type="button"
                className="lib-btn lib-btn-sm"
                onClick={() => setRenaming(true)}
                disabled={pending}
              >
                Rename
              </button>
              <button
                type="button"
                className="lib-btn lib-btn-sm lib-btn-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </header>

      {notes.length === 0 ? (
        <div className="lib-empty lib-empty-inline">
          <div className="lib-empty-glyph" aria-hidden="true">
            🔍
          </div>
          <p className="lib-empty-sub">
            No notes match this view right now. Edit its filters to widen
            the net, or this combo simply has nothing in it yet.
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

      {confirmDelete && (
        <div
          className="prog-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Delete view"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setConfirmDelete(false);
          }}
        >
          <div className="prog-modal lib-modal-confirm">
            <header className="prog-modal-header">
              <h2 className="prog-modal-title">Delete this view?</h2>
            </header>
            <div className="prog-modal-body">
              <p>
                “{view.name}” will be removed from your Views sidebar. Your
                notes aren&apos;t touched — a view is just a saved filter.
              </p>
            </div>
            <footer className="prog-modal-footer">
              <button
                type="button"
                className="prog-btn prog-btn-ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="prog-btn prog-btn-danger"
                onClick={doDelete}
                disabled={pending}
              >
                {pending ? 'Deleting…' : 'Delete view'}
              </button>
            </footer>
          </div>
        </div>
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}

/** Stale `?view=<uuid>` — view id doesn't match any of the tutor's. */
export function ViewNotFound() {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph" aria-hidden="true">
        ❔
      </div>
      <h2 className="lib-empty-title">View not found</h2>
      <p className="lib-empty-sub">
        That view doesn&apos;t exist (or isn&apos;t yours). Pick one from the
        Views sidebar, or build a new one.
      </p>
    </div>
  );
}
