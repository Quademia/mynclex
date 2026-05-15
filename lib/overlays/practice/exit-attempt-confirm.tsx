// mynclex/lib/overlays/practice/exit-attempt-confirm.tsx
//
// Slice 3a — confirmation modal for the runner topbar's ← Exit button
// when the attempt is still in-progress. Skipped entirely in review
// mode (the runner pushes the exit URL directly).
//
// Copy is mode-aware:
//   • Timed → callout the live clock (it keeps running while away —
//     server-anchored, doesn't pause). Real consequence to flag.
//   • Untimed → brief reassurance that progress is saved (save-on-tap
//     writes DRAFT rows on every material change) and the attempt is
//     resumable.
//
// Matches the existing finish-with-blanks-confirm + case-exit-confirm
// chrome (auth-discard-* class family from styles/dashboards.css).
// Backdrop click → Cancel (the safe option), per CLAUDE.md UI
// conventions §2.

'use client';

interface Props {
  isTimed:   boolean;
  onCancel:  () => void;
  onConfirm: () => void;
}

export function ExitAttemptConfirm({ isTimed, onCancel, onConfirm }: Props) {
  return (
    <div
      className="auth-discard-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="auth-discard-confirm"
        role="alertdialog"
        aria-label="Leave this attempt?"
        aria-modal="true"
      >
        <p className="auth-discard-confirm-title">Leave this attempt?</p>
        <p className="auth-discard-confirm-hint">
          {isTimed ? (
            <>
              The timer keeps running while you&apos;re away — your answers
              so far are saved, but the clock won&apos;t pause.
            </>
          ) : (
            <>
              Your answers so far are saved. You can resume this attempt
              later from where you left off.
            </>
          )}
        </p>
        <div className="auth-discard-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            autoFocus
          >
            Keep going
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-primary"
            onClick={onConfirm}
          >
            Leave attempt
          </button>
        </div>
      </div>
    </div>
  );
}
