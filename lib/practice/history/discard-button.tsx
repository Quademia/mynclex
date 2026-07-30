// mynclex/lib/practice/history/discard-button.tsx
//
// The Discard control on an unfinished practice row.
//
// A small CLIENT island inside an otherwise server-rendered table: the
// table itself needs no client state (its filters and paging live in the
// URL), and this is the only thing on the page that needs a dialog, a
// pending state and a toast. Keeping the island this small means the row
// markup, the filters and the paging all stay server-rendered.
//
// Feedback goes through toasts, not an inline banner, per CLAUDE.md UI
// convention §1 — the list scrolls, and a message at the top of it is
// invisible the moment the student scrolls past.

'use client';

import { useState, useTransition } from 'react';
import { DiscardSessionConfirm } from '@/lib/overlays/practice/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { InfoToast } from '@/lib/toast/info-toast';
import { discardAttemptAction } from './actions';

export function DiscardButton({
  attemptId,
  sessionLabel,
}: {
  attemptId: string;
  sessionLabel: string;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await discardAttemptAction(attemptId);
      if (result.ok) {
        // Close first, then report. The row disappears from the list on
        // revalidate, so without the toast the click would look like
        // nothing happened at all.
        setAsking(false);
        setDone('Session discarded.');
      } else {
        setAsking(false);
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="hist-discard"
        onClick={() => setAsking(true)}
        disabled={pending}
        title="Discard this unfinished session"
      >
        Discard
      </button>

      {asking && (
        <DiscardSessionConfirm
          sessionLabel={sessionLabel}
          pending={pending}
          onCancel={() => setAsking(false)}
          onConfirm={confirm}
        />
      )}

      {/* ⚠ ErrorToast's prop is `error`; InfoToast's is `message`. */}
      <ErrorToast error={error} onDismiss={() => setError(null)} />
      <InfoToast message={done} onDismiss={() => setDone(null)} />
    </>
  );
}
