// mynclex/lib/library/delete-shelf-confirm.tsx
//
// Confirmation dialog for deleting a shelf. Extracted from
// shelf-rows.tsx (slice 11.16c follow-on) so both the sidebar kebab
// AND the shelf detail pane can share one implementation — mirrors how
// RemoveFromShelfConfirm was pulled out earlier.
//
// Simple yes/no destructive confirm. No type-to-confirm gate — the
// delete is recoverable in spirit (the shelf can be recreated, and
// notes themselves are untouched; only membership rows cascade away).
// The DB has FK RESTRICT on `_note_attachments.shelf_id`, so a shelf
// attached to a programme can't be deleted — the action surfaces a
// specific error which we route through the toast.
//
// `redirectTo` (optional): when the caller is *viewing* the thing it's
// deleting (the detail pane), pass a URL to navigate to on success —
// the current URL would otherwise 404 on the gone shelf. The sidebar
// kebab omits it and just router.refresh()es in place.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { deleteShelfAction } from './actions';
import type { LibraryShelf } from './types';

interface DeleteShelfConfirmProps {
  shelf: LibraryShelf;
  onClose: () => void;
  /** Navigate here on success instead of refreshing in place. */
  redirectTo?: string;
}

export function DeleteShelfConfirm({
  shelf,
  onClose,
  redirectTo,
}: DeleteShelfConfirmProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await deleteShelfAction(shelf.shelf_id);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    onClose();
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Delete shelf ${shelf.title}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) onClose();
        }}
      >
        <div className="prog-modal lib-modal-shelf-delete">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Delete shelf?</h2>
          </header>
          <div className="prog-modal-body">
            <p>
              Delete <b>{shelf.title}</b>?
            </p>
            <p className="lib-modal-sub">
              The shelf and its membership rows go. Notes that were on
              this shelf are untouched — they stay in their folders and
              keep their visibility.
            </p>
          </div>
          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-danger"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? 'Deleting…' : 'Delete shelf'}
            </button>
          </footer>
        </div>
      </div>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
