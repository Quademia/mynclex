// mynclex/lib/toast/info-toast.tsx
//
// Neutral, informational sibling of <ErrorToast> — same floating
// top-right behaviour, but an info tone (the action succeeded; this is
// guidance, not an error and not a celebration). First used for the
// cohort-only "saved — not visible to students yet" soft-warn.
//
// role="status" / aria-live="polite" so it announces without
// interrupting like the assertive error toast. Slightly longer default
// auto-dismiss than the error toast because the message is actionable
// guidance the tutor should have time to read.

'use client';

import { useEffect } from 'react';

interface InfoToastProps {
  /** The message to show. Pass `null` to hide the toast. */
  message: string | null;
  /** Called when the toast wants to be dismissed (timer + close button). */
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Default 6000. Set to 0 to disable. */
  autoDismissMs?: number;
}

export function InfoToast({
  message,
  onDismiss,
  autoDismissMs = 6000,
}: InfoToastProps) {
  useEffect(() => {
    if (!message || autoDismissMs <= 0) return;
    const id = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [message, autoDismissMs, onDismiss]);

  if (!message) return null;

  return (
    <div className="auth-toast auth-toast-info" role="status" aria-live="polite">
      <span className="auth-toast-icon" aria-hidden="true">
        💡
      </span>
      <span className="auth-toast-message">{message}</span>
      <button
        type="button"
        className="auth-toast-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
