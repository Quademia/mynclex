// mynclex/lib/overlays/practice/discard-confirm.tsx
//
// Confirmation dialog for discarding an unfinished practice sitting from
// the History directory.
//
// Discarding can't be undone — the sitting stops being resumable — so per
// CLAUDE.md UI convention §2 it goes through a centred dialog rather than
// firing on a single click. NOT a type-to-confirm gate: that is reserved
// for genuinely destructive actions (deleting a bank item), and this
// destroys nothing. The answers already submitted stay counted; only the
// ability to resume goes away. Overstating it with a DELETE-typing gate
// would teach students to distrust the milder wording elsewhere.
//
// Backdrop click maps to Cancel, the safe option, matching every other
// confirmation in this folder. Chrome is the shared auth-discard-* family
// from styles/dashboards.css, as used by the four sibling overlays.

'use client';

interface Props {
  /** What the student is about to discard, e.g. "Pharmacology · 25 Q". */
  sessionLabel: string;
  /** True while the action is in flight — stops a double submit. */
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DiscardSessionConfirm({
  sessionLabel,
  pending = false,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div
      className="auth-discard-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        className="auth-discard-confirm"
        role="alertdialog"
        aria-label="Discard this session?"
        aria-modal="true"
      >
        <p className="auth-discard-confirm-title">Discard this session?</p>
        <p className="auth-discard-confirm-hint">
          <strong>{sessionLabel}</strong> will stop being resumable, and you
          won&apos;t be able to pick it up again. Anything you already
          answered still counts towards your progress.
        </p>
        <div className="auth-discard-confirm-actions">
          {/* Cancel first and focused — the safe option should be the one a
              hurried tap or an Enter keypress lands on. */}
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Keep it
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Discarding…' : 'Discard session'}
          </button>
        </div>
      </div>
    </div>
  );
}
