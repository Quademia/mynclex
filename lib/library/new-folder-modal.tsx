// mynclex/lib/library/new-folder-modal.tsx
//
// Create-folder modal for the tutor library (slice 11.2a). One
// section, two fields:
//   • Name (required, 2..60 chars, no duplicates within the tutor's
//     library — uniqueness checked client-side against the
//     pre-fetched folder list as well as server-side in
//     createFolderAction).
//   • Description (optional, ≤280 chars). Shown on folder cards
//     and as a sub-head on the folder scope page (when the page
//     ships in 11.2b).
//
// The CD prototype includes a third field — "Open editor with a
// new draft note in this folder" checkbox — that ships in slice
// 11.2b once the note editor route exists. For 11.2a the checkbox
// is omitted; new folders just appear in the sidebar.
//
// Class family `prog-modal-*` is reused from the existing programme/
// cohort modals so we don't re-style the same surface in two places.
// Library-specific touches (the hint card at the bottom, the field
// hint copy) live inline.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createFolderAction } from './actions';
import type { LibraryFolderWithCount } from './types';

const NAME_MIN = 2;
const NAME_MAX = 60;
const DESC_MAX = 280;

interface NewFolderModalProps {
  /** Existing folders, used for the client-side duplicate-name check. */
  existingFolders: LibraryFolderWithCount[];
  onClose: () => void;
}

export function NewFolderModal({
  existingFolders,
  onClose,
}: NewFolderModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const trimmedName = name.trim();
  const isDirty = trimmedName.length > 0 || description.trim().length > 0;

  // Build a case-insensitive set of existing names for the dup check.
  const existingNamesLower = useMemo(
    () => new Set(existingFolders.map((f) => f.name.toLowerCase())),
    [existingFolders],
  );
  const isDuplicate =
    trimmedName.length > 0 && existingNamesLower.has(trimmedName.toLowerCase());
  const isTooShort = trimmedName.length > 0 && trimmedName.length < NAME_MIN;
  const isTooLong = trimmedName.length > NAME_MAX;
  const isDescTooLong = description.length > DESC_MAX;

  const canSubmit =
    trimmedName.length >= NAME_MIN &&
    !isTooLong &&
    !isDuplicate &&
    !isDescTooLong &&
    !isPending;

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending]);

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createFolderAction({
        name: trimmedName,
        description: description.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="New folder"
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal lib-modal-folder">
          <header className="prog-modal-header">
            <div>
              <h2 className="prog-modal-title">New folder</h2>
              <p className="lib-modal-sub">
                Your primary filing bin. Tutor-scoped — students see the
                same folders you do, just with their visibility slice.
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
            <section className="prog-form-section">
              <label className="prog-field">
                <span className="prog-field-label">
                  Folder name <span className="prog-required">*</span>
                </span>
                <input
                  type="text"
                  className="prog-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cardiac, Pharmacology, Test strategies"
                  maxLength={NAME_MAX + 20 /* let user paste, validate */}
                  disabled={isPending}
                  autoFocus
                />
                {isDuplicate && (
                  <span className="lib-field-error">
                    A folder named &ldquo;{trimmedName}&rdquo; already exists.
                  </span>
                )}
                {isTooShort && (
                  <span className="lib-field-error">
                    Folder name must be at least {NAME_MIN} characters.
                  </span>
                )}
                {isTooLong && (
                  <span className="lib-field-error">
                    Keep it under {NAME_MAX} characters.
                  </span>
                )}
              </label>

              <label className="prog-field">
                <span className="prog-field-label">
                  Description{' '}
                  <span className="prog-field-optional">· optional</span>
                </span>
                <textarea
                  className="prog-input lib-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One line on what this folder is for. Shown on the folder card and as a sub-head on the folder page."
                  rows={2}
                  disabled={isPending}
                />
                {isDescTooLong && (
                  <span className="lib-field-error">
                    Description must be {DESC_MAX} characters or fewer
                    ({description.length} now).
                  </span>
                )}
              </label>

              <div className="lib-hint">
                <span className="lib-hint-icon" aria-hidden="true">
                  i
                </span>
                <div>
                  <b>Folders are organisational only</b> — they don&apos;t
                  gate visibility. A folder can hold a mix of tutor-wide
                  and programme-scoped notes; visibility is set per-note
                  when you publish.
                </div>
              </div>
            </section>
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
              disabled={!canSubmit}
            >
              {isPending ? 'Creating…' : 'Create folder'}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => setShowDiscard(false)}
          onDiscard={() => {
            setShowDiscard(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
