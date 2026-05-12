// mynclex/lib/overlays/curriculum/delete-activity-confirm.tsx
//
// Simple yes/no confirm for deleting an activity (loose or
// in-block, excluding the last-activity-in-block case which
// uses <LastInBlockPrompt> instead). Low-stakes destructive
// action — no type-to-confirm, matching the 9.3b precedent.

'use client';

interface DeleteActivityConfirmProps {
  activityTitle: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteActivityConfirm({
  activityTitle,
  pending = false,
  onCancel,
  onConfirm,
}: DeleteActivityConfirmProps) {
  return (
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Delete activity"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">Delete this activity?</h2>
        <p className="confirm-dialog-body">
          <strong>{activityTitle}</strong> will be removed from this
          unit. This can&apos;t be undone.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Keep activity
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Deleting…' : 'Delete activity'}
          </button>
        </div>
      </div>
    </div>
  );
}
