// mynclex/lib/authoring/atoms/delete-confirm.tsx
//
// Floating confirmation dialog shown when the curator clicks Delete
// on an existing question. Renders as a centred overlay above the
// editor modal so it stays visible regardless of how far the curator
// has scrolled. Requires the curator to type DELETE before the
// destructive action becomes available.
//
// Shared by all 9 editor hosts — each owns its own `deleteText` and
// `confirmingDelete` state and just renders this atom when active.
// Wording, button order, and the typed-DELETE gate all live here so
// a future change ripples to every editor in one edit.

interface DeleteConfirmProps {
  /** The item id being deleted, shown in the title. */
  itemId: string;
  /** Curator's typed text — confirm button is gated on this === 'DELETE'. */
  deleteText: string;
  /** True while the delete server action is in flight. */
  pending?: boolean;
  /** Called when the curator types into the confirmation input. */
  onTextChange: (text: string) => void;
  /** Called on Cancel button or backdrop click (only when not pending). */
  onCancel: () => void;
  /** Called on Confirm. The host runs the actual delete server action. */
  onConfirm: () => void;
}

export function DeleteConfirm({
  itemId,
  deleteText,
  pending = false,
  onTextChange,
  onCancel,
  onConfirm,
}: DeleteConfirmProps) {
  return (
    <div
      className="auth-delete-overlay"
      onClick={(e) => {
        // Click on backdrop = same as Cancel — curator can dismiss
        // without committing to the destructive action.
        if (e.target === e.currentTarget && !pending) {
          onCancel();
        }
      }}
    >
      <div
        className="auth-delete-confirm"
        role="alertdialog"
        aria-label="Confirm delete"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">
          Delete <code>{itemId}</code>?
        </p>
        <p className="auth-delete-confirm-hint">
          This is irreversible. Type <strong>DELETE</strong> to confirm.
        </p>
        <input
          type="text"
          className="auth-input"
          value={deleteText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Type DELETE"
          autoFocus
          disabled={pending}
        />
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
            disabled={deleteText !== 'DELETE' || pending}
          >
            {pending ? 'Deleting…' : 'Confirm delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
