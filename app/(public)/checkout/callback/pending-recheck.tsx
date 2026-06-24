// mynclex/app/(public)/checkout/callback/pending-recheck.tsx
//
// The only client island on the result screen. Rendered solely in the PENDING
// state ("we haven't seen a completed payment yet"): it quietly re-runs the
// server component every few seconds via router.refresh(), so a charge that
// settles a moment after the buyer returns flips the screen to its real
// outcome on its own — no manual reload. Re-running settle is idempotent, and
// once the status is no longer PENDING the page stops rendering this island,
// so the polling ends with it. Capped attempts so it never loops forever.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_ATTEMPTS = 6;
const INTERVAL_MS = 4000;

export function PendingRecheck() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const done = attempts >= MAX_ATTEMPTS;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => {
      setAttempts((n) => n + 1);
      router.refresh();
    }, INTERVAL_MS);
    return () => clearTimeout(t);
  }, [attempts, done, router]);

  return (
    <div className="cr-recheck" role="status" aria-live="polite">
      <span className="cr-recheck-dot" aria-hidden="true" />
      <span>
        {done
          ? "Still not confirmed. Use Refresh below, or come back in a few minutes."
          : 'Checking for your payment…'}
      </span>
    </div>
  );
}
