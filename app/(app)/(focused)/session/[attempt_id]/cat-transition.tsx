'use client';

// mynclex/app/(app)/(focused)/session/[attempt_id]/cat-transition.tsx
//
// The CAT between-question escalation overlay (slice 6c). Sits ON TOP of the
// dimmed, inert question — so it must live OUTSIDE the `inert` wrapper, or its
// Retry button would be unreachable too.
//
// Renders nothing for `idle`/`dim`: a fast turn shows only the dim (≤300ms),
// never a spinner flicker. Content escalates spinner → "Still loading…" →
// Retry with elapsed time; see lib/practice/cat/turn-transition.
//
// role="status" + aria-live so a screen reader announces the escalation ("Still
// loading…", "Retry") rather than leaving a non-visual user with a silently
// frozen screen.

import { canRetry, type TransitionPhase } from '@/lib/practice/cat/turn-transition';

export function CatTransition({
  phase,
  onRetry,
}: {
  phase: TransitionPhase;
  onRetry: () => void;
}) {
  // The dim is the wrapper's own styling; there is no overlay content until a
  // turn is genuinely slow.
  if (phase === 'idle' || phase === 'dim') return null;

  const showSpinner = phase === 'spinner' || phase === 'slow' || phase === 'stuck';
  const message =
    phase === 'error'
      ? 'That didn’t go through.'
      : phase === 'slow' || phase === 'stuck'
        ? 'Still loading…'
        : null;

  return (
    <div className="rn-cat-tx-overlay" role="status" aria-live="polite">
      {/* A contained panel so the message and Retry read clearly against the
          dimmed question behind, rather than colliding with its text. */}
      <div className="rn-cat-tx-panel">
        {showSpinner && <span className="rn-cat-tx-spinner" aria-hidden="true" />}
        {message && <p className="rn-cat-tx-msg">{message}</p>}
        {canRetry(phase) && (
          <button
            type="button"
            className="rn-cat-tx-retry"
            onClick={onRetry}
            aria-label="Retry loading the next question"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
