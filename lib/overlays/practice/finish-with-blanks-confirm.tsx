// mynclex/lib/overlays/practice/finish-with-blanks-confirm.tsx
//
// Centred confirmation dialog shown when a student in a batched-submit
// archetype (Free-batched: UT, TFN) clicks Finish with at least one
// unanswered question. Sequential and UL never trigger this modal —
// Sequential's per-Q Submit & continue locks each question as they go
// (no chance of last-Q blanks), and UL's Finish only fires post-submit
// of the last question.
//
// Layout mirrors lib/overlays/bank/discard-confirm.tsx — same backdrop +
// centred panel pattern, reuses the auth-discard-* class family from
// styles/dashboards.css. Backdrop click maps to "Keep editing" (the
// safe / non-destructive option, per CLAUDE.md UI conventions §2).

'use client';

interface Props {
  unansweredCount: number;
  totalCount:      number;
  onCancel:        () => void;       // "Keep editing"
  onSubmitAnyway:  () => void;       // "Finish anyway"
  pending?:        boolean;          // disables both action buttons
}

export function FinishWithBlanksConfirm({
  unansweredCount,
  totalCount,
  onCancel,
  onSubmitAnyway,
  pending = false,
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
        aria-label="Finish with unanswered questions?"
        aria-modal="true"
      >
        <p className="auth-discard-confirm-title">
          Finish with unanswered questions?
        </p>
        <p className="auth-discard-confirm-hint">
          You have <strong>{unansweredCount}</strong> of{' '}
          <strong>{totalCount}</strong>{' '}
          {unansweredCount === 1 ? 'question' : 'questions'} unanswered.
          Unanswered questions count as wrong. You won&apos;t be able to come
          back and answer them after submitting.
        </p>
        <div className="auth-discard-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-primary"
            onClick={onSubmitAnyway}
            disabled={pending}
          >
            {pending ? 'Submitting…' : 'Finish anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
