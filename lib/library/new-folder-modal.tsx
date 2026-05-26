// mynclex/lib/library/new-folder-modal.tsx
//
// Unified create + edit modal for tutor library folders.
// Discriminated `variant` prop — `{ mode: 'create' }` shows a blank
// form, `{ mode: 'edit', folder }` pre-populates from the row and
// wires the submit to editFolderAction. Mirrors the shape of
// NewShelfModal so the two modals feel identical.
//
// Class family `prog-modal-*` is reused from the existing programme/
// cohort modals so we don't re-style the same surface in two places.
// Library-specific touches (hint card, field hint copy) live inline.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createFolderAction, editFolderAction } from './actions';
import type { LibraryFolder, LibraryFolderWithCount } from './types';

const NAME_MIN = 2;
const NAME_MAX = 60;
const DESC_MAX = 280;

type Mode =
  | { mode: 'create' }
  | { mode: 'edit'; folder: LibraryFolder };

interface NewFolderModalProps {
  /** Existing folders, used for the client-side duplicate-name check. */
  existingFolders: LibraryFolderWithCount[];
  /** Discriminated mode. */
  variant: Mode;
  onClose: () => void;
}

export function NewFolderModal({
  existingFolders,
  variant,
  onClose,
}: NewFolderModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const initialName = variant.mode === 'edit' ? variant.folder.name : '';
  const initialDescription =
    variant.mode === 'edit' ? variant.folder.description ?? '' : '';

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  const trimmedName = name.trim();

  // Dirty = anything differs from the starting state.
  const isDirty = useMemo(() => {
    if (variant.mode === 'create') {
      return trimmedName.length > 0 || description.trim().length > 0;
    }
    if (trimmedName !== variant.folder.name) return true;
    const persistedDesc = variant.folder.description ?? '';
    if (description !== persistedDesc) return true;
    return false;
  }, [variant, trimmedName, name, description]);

  // Build a case-insensitive set of existing names for the dup check.
  // Edit mode excludes the folder being edited so renaming to the
  // same name (or case-only flip) is allowed.
  const existingNamesLower = useMemo(() => {
    const skipId = variant.mode === 'edit' ? variant.folder.folder_id : null;
    const set = new Set<string>();
    for (const f of existingFolders) {
      if (skipId && f.folder_id === skipId) continue;
      set.add(f.name.toLowerCase());
    }
    return set;
  }, [existingFolders, variant]);

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
    !isPending &&
    (variant.mode === 'create' || isDirty);

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
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
      };
      const result =
        variant.mode === 'create'
          ? await createFolderAction(payload)
          : await editFolderAction(variant.folder.folder_id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const headingText = variant.mode === 'create' ? 'New folder' : 'Edit folder';
  const subHeadText =
    variant.mode === 'create'
      ? 'Your primary filing bin. Tutor-scoped — students see the same folders you do, just with their visibility slice.'
      : 'Rename the folder or update its description. Notes inside aren’t affected.';
  const submitLabel =
    variant.mode === 'create'
      ? isPending
        ? 'Creating…'
        : 'Create folder'
      : isPending
        ? 'Saving…'
        : 'Save changes';

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={headingText}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal lib-modal-folder">
          <header className="prog-modal-header">
            <div>
              <h2 className="prog-modal-title">{headingText}</h2>
              <p className="lib-modal-sub">{subHeadText}</p>
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
              {submitLabel}
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
