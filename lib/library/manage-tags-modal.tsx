'use client';

// mynclex/lib/library/manage-tags-modal.tsx
//
// Manage-tags panel (slice 11.16b-2). Opened from the ⋮ on the Tags
// lens header. Lists every tag with its usage count and three bulk
// cleanup tools, each a single action across all of the tutor's notes:
//   • Rename — inline edit a tag everywhere (fixes typo / drift).
//   • Delete — remove a tag from every note (inline confirm first).
//   • Merge  — tick ≥2 tags, fold them into one target.
//
// Each op calls its server action, shows the affected-note count as an
// inline status line, and router.refresh()es so the list (a prop from
// the server) reflects the new counts. Errors surface via ErrorToast.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { deleteTagAction, mergeTagsAction, renameTagAction } from './actions';
import type { LibraryTagCount } from './types';

interface ManageTagsModalProps {
  tags: LibraryTagCount[];
  onClose: () => void;
}

function notes(n: number): string {
  return `${n} note${n === 1 ? '' : 's'}`;
}

export function ManageTagsModal({ tags, onClose }: ManageTagsModalProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [renameTag, setRenameTag] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeTarget, setMergeTarget] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  function resetRowState() {
    setRenameTag(null);
    setRenameDraft('');
    setConfirmDelete(null);
  }

  function toggleSelect(tag: string) {
    const willSelect = !selected.has(tag);
    const next = new Set(selected);
    if (willSelect) next.add(tag);
    else next.delete(tag);
    setSelected(next);
    if (willSelect && mergeTarget.trim() === '') setMergeTarget(tag);
    if (next.size === 0) setMergeTarget('');
  }

  async function doRename(e: React.FormEvent) {
    e.preventDefault();
    if (renameTag == null) return;
    const from = renameTag;
    const to = renameDraft.trim().toLowerCase();
    setPending(true);
    setError(null);
    const result = await renameTagAction(from, to);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(`Renamed “${from}” → “${to}” across ${notes(result.affected)}.`);
    resetRowState();
    router.refresh();
  }

  async function doDelete(tag: string) {
    setPending(true);
    setError(null);
    const result = await deleteTagAction(tag);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(`Removed “${tag}” from ${notes(result.affected)}.`);
    resetRowState();
    router.refresh();
  }

  async function doMerge() {
    const sources = Array.from(selected);
    const to = mergeTarget.trim().toLowerCase();
    setPending(true);
    setError(null);
    const result = await mergeTagsAction(sources, to);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(
      `Merged ${sources.length} tags into “${to}” across ${notes(result.affected)}.`,
    );
    setSelected(new Set());
    setMergeTarget('');
    resetRowState();
    router.refresh();
  }

  const renameValid =
    renameDraft.trim().length > 0 &&
    renameDraft.trim().toLowerCase() !== renameTag;

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Manage tags"
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) onClose();
        }}
      >
        <div className="prog-modal lib-modal-tags">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Manage tags</h2>
            <p className="lib-modal-sub">
              Clean up your tag vocabulary across every note. Renaming and
              merging fix drift like <i>cardic</i> / <i>cardiac</i>.
            </p>
          </header>

          <div className="prog-modal-body">
            {status && (
              <div className="lib-tag-status" role="status">
                {status}
              </div>
            )}

            {tags.length === 0 ? (
              <div className="lib-empty lib-empty-inline">
                <div className="lib-empty-glyph" aria-hidden="true">
                  🏷️
                </div>
                <p className="lib-empty-sub">
                  No tags yet. Add tags from a note&apos;s editor, then
                  manage them here.
                </p>
              </div>
            ) : (
              <>
                {selected.size >= 2 && (
                  <div className="lib-tag-merge-bar">
                    <span className="lib-tag-merge-label">
                      Merge {selected.size} tags into
                    </span>
                    <input
                      type="text"
                      className="lib-tag-merge-input"
                      value={mergeTarget}
                      onChange={(e) => setMergeTarget(e.target.value)}
                      placeholder="target tag"
                      maxLength={40}
                      aria-label="Merge target tag"
                    />
                    <button
                      type="button"
                      className="prog-btn prog-btn-primary prog-btn-sm"
                      onClick={doMerge}
                      disabled={pending || mergeTarget.trim().length === 0}
                    >
                      {pending ? 'Merging…' : 'Merge'}
                    </button>
                    <button
                      type="button"
                      className="prog-btn prog-btn-ghost prog-btn-sm"
                      onClick={() => {
                        setSelected(new Set());
                        setMergeTarget('');
                      }}
                      disabled={pending}
                    >
                      Clear
                    </button>
                  </div>
                )}

                <p className="lib-tag-manage-hint">
                  Tick two or more tags to merge them into one.
                </p>

                <ul className="lib-tag-manage-list">
                  {tags.map(({ tag, count }) => {
                    const isRenaming = renameTag === tag;
                    const isConfirming = confirmDelete === tag;
                    return (
                      <li key={tag} className="lib-tag-manage-row">
                        <input
                          type="checkbox"
                          className="lib-tag-check"
                          checked={selected.has(tag)}
                          onChange={() => toggleSelect(tag)}
                          disabled={pending || isRenaming || isConfirming}
                          aria-label={`Select ${tag} for merge`}
                        />

                        {isRenaming ? (
                          <form className="lib-tag-rename" onSubmit={doRename}>
                            <input
                              type="text"
                              className="lib-tag-rename-input"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              maxLength={40}
                              autoFocus
                              aria-label={`New name for ${tag}`}
                            />
                            <button
                              type="submit"
                              className="prog-btn prog-btn-primary prog-btn-sm"
                              disabled={pending || !renameValid}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="prog-btn prog-btn-ghost prog-btn-sm"
                              onClick={resetRowState}
                              disabled={pending}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : isConfirming ? (
                          <div className="lib-tag-confirm">
                            <span className="lib-tag-confirm-msg">
                              Delete <b>#{tag}</b> from {notes(count)}?
                            </span>
                            <button
                              type="button"
                              className="prog-btn prog-btn-danger prog-btn-sm"
                              onClick={() => doDelete(tag)}
                              disabled={pending}
                            >
                              {pending ? 'Deleting…' : 'Delete'}
                            </button>
                            <button
                              type="button"
                              className="prog-btn prog-btn-ghost prog-btn-sm"
                              onClick={resetRowState}
                              disabled={pending}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="lib-tag-name">
                              <span className="lens-tag-hash" aria-hidden="true">
                                #
                              </span>
                              {tag}
                            </span>
                            <span className="lib-tag-count">{notes(count)}</span>
                            <div className="lib-tag-row-actions">
                              <button
                                type="button"
                                className="lib-tag-row-btn"
                                onClick={() => {
                                  resetRowState();
                                  setRenameTag(tag);
                                  setRenameDraft(tag);
                                }}
                                disabled={pending}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="lib-tag-row-btn lib-tag-row-btn-danger"
                                onClick={() => {
                                  resetRowState();
                                  setConfirmDelete(tag);
                                }}
                                disabled={pending}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={onClose}
              disabled={pending}
            >
              Done
            </button>
          </footer>
        </div>
      </div>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
