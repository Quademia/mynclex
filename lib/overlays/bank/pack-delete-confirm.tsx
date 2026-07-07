// mynclex/lib/overlays/bank/pack-delete-confirm.tsx
//
// Confirmation dialog for deleting a readiness pack (settled
// 2026-07-08). Circumstance-graded per the house convention: an
// EMPTY pack gets a plain confirm; a pack holding questions gets the
// typed-DELETE gate (throwing away curated composition is the
// dangerous case). Published packs never reach this dialog — the
// server refuses them and the card hides the button. Reuses the
// .auth-delete-* dialog styling from the question delete-confirm.

'use client';

import { useState } from 'react';

export function PackDeleteConfirm({
  packId,
  memberCount,
  pending = false,
  onCancel,
  onConfirm,
}: {
  packId: string;
  memberCount: number;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [text, setText] = useState('');
  const typedGate = memberCount > 0;
  const armed = !typedGate || text === 'DELETE';

  return (
    <div
      className="auth-delete-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        className="auth-delete-confirm"
        role="alertdialog"
        aria-label="Confirm pack delete"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">
          Delete <code>{packId}</code>?
        </p>
        <div className="auth-delete-confirm-note">
          {typedGate ? (
            <>
              Its {memberCount} question{memberCount === 1 ? '' : 's'} return to
              the unassigned reserve — still hidden from students, ready for
              another pack. The pack&apos;s composition is lost. Its number
              becomes free for a future pack.
            </>
          ) : (
            <>This pack is empty — nothing else is affected, and its number becomes free for a future pack.</>
          )}
        </div>
        {typedGate && (
          <>
            <p className="auth-delete-confirm-hint">
              This is irreversible. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              className="auth-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type DELETE"
              autoFocus
              disabled={pending}
            />
          </>
        )}
        <div className="auth-delete-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-danger"
            onClick={onConfirm}
            disabled={!armed || pending}
          >
            {pending ? 'Deleting…' : 'Delete pack'}
          </button>
        </div>
      </div>
    </div>
  );
}
