// mynclex/lib/overlays/practice/readiness-exit-confirm.tsx
//
// The readiness-pack variant of the runner's ← Exit confirm (step 2b-iii).
// A pack sitting is a paid one-shot, so leaving is heavier than a normal
// practice session — and there are two legitimate, different intentions we
// must NOT collapse (readiness-packs.md §2):
//
//   • Deliberate quit (r2) → END & SUBMIT: score what's been done
//     (unreached questions count as zero), see the result, no return.
//   • Step away (r3)       → LEAVE, resumable while the clock still runs.
//
// So this offers THREE explicit choices instead of the generic two. An
// accidental tab-close is neither click → the attempt stays IN_PROGRESS and
// is re-enterable (and the clock, which never pauses, eventually auto-submits
// it). "Keep going" is the safe default (autofocus + backdrop-click).

'use client';

interface Props {
  pending:     boolean;
  onEndSubmit: () => void;
  onLeave:     () => void;
  onCancel:    () => void;
}

export function ReadinessExitConfirm({ pending, onEndSubmit, onLeave, onCancel }: Props) {
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
        aria-label="Leave your exam?"
        aria-modal="true"
      >
        <p className="auth-discard-confirm-title">Leave your exam?</p>
        <p className="auth-discard-confirm-hint">
          This is your one attempt. You can end it now and get your result, or
          step away and come back later — either way the timer keeps running and
          won&apos;t pause.
        </p>

        <div className="rn-readiness-exit-actions">
          <button
            type="button"
            className="auth-btn auth-btn-danger"
            onClick={onEndSubmit}
            disabled={pending}
          >
            {pending ? 'Submitting…' : 'End & submit now'}
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-primary"
            onClick={onLeave}
            disabled={pending}
          >
            Leave — I&apos;ll come back
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}
