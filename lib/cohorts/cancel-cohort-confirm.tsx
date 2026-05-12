// mynclex/lib/cohorts/cancel-cohort-confirm.tsx
//
// Cancel-cohort button + simple confirmation dialog. Soft
// cancellation — sets cancelled_at on the row; reversible later
// by admin clearing the timestamp (no v1 UI). No type-to-confirm
// gate (reserved for irreversible destruction); a single
// click-through is the right amount of friction here.
//
// Lives on the cohort Settings tab in slice 9.2c.

'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ErrorToast } from '@/lib/toast/error-toast';
import { cancelCohortAction } from './actions';

interface CancelCohortConfirmProps {
  cohortId: string;
  cohortLabel: string;
}

export function CancelCohortConfirm({
  cohortId,
  cohortLabel,
}: CancelCohortConfirmProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelCohortAction(cohortId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowConfirm(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="cohort-cancel-btn"
        onClick={() => setShowConfirm(true)}
      >
        Cancel cohort
      </button>

      {showConfirm && (
        <div
          className="prog-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Cancel cohort"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              setShowConfirm(false);
            }
          }}
        >
          <div className="confirm-dialog">
            <h2 className="confirm-dialog-title">Cancel this cohort?</h2>
            <p className="confirm-dialog-body">
              <strong>{cohortLabel}</strong> will be marked cancelled.
              Enrolled students lose access; new enrolments are blocked.
              The cohort row stays in place and can be reinstated by
              an admin later.
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="prog-btn prog-btn-ghost"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                autoFocus
              >
                Keep cohort
              </button>
              <button
                type="button"
                className="prog-btn prog-btn-danger"
                onClick={handleCancel}
                disabled={isPending}
              >
                {isPending ? 'Cancelling…' : 'Cancel cohort'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
