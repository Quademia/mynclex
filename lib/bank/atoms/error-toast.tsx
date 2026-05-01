// mynclex/lib/bank/atoms/error-toast.tsx
//
// Floating toast for editor errors — replaces the inline `auth-error`
// banner that used to live at the top of the form. Surfaces both
// client-side validation errors ("Pick a Client Needs category") and
// server-side errors ("Update failed: …") through the same UI so the
// curator's experience is consistent.
//
// Behaviour:
//   - Auto-dismiss after `autoDismissMs` (default 5s).
//   - Click × to dismiss earlier.
//   - Resetting `error` to null clears the toast immediately.
//   - Each new error message resets the auto-dismiss timer.
//
// Position is set in CSS (top-right of the modal); the atom itself is
// just behaviour + markup. `null` error = nothing rendered.

'use client';

import { useEffect } from 'react';

interface ErrorToastProps {
  /** The error message to show. Pass `null` to hide the toast. */
  error: string | null;
  /** Called when the toast wants to be dismissed (timer + close button). */
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Default 5000. Set to 0 to disable auto-dismiss. */
  autoDismissMs?: number;
}

export function ErrorToast({
  error,
  onDismiss,
  autoDismissMs = 5000,
}: ErrorToastProps) {
  useEffect(() => {
    if (!error || autoDismissMs <= 0) return;
    const id = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [error, autoDismissMs, onDismiss]);

  if (!error) return null;

  return (
    <div className="auth-toast auth-toast-error" role="alert" aria-live="assertive">
      <span className="auth-toast-icon" aria-hidden="true">!</span>
      <span className="auth-toast-message">{error}</span>
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
