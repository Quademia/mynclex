// mynclex/lib/practice/runner/results-popup.tsx
//
// Slice 3a — universal end-of-quiz results popup. Sits over the runner's
// review-mode screen the moment an attempt completes, OR on demand via
// the topbar pill click after dismiss.
//
// Source-aware via the new `getResultsContext` action (one round trip
// on mount):
//   • CUSTOM_BUILT       → "Build another" + Exit to bank
//   • PROGRAMME_ASSIGNED → "Take again" + Exit to curriculum + attempts line
//   • READINESS_PACK     → "See your full report" (→ the permanent report
//                          page) + Back to packs; no inline review, no
//                          retake (one shot, "Exam complete" eyebrow)
//
// CAT overrides all of the above and is keyed off `isCat` (the attempt's
// MODE) rather than source, because a CAT is stored as CUSTOM_BUILT. It
// renders a deliberately near-empty variant: the exam ended, why it ended,
// and one way onward to the report. No score, no percentage, no verdict.
// Two reasons:
//   1. §13.5 — a raw "X of N correct" must never front a CAT. A CAT serves
//      questions at the edge of ability, so raw correctness converges toward
//      half for everyone; the first real CAT read 41.6% under a 98%-confident
//      pass. That number as the headline would tell a passing student they
//      failed.
//   2. A CAT stops mid-flow with no warning. Without an explicit "this ended
//      on purpose", the ending is indistinguishable from a crash.
// `isCat` is a prop, not read from the fetched context, so the variant is
// known at FIRST paint — routing it through `ctx` would flash the forbidden
// score for the length of one round trip.
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
  /** True when the attempt's mode is CAT. Overrides `source` entirely — see
   *  the file header. Passed rather than derived so it holds at first paint. */
  isCat:        boolean;
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
  isCat,
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

  // Readiness renders a distinct variant once the context arrives: the
  // permanent report page is the hub, so the popup offers "See your full
  // report" instead of the inline review + retake.
  const isReadiness = source === 'READINESS_PACK';
  const eyebrow =
    source === 'CUSTOM_BUILT' ? 'Session complete'
    : isReadiness ? 'Exam complete'
    : 'Quiz complete';

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

  // ── CAT ───────────────────────────────────────────────────────────
  // Its own body rather than a branch inside the shared one: nearly every
  // region below (score, verdict badge, pass mark, attempts, review, retake)
  // is one a CAT must NOT show, so sharing would be a chain of negations.
  if (isCat) {
    return (
      <>
        <ErrorToast error={error} onDismiss={() => setError(null)} />
        <ViewerModalShell title="Results" onClose={onDismiss} size="narrow">
          <div className="results-popup results-cat">
            <div className="results-eyebrow">Exam complete</div>

            <p className="results-cat-head">Your exam has ended.</p>

            {/* Resolved server-side from the attempt's own termination
                reason, using the report's sentence — the popup and the page
                one tap later describe the ending identically. '…' holds the
                line's height for the one round trip so nothing jumps. */}
            <p className="results-cat-reason">{ctx?.cat?.reasonLine ?? '…'}</p>

            {/* Two different endings, two different promises. With a verdict
                this pre-empts the misreading the raw score would have caused.
                WITHOUT one there is no result at all — the exam was ended
                from outside before the engine measured anything — and
                promising a result on the next screen would be a plain lie:
                the report renders its "This CAT ended early" surface. The
                note is held back entirely until the context arrives rather
                than defaulting to the optimistic wording. */}
            {ctx?.cat && (
              <p className="results-cat-note">
                {ctx.cat.hasVerdict
                  ? `Your result is on the next screen. A CAT keeps serving
                     questions at the edge of what you can do, so how many you
                     got right isn’t what it measures.`
                  : `It ended before the engine could measure where you stand,
                     so there’s no result for this one.`}
              </p>
            )}

            <div className="results-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => ctx?.reportHref && router.push(ctx.reportHref)}
                disabled={!ctx?.reportHref}
              >
                {ctx?.cat && !ctx.cat.hasVerdict ? 'See what happened' : 'See your results'}
              </button>

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
            {isReadiness ? (
              // Readiness — the report page is the hub. Primary CTA goes
              // there (per-question review is reached from the report,
              // window-gated). No inline review, no retake (one shot).
              <button
                type="button"
                className="btn primary"
                onClick={() => ctx?.reportHref && router.push(ctx.reportHref)}
                disabled={!ctx?.reportHref}
              >
                See your full report
              </button>
            ) : (
              <>
                {/* A Builder sitting now has a permanent report, so it leads
                    — a report is a safer landing than dropping straight back
                    into question 1. Unlike readiness, it does NOT replace the
                    other two: a practice quiz is repeatable and low-stakes,
                    so review stays reachable in one tap and "Build another"
                    stays put. This branch previously ignored `reportHref`
                    entirely, which is why the field alone wasn't enough. */}
                {ctx?.reportHref && (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => router.push(ctx.reportHref!)}
                  >
                    See your session report
                  </button>
                )}

                <button
                  type="button"
                  className={ctx?.reportHref ? 'btn secondary' : 'btn primary'}
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
              </>
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
