// mynclex/lib/library/remove-from-shelf-confirm.tsx
//
// Shared confirm dialog for removing a single note from a shelf.
// Drives the hover-✕ on the All Shelves carousel cards (11.3b) and
// on the numbered rows of the per-shelf detail view (11.4).
//
// The note shape varies between callers — the carousel renders
// LibraryShelfCardNote, the detail view renders
// LibraryShelfDetailNote — so we take the minimal subset (note_id +
// title) here.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { removeNoteFromShelfAction } from './actions';

interface RemoveFromShelfConfirmProps {
  shelfTitle: string;
  shelfId: string;
  note: { note_id: string; title: string };
  onClose: () => void;
}

export function RemoveFromShelfConfirm({
  shelfTitle,
  shelfId,
  note,
  onClose,
}: RemoveFromShelfConfirmProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    setPending(true);
    setError(null);
    const result = await removeNoteFromShelfAction(shelfId, note.note_id);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Remove ${note.title} from ${shelfTitle}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) onClose();
        }}
      >
        <div className="prog-modal lib-modal-remove-from-shelf">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Remove from shelf?</h2>
          </header>
          <div className="prog-modal-body">
            <p>
              Remove <b>{note.title}</b> from <b>{shelfTitle}</b>?
            </p>
            <p className="lib-modal-sub">
              The note itself stays put — it keeps its folder, pillars,
              tags and any other shelves it&apos;s on. Only the
              membership on this shelf goes.
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
              onClick={handleRemove}
              disabled={pending}
            >
              {pending ? 'Removing…' : 'Remove'}
            </button>
          </footer>
        </div>
      </div>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
