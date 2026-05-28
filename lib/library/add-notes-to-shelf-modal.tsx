// mynclex/lib/library/add-notes-to-shelf-modal.tsx
//
// Multi-select picker that adds existing notes to a shelf. Mounted
// from the dashed `+ Add to shelf` tile at the end of each carousel
// row, or from the empty-shelf "+ Add notes" CTA.
//
// Eligibility: every note the tutor owns that ISN'T already on this
// shelf — both DRAFT and PUBLISHED per the 11.3b scope decision.
// Shelves don't gate visibility, so a draft note on a shelf is
// harmless; the row's status pill (Pub / Draft) makes the
// distinction visible without blocking the workflow.
//
// CD source: `tutor-library/note-editor.jsx` → AddNotesToShelfDialog.
// Adaptations from the CD prototype:
//   • CD gated to status=PUBLISHED only; we ship both per scope.
//   • CD uses inline styles for the row chrome; we use the existing
//     prog-modal-* + new lib-picker-* class family.
//   • CD's "also on N shelf" hint badge moves into our row meta
//     line for the same purpose.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { attachNotesToShelfAction } from './actions';
import type {
  LibraryEligibleNote,
  LibraryShelfWithCount,
} from './types';

interface AddNotesToShelfModalProps {
  shelf: LibraryShelfWithCount;
  /** All folders owned by the tutor — drives the folder-filter dropdown. */
  folders: Array<{ folder_id: string; name: string }>;
  /** Eligible notes (already filtered to "not on this shelf" upstream). */
  eligibleNotes: LibraryEligibleNote[];
  onClose: () => void;
}

export function AddNotesToShelfModal({
  shelf,
  folders,
  eligibleNotes,
  onClose,
}: AddNotesToShelfModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Picker state — multi-select set + free-text search + folder filter.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  // 'all' = no filter; 'root' = notes with folder_id NULL;
  // <uuid> = a specific folder.
  const [folderFilter, setFolderFilter] = useState<string>('all');

  // Reset on shelf change (the modal is keyed off shelfId at the
  // mount level, so this fires once per open).
  useEffect(() => {
    setPicked(new Set());
    setQuery('');
    setFolderFilter('all');
    setError(null);
  }, [shelf.shelf_id]);

  // Apply search + folder filter to the eligible list.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return eligibleNotes.filter((n) => {
      if (folderFilter === 'root' && n.folder_id != null) return false;
      if (folderFilter !== 'all' && folderFilter !== 'root') {
        if (n.folder_id !== folderFilter) return false;
      }
      if (q.length === 0) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        (n.subtitle ?? '').toLowerCase().includes(q) ||
        (n.folder_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [eligibleNotes, query, folderFilter]);

  function togglePick(noteId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }

  function pickAll() {
    setPicked(new Set(filtered.map((n) => n.note_id)));
  }

  function clearAll() {
    setPicked(new Set());
  }

  function attemptClose() {
    if (isPending) return;
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  function handleSubmit() {
    if (picked.size === 0 || isPending) return;
    setError(null);
    const noteIds = Array.from(picked);
    startTransition(async () => {
      const result = await attachNotesToShelfAction(shelf.shelf_id, noteIds);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const submitLabel =
    picked.size === 0
      ? 'Select notes to add'
      : `Add ${picked.size} note${picked.size === 1 ? '' : 's'} to shelf`;

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Add notes to ${shelf.title}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal lib-modal-add-to-shelf">
          <header className="prog-modal-header">
            <div>
              <h2 className="prog-modal-title lib-add-to-shelf-title">
                <span
                  className="lib-shelf-tag-dot"
                  style={{ background: shelf.color }}
                  aria-hidden="true"
                />
                Add notes to{' '}
                <em
                  className="lib-add-to-shelf-name"
                  style={{ color: shelf.color }}
                >
                  {shelf.title}
                </em>
              </h2>
              <p className="lib-modal-sub">
                Multi-select notes. A note can sit on many shelves — adding
                here doesn&apos;t move it out of its folder or change its
                visibility.
              </p>
            </div>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={attemptClose}
              disabled={isPending}
            >
              ✕
            </button>
          </header>

          <div className="prog-modal-body">
            <div className="lib-picker-toolbar">
              <input
                type="search"
                className="prog-input lib-picker-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, subtitle, folder…"
                disabled={isPending}
              />
              <select
                className="prog-input lib-picker-folder"
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                disabled={isPending}
              >
                <option value="all">All folders</option>
                <option value="root">Root (no folder)</option>
                {folders.map((f) => (
                  <option key={f.folder_id} value={f.folder_id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="lib-picker-summary">
              <span>
                {filtered.length} eligible · {picked.size} selected
              </span>
              <span className="lib-picker-summary-actions">
                {filtered.length > 0 && (
                  <button
                    type="button"
                    className="lib-picker-textbtn"
                    onClick={pickAll}
                    disabled={isPending}
                  >
                    Select all
                  </button>
                )}
                {picked.size > 0 && (
                  <button
                    type="button"
                    className="lib-picker-textbtn"
                    onClick={clearAll}
                    disabled={isPending}
                  >
                    Clear
                  </button>
                )}
              </span>
            </div>

            <div className="lib-picker-list">
              {filtered.length === 0 ? (
                <div className="lib-picker-empty">
                  {query.length > 0 || folderFilter !== 'all'
                    ? 'No notes match those filters.'
                    : eligibleNotes.length === 0
                      ? 'Every one of your notes is already on this shelf.'
                      : 'No notes available.'}
                </div>
              ) : (
                filtered.map((n) => {
                  const isPicked = picked.has(n.note_id);
                  return (
                    <button
                      key={n.note_id}
                      type="button"
                      className={`lib-picker-row${isPicked ? ' is-picked' : ''}`}
                      onClick={() => togglePick(n.note_id)}
                      disabled={isPending}
                    >
                      <span
                        className={`lib-picker-check${isPicked ? ' is-on' : ''}`}
                        aria-hidden="true"
                      >
                        {isPicked && '✓'}
                      </span>
                      <span className="lib-picker-main">
                        <span className="lib-picker-title">{n.title}</span>
                        {n.subtitle && (
                          <span className="lib-picker-subtitle">
                            {n.subtitle}
                          </span>
                        )}
                        <span className="lib-picker-meta">
                          <span>{n.folder_name ?? 'Root'}</span>
                          {n.other_shelf_count > 0 && (
                            <>
                              <span className="sep">·</span>
                              <span>
                                also on {n.other_shelf_count} shelf
                                {n.other_shelf_count === 1 ? '' : 'es'}
                              </span>
                            </>
                          )}
                          {n.pillars[0] && (
                            <>
                              <span className="sep">·</span>
                              <span>{n.pillars[0]}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <span
                        className={`lib-picker-status lib-picker-status-${n.is_published ? 'pub' : 'draft'}`}
                      >
                        {n.is_published ? 'Pub' : 'Draft'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="lib-hint">
              <span className="lib-hint-icon" aria-hidden="true">
                i
              </span>
              <div>
                <b>Both drafts and published notes are eligible.</b> Shelves
                don&apos;t gate visibility — students still only see notes
                their enrolment allows. Pre-organising drafts into shelves
                is fine.
              </div>
            </div>
          </div>

          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={attemptClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-primary"
              onClick={handleSubmit}
              disabled={picked.size === 0 || isPending}
            >
              {isPending ? 'Adding…' : submitLabel}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
