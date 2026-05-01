// mynclex/lib/authoring/atoms/discard-confirm.tsx
//
// Floating confirmation dialog shown when the curator tries to close
// an editor with unsaved edits. Renders as a centred overlay above
// the editor modal so it stays visible regardless of how far the
// curator has scrolled. Three buttons:
//
//   - Keep editing      : dismiss the panel, return to the editor.
//   - Discard changes   : close the modal, throw away edits.
//   - Save and close    : trigger the editor's save flow; on success
//                         the editor closes itself.
//
// Wired up by useDirtyGuard from lib/authoring/hooks/use-dirty-guard.
// Used by all 9 editors via their hosts.

interface DiscardConfirmProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
  /**
   * Optional. When provided, a "Save and close" action button is
   * shown alongside Keep editing + Discard. Omit when there is no
   * single coherent save target (e.g. leaving a page that has
   * several independently-dirty regions) — the dialog renders as
   * a 2-button Keep / Discard prompt.
   */
  onSaveAndClose?: () => void;
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
      className="auth-discard-overlay"
      onClick={(e) => {
        // Click on backdrop = same as Keep editing. Lets the curator
        // tap outside to dismiss without forcing a destructive choice.
        if (e.target === e.currentTarget && !pending) {
          onKeepEditing();
        }
      }}
    >
      <div
        className="auth-discard-confirm"
        role="alertdialog"
        aria-label="Unsaved changes"
        aria-modal="true"
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
          {onSaveAndClose && (
            <button
              type="button"
              className="auth-btn auth-btn-primary"
              onClick={onSaveAndClose}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save and close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
