// mynclex/lib/overlays/curriculum/add-unit-confirm.tsx
//
// Heads-up shown before adding a unit. A unit's existence is tied to
// nclex_programmes.length_units, so "Add week/module" silently bumps
// the programme's STATED length (e.g. a "4-Week Crash Course" drifting
// to 5 weeks). This confirm surfaces that side effect — the symmetric
// partner to the length-DECREASE confirm in the programme edit modal.
// Non-destructive + reversible (the new unit can be removed once unit
// delete ships), so a plain confirm, not type-to-confirm.
//
// Self-portals to <body> so it can't be clipped by the workspace's
// overflow:hidden frame.

'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { UnitLabel } from '@/lib/programmes/types';

interface AddUnitConfirmProps {
  unitLabel: UnitLabel;
  // Current programme length (number of units before adding).
  currentLength: number;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function AddUnitConfirm({
  unitLabel,
  currentLength,
  pending = false,
  onCancel,
  onConfirm,
}: AddUnitConfirmProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  if (typeof document === 'undefined') return null;

  const nounCap = unitLabel === 'WEEK' ? 'Week' : 'Module';
  const pluralNoun = unitLabel === 'WEEK' ? 'weeks' : 'modules';
  const next = currentLength + 1;

  return createPortal(
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Add ${nounCap} ${next}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">
          Add {nounCap} {next}?
        </h2>
        <p className="confirm-dialog-body">
          This increases the programme&apos;s length from{' '}
          <strong>
            {currentLength} {pluralNoun}
          </strong>{' '}
          to{' '}
          <strong>
            {next} {pluralNoun}
          </strong>
          . The new {nounCap.toLowerCase()}{' '}
          is added at the end as a draft — your stated length (and anything
          that references it, like the programme title) won&apos;t update
          automatically.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Adding…' : `Add ${nounCap.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
