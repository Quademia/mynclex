// mynclex/lib/authoring/atoms/discard-confirm.tsx
//
// Inline confirmation panel shown at the top of an editor's modal
// body when the curator tries to close with unsaved edits. Three
// buttons:
//
//   - Keep editing      : dismiss the panel, return to the editor.
//   - Discard changes   : close the modal, throw away edits.
//   - Save and close    : trigger the editor's save flow; on success
//                         the editor closes itself.
//
// Wired up by useDirtyGuard from lib/authoring/hooks/use-dirty-guard.

interface DiscardConfirmProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSaveAndClose: () => void;
  /**
   * True while a save action is in flight. Disables Save and close
   * + Discard so the curator can't fire a second action mid-save.
   * Keep editing stays available so they can dismiss the panel
   * either way.
   */
  pending?: boolean;
}

export function DiscardConfirm({
  onKeepEditing,
  onDiscard,
  onSaveAndClose,
  pending = false,
}: DiscardConfirmProps) {
  return (
    <div
      className="auth-discard-confirm"
      role="alertdialog"
      aria-label="Unsaved changes"
    >
      <p className="auth-discard-confirm-title">Unsaved changes</p>
      <p className="auth-discard-confirm-hint">
        You&apos;ve made edits that haven&apos;t been saved. What would you like to do?
      </p>
      <div className="auth-discard-confirm-actions">
        <button
          type="button"
          className="auth-btn auth-btn-ghost"
          onClick={onKeepEditing}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="auth-btn auth-btn-danger"
          onClick={onDiscard}
          disabled={pending}
        >
          Discard changes
        </button>
        <button
          type="button"
          className="auth-btn auth-btn-primary"
          onClick={onSaveAndClose}
          disabled={pending}
        >
          {pending ? 'Saving…' : 'Save and close'}
        </button>
      </div>
    </div>
  );
}
