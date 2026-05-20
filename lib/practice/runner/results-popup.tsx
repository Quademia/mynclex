// mynclex/lib/practice/runner/results-popup.tsx
//
// Slice 3a — universal end-of-quiz results popup. Sits over the runner's
// review-mode screen the moment an attempt completes, OR on demand via
// the topbar pill click after dismiss.
//
// Source-aware via the new `getResultsContext` action (one round trip
// on mount):
//   • CUSTOM_BUILT     → "Build another" + Exit to bank
//   • PROGRAMME_ASSIGNED → "Take again" + Exit to curriculum + attempts line
//
// Pass/fail badge only renders when `pass_score` is set on the attempt
// (programme quizzes today; bank Builder + future Readiness Packs may
// populate later). Ungraded attempts show just the score.
//
// Reuses lib/curriculum/viewer-modal-shell — same shell the per-type
// curriculum viewers use, established as the student-side modal frame
// in slices 10.2-10.5. Cross-area import is a deliberate small debt;
// future home is lib/overlays/shared/modal-shell.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ViewerModalShell } from '@/lib/curriculum/viewer-modal-shell';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  getResultsContext,
  restartAttemptAction,
  type ResultsContext,
} from './results-actions';

interface Props {
  attemptId:    string;
  /** 0..1 fraction. Null when the attempt isn't yet scored (defensive). */
  finalScore:   number | null;
  /** 0..1 fraction. Null when the attempt isn't graded (bank Builder today). */
  passScore:    number | null;
  /** Total questions in the attempt — for the "X of N correct" line. */
  totalQ:       number;
  /** Source from AttemptHeader. Drives the eyebrow copy. */
  source:       'CUSTOM_BUILT' | 'READINESS_PACK' | 'PROGRAMME_ASSIGNED';
  /** "Review attempt" handler — dismisses popup + jumps to Q1 in review. */
  onReview:     () => void;
  /** "Close" handler — dismisses popup, leaves review screen behind it. */
  onDismiss:    () => void;
}

export function ResultsPopup({
  attemptId,
  finalScore,
  passScore,
  totalQ,
  source,
  onReview,
  onDismiss,
}: Props) {
  const router = useRouter();
  const [ctx, setCtx] = useState<ResultsContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restarting, startRestart] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getResultsContext(attemptId).then((r) => {
      if (cancelled) return;
      if (!r.ok) { setError(r.error); return; }
      setCtx(r.data);
    });
    return () => { cancelled = true; };
  }, [attemptId]);

  const pct = finalScore !== null ? Math.round(finalScore * 100) : null;
  // "X of N correct" — derived from final_score * totalQ rounded to 1dp.
  // Fractional results are possible (partial-credit on SATA/SELECT_N).
  const correctApprox = finalScore !== null ? finalScore * totalQ : null;
  const correctLabel = correctApprox !== null
    ? `${formatCount(correctApprox)} of ${totalQ} correct`
    : `${totalQ} questions`;

  const graded = passScore !== null && finalScore !== null;
  const passed = graded && finalScore >= passScore;

  const eyebrow = source === 'CUSTOM_BUILT' ? 'Session complete' : 'Quiz complete';

  function onRestart() {
    if (!ctx?.retakeAvailable) return;
    startRestart(async () => {
      const r = await restartAttemptAction(attemptId);
      if (!r.ok) { setError(r.error); return; }
      router.push(`/session/${r.data.attempt_id}`);
    });
  }

  function onExit() {
    if (!ctx) return;
    router.push(ctx.exitHref);
  }

  return (
    <>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
      <ViewerModalShell title="Results" onClose={onDismiss} size="narrow">
        <div className="results-popup">
          <div className="results-eyebrow">{eyebrow}</div>

          {pct !== null ? (
            <div className="results-score">
              <span className="num">{pct}</span>
              <span className="pct">%</span>
              <span className="frac">{correctLabel}</span>
            </div>
          ) : (
            <div className="results-score">
              <span className="frac">Score unavailable</span>
            </div>
          )}

          {graded && (
            <span className={'results-verdict ' + (passed ? 'pass' : 'fail')}>
              {passed ? '✓ Passed' : '✕ Didn’t pass'}
            </span>
          )}

          {(graded || ctx?.attemptsLine) && (
            <div className="results-facts">
              {graded && passScore !== null && (
                <div className="row">
                  <span>Pass mark</span>
                  <span className="v">{Math.round(passScore * 100)}%</span>
                </div>
              )}
              {ctx?.attemptsLine && (
                <div className="row">
                  <span>Attempts</span>
                  <span className="v">{ctx.attemptsLine}</span>
                </div>
              )}
            </div>
          )}

          <div className="results-actions">
            <button
              type="button"
              className="btn primary"
              onClick={onReview}
            >
              Review attempt
            </button>

            {ctx?.retakeAvailable && (
              <button
                type="button"
                className="btn secondary"
                onClick={onRestart}
                disabled={restarting}
              >
                {restarting ? 'Starting…' : ctx.retakeLabel}
              </button>
            )}

            <button
              type="button"
              className="btn tertiary"
              onClick={onExit}
              disabled={!ctx}
            >
              {ctx?.exitLabel ?? 'Exit'}
            </button>
          </div>
        </div>
      </ViewerModalShell>
    </>
  );
}


// "3.7 of 7 correct" — render integer when exact, one decimal otherwise.
function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
