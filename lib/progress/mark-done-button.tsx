// mynclex/lib/progress/mark-done-button.tsx
//
// Progress engine — Slice 2. Shared button used by all 4 MANUAL
// activity viewers (TEXT, PDF, EXTERNAL_LINK, ONLINE_LIVE_SESSION).
// Encapsulates: label toggle based on isDone, action invocation
// via useTransition, router.refresh on success (so the curriculum
// tick + the viewer's next-render label both update), brief inline
// error fallback on failure.
//
// Live-session viewer passes `disabled` + `disabledReason` when
// the session is UPCOMING / LIVE (per the §8.5 + Q2 decision —
// marking attendance before the session ends is meaningless).
// Other viewers leave both unset.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  markActivityDone,
  unmarkActivityDone,
} from './actions';

export function MarkDoneButton({
  activityId,
  isDone,
  disabled = false,
  disabledReason,
}: {
  activityId: string;
  isDone: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = isDone
        ? await unmarkActivityDone(activityId)
        : await markActivityDone(activityId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Refresh the server-rendered curriculum tree so the row's
      // tick updates AND the viewer's `isDone` prop flips on the
      // next render (without closing the modal).
      router.refresh();
    });
  }

  const buttonLabel = isDone ? 'Mark as not done' : 'Mark as done';
  const pendingLabel = isDone ? 'Un-marking…' : 'Marking…';

  return (
    <div className="mark-done-wrapper">
      <button
        type="button"
        className={
          isDone ? 'mark-done-button is-done' : 'mark-done-button'
        }
        onClick={handleClick}
        disabled={disabled || isPending}
        title={disabled ? disabledReason : undefined}
      >
        {isPending ? pendingLabel : buttonLabel}
      </button>
      {disabled && disabledReason && (
        <p className="mark-done-disabled-note">{disabledReason}</p>
      )}
      {error && <p className="mark-done-error">{error}</p>}
    </div>
  );
}
