// mynclex/lib/bank/atoms/editor-actions.tsx
//
// Save / Cancel / Delete button row. Lives in the modal header's
// `actions` slot (top of the modal, not a footer) so it's reachable
// without scrolling tall forms.
//
// Slice 1 — read-only: all buttons render disabled. Save wiring is
// added in Slice 2 once the form action lands.

'use client';

interface EditorActionsProps {
  /** True when editing an existing item — Delete shows only then. */
  canDelete: boolean;
  /**
   * Disable everything (e.g. when an action is in flight).
   * Slice 1 always passes true (no actions wired yet).
   */
  pending?: boolean;
  /** Click handler for Cancel — usually closes the modal. */
  onCancel: () => void;
  /** Click handler for Delete — Slice 1 leaves this undefined. */
  onDelete?: () => void;
  /**
   * The form id this Save button submits. The button can sit outside
   * the form (in the modal header) and still submit it via the HTML
   * `form=` attribute.
   */
  formId: string;
}

export function EditorActions({
  canDelete,
  pending = false,
  onCancel,
  onDelete,
  formId,
}: EditorActionsProps) {
  return (
    <div className="auth-actions">
      <button
        type="button"
        className="auth-btn auth-btn-ghost"
        onClick={onCancel}
        disabled={pending}
      >
        Cancel
      </button>
      {canDelete && (
        <button
          type="button"
          className="auth-btn auth-btn-danger"
          onClick={onDelete}
          disabled={pending || !onDelete}
        >
          Delete
        </button>
      )}
      <button
        type="submit"
        form={formId}
        className="auth-btn auth-btn-primary"
        disabled={pending}
      >
        Save
      </button>
    </div>
  );
}
