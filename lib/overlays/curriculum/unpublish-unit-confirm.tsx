// mynclex/lib/overlays/curriculum/unpublish-unit-confirm.tsx
//
// Guard shown before unpublishing a unit while the parent programme
// is LIVE (status PUBLISHED). Unpublishing removes the unit and all
// its blocks/activities from students who can currently see it — a
// silent, high-impact one-click action otherwise. Advisory only
// (never blocks) and fully reversible, so no type-to-confirm —
// mirrors the tutor-quiz "leave published" pattern.
//
// Self-portals to <body>: it can be opened from inside the curriculum
// rail, whose `.unit-item > *` rule + stacking context would trap a
// fixed overlay (same reason UnitFormModal portals). Harmless for the
// detail-pane caller.

'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface UnpublishUnitConfirmProps {
  // Display label of the unit, e.g. "Week 4" or "Module 2".
  unitLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UnpublishUnitConfirm({
  unitLabel,
  pending = false,
  onCancel,
  onConfirm,
}: UnpublishUnitConfirmProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Unpublish ${unitLabel}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">Unpublish {unitLabel}?</h2>
        <p className="confirm-dialog-body">
          This programme is live. Unpublishing <strong>{unitLabel}</strong>{' '}
          hides it and everything inside it from students who can currently
          see it. You can republish it anytime.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Keep published
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Unpublishing…' : 'Unpublish'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
