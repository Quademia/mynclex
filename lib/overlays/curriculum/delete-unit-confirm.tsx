// mynclex/lib/overlays/curriculum/delete-unit-confirm.tsx
//
// Confirm for deleting a whole unit (week/module) from the rail kebab.
// A unit is the highest-impact delete in the curriculum — it takes its
// blocks AND activities with it, shifts the positions of later units,
// and drops the programme's length by one. So when the unit holds
// content we gate it with a type-DELETE step (matching the programme
// length-DECREASE confirm, which is the same "remove a week" action);
// an empty unit gets a plain yes/no.
//
// Self-portals to <body> — it's opened from inside the rail, whose
// `.unit-item > *` rule + stacking context would otherwise trap it.

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface DeleteUnitConfirmProps {
  // Display label, e.g. "Week 3".
  unitLabel: string;
  blockCount: number;
  activityCount: number;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteUnitConfirm({
  unitLabel,
  blockCount,
  activityCount,
  pending = false,
  onCancel,
  onConfirm,
}: DeleteUnitConfirmProps) {
  const [text, setText] = useState('');
  const hasContent = blockCount > 0 || activityCount > 0;
  const armed = !hasContent || text === 'DELETE';

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  if (typeof document === 'undefined') return null;

  // "1 block and 6 activities" / "6 activities" / "1 block"
  const parts: string[] = [];
  if (blockCount > 0) {
    parts.push(`${blockCount} ${blockCount === 1 ? 'block' : 'blocks'}`);
  }
  if (activityCount > 0) {
    parts.push(
      `${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`
    );
  }
  const contentPhrase = parts.join(' and ');

  return createPortal(
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Delete ${unitLabel}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">Delete {unitLabel}?</h2>
        <p className="confirm-dialog-body">
          {hasContent ? (
            <>
              <strong>{unitLabel}</strong> and everything inside it (
              <strong>{contentPhrase}</strong>) will be permanently deleted,
              and the units after it shift up one. This can&apos;t be undone.
            </>
          ) : (
            <>
              <strong>{unitLabel}</strong> is empty and will be removed; the
              units after it shift up one. This can&apos;t be undone.
            </>
          )}
        </p>

        {hasContent && (
          <input
            type="text"
            className="prog-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type DELETE to confirm"
            autoFocus
            disabled={pending}
          />
        )}

        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus={!hasContent}
          >
            Keep {unitLabel}
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-danger"
            onClick={onConfirm}
            disabled={!armed || pending}
          >
            {pending ? 'Deleting…' : `Delete ${unitLabel.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
