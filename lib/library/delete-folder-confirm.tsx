// mynclex/lib/library/delete-folder-confirm.tsx
//
// Confirm dialog for deleting a folder. Simple yes/no — not type-to-
// confirm — because the action is non-destructive at the note level:
// notes inside orphan to Root, keeping their body, shelf memberships,
// programme attachments and visibility settings. The folder pointer
// is the only thing that changes.
//
// Body copy is note-count-aware: an empty folder gets a tighter
// message; a folder with notes inside spells out exactly where they
// go.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { deleteFolderAction } from './actions';
import type { LibraryFolderWithCount } from './types';

interface DeleteFolderConfirmProps {
  folder: LibraryFolderWithCount;
  onClose: () => void;
}

export function DeleteFolderConfirm({
  folder,
  onClose,
}: DeleteFolderConfirmProps) {
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
    const result = await deleteFolderAction(folder.folder_id);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    onClose();
    router.refresh();
  }

  const noteCount = folder.note_count;

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Delete folder ${folder.name}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) onClose();
        }}
      >
        <div className="prog-modal lib-modal-folder-delete">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Delete folder?</h2>
          </header>
          <div className="prog-modal-body">
            <p>
              Delete <b>{folder.name}</b>?
            </p>
            {noteCount === 0 ? (
              <p className="lib-modal-sub">
                This folder is empty, so nothing else changes.
              </p>
            ) : (
              <p className="lib-modal-sub">
                The {noteCount} note{noteCount === 1 ? '' : 's'} inside
                will move to <b>Root</b> — body content, shelf memberships,
                programme attachments and visibility settings are all
                kept. You can re-file them later if you want.
              </p>
            )}
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
              {pending ? 'Deleting…' : 'Delete folder'}
            </button>
          </footer>
        </div>
      </div>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
