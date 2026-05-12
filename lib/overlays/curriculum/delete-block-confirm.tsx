// mynclex/lib/overlays/curriculum/delete-block-confirm.tsx
//
// Yes/no confirm for deleting a block from the block-header ✕.
// Surfaces the activity cascade count so the tutor knows what's
// about to vanish. Yes/no rather than type-to-confirm — single
// tutor scale, no live students yet.

'use client';

interface DeleteBlockConfirmProps {
  blockTitle: string;
  activityCount: number;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteBlockConfirm({
  blockTitle,
  activityCount,
  pending = false,
  onCancel,
  onConfirm,
}: DeleteBlockConfirmProps) {
  return (
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Delete block"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">Delete this block?</h2>
        <p className="confirm-dialog-body">
          <strong>{blockTitle}</strong> will be removed.
          {activityCount > 0 ? (
            <>
              {' '}
              <strong>
                {activityCount}{' '}
                {activityCount === 1 ? 'activity inside' : 'activities inside'}
              </strong>{' '}
              will also be deleted.
            </>
          ) : (
            <> The block is empty.</>
          )}{' '}
          This can&apos;t be undone.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Keep block
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Deleting…' : 'Delete block'}
          </button>
        </div>
      </div>
    </div>
  );
}
