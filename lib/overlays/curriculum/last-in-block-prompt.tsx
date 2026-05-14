// mynclex/lib/overlays/curriculum/last-in-block-prompt.tsx
//
// Two-option prompt shown when the tutor tries to delete the
// LAST activity inside a block. Empty blocks aren't allowed,
// so the tutor picks one of:
//
//   • Move out as loose — keep the activity, drop the block.
//   • Delete the block too — both vanish.
//
// Stacked button layout (one per row) with secondary help text
// inside each, so the tutor reads the consequence before tapping.

'use client';

interface LastInBlockPromptProps {
  activityTitle: string;
  blockTitle: string;
  pending?: boolean;
  onMoveOut: () => void;
  onDeleteBoth: () => void;
  onCancel: () => void;
}

export function LastInBlockPrompt({
  activityTitle,
  blockTitle,
  pending = false,
  onMoveOut,
  onDeleteBoth,
  onCancel,
}: LastInBlockPromptProps) {
  return (
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Last activity in block"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog confirm-dialog-wide">
        <h2 className="confirm-dialog-title">Last activity in this block</h2>
        <p className="confirm-dialog-body">
          <strong>{activityTitle}</strong> is the only activity in{' '}
          <strong>{blockTitle}</strong>. Empty blocks aren&apos;t allowed —
          pick one:
        </p>
        <div className="confirm-dialog-actions confirm-dialog-actions-stacked">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onMoveOut}
            disabled={pending}
          >
            Move out as loose
            <span className="confirm-action-help">
              Keep the activity in this unit; remove the block.
            </span>
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-danger"
            onClick={onDeleteBoth}
            disabled={pending}
          >
            Delete the block too
            <span className="confirm-action-help">
              Remove both the activity and the block.
            </span>
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-ghost confirm-cancel"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
