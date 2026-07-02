// mynclex/lib/overlays/bank/trend-detach-confirm.tsx
//
// Floating confirmation dialog for detaching a question from a TREND
// dataset. Replaces the native window.confirm so the guard matches the
// rest of our overlays (centred box, dimmed backdrop, styled buttons).
//
// Detach is REVERSIBLE — the question survives in the bank as a
// standalone item and can be re-linked — so this is a lightweight
// misclick guard, NOT the typed-DELETE gate. Backdrop click = Cancel.
//
// Deliberately its own component (not shared with the case-study detach
// dialog): the copy differs and the two wrappers stay independent
// (copy-not-share). The CSS look (`auth-detach-*`) is shared.

interface TrendDetachConfirmProps {
  /** 1-based display position of the question being detached. */
  position: number;
  /** The question's type (MCQ / SATA / …), shown for context. */
  questionType: string;
  /** True while the detach server action is in flight. */
  pending?: boolean;
  /** Cancel button or backdrop click (only when not pending). */
  onCancel: () => void;
  /** Confirm — the host runs the actual detach server action. */
  onConfirm: () => void;
}

export function TrendDetachConfirm({
  position,
  questionType,
  pending = false,
  onCancel,
  onConfirm,
}: TrendDetachConfirmProps) {
  return (
    <div
      className="auth-detach-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        className="auth-detach-confirm"
        role="alertdialog"
        aria-label="Detach question"
        aria-modal="true"
      >
        <p className="auth-detach-confirm-title">
          Detach Q{position}{' '}
          <span className="auth-detach-confirm-type">({questionType})</span>?
        </p>
        <p className="auth-detach-confirm-hint">
          The question is removed from this trend dataset but stays in the
          bank as a standalone item — you can re-link it later.
        </p>
        <div className="auth-detach-confirm-actions">
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
            className="auth-btn auth-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Detaching…' : 'Detach question'}
          </button>
        </div>
      </div>
    </div>
  );
}
