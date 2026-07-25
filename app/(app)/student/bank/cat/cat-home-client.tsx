'use client';

// mynclex/app/(app)/student/bank/cat/cat-home-client.tsx
//
// CAT home + the one-shot preflight (§10.7, §10.7.2).
//
// The preflight is its OWN surface here, deliberately not a branch of the
// shared /session gate: that one is addressed by an attempt id and renders
// only while started_at is NULL, and under §10.7 no attempt exists until
// Confirm. Nothing is created, counted or spent before that button.
//
// It cannot state a question count — a CAT is 85-150 and unknowable in
// advance — so every line here is fixed copy.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startCatAttemptAction } from '@/lib/practice/cat/start-action';
import { isUnmeasured, UNMEASURED_SHORT_LABEL } from '@/lib/practice/cat/report-derive';
import type { CatHomeView, CatHistoryEntry } from '@/lib/practice/cat/home-view';

/**
 * The Result column.
 *
 * Takes the whole row, not just the verdict, because a sitting that ran out
 * of time under the 85-item minimum carries BELOW_STANDARD without having
 * been measured. Labelling it "Below standard" here would put a silent
 * apparent decline in a list a student scans for progress — and would
 * contradict the report, which says "Not passed — ran out of time". Both
 * surfaces read the same predicate and the same string.
 */
function verdictLabel(entry: CatHistoryEntry): string {
  if (isUnmeasured(entry.terminationReason, entry.itemsAdministered ?? 0)) {
    return UNMEASURED_SHORT_LABEL;
  }
  if (entry.verdict === 'ABOVE_STANDARD') return 'Above standard';
  if (entry.verdict === 'BELOW_STANDARD') return 'Below standard';
  return 'Not completed';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function CatHomeClient({ view }: { view: CatHomeView }) {
  const router = useRouter();
  const [showPreflight, setShowPreflight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { shape, allowance, exhausted, history, inProgressAttemptId } = view;

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      const r = await startCatAttemptAction();
      if (!r.ok) { setError(r.error); return; }
      router.push(`/session/${r.attemptId}`);
    });
  };

  return (
    <div className="cat-home">
      <header className="cat-hero">
        <p className="cat-eyebrow">Computerised Adaptive Test</p>
        <h1 className="cat-title">Sit a CAT</h1>
        <p className="cat-lede">
          A CAT works the way the real NCLEX does. It adapts to you — every answer changes
          how hard the next question is — and it stops as soon as it is confident about
          where you stand, not after a fixed number of questions.
        </p>

        <a className="cat-hero-help" href="/help/cat">How CAT works →</a>

        <ul className="cat-facts">
          <li><strong>{shape.minItems}–{shape.maxItems}</strong><span>questions</span></li>
          <li><strong>Up to {shape.hours} hours</strong><span>one sitting</span></li>
          <li><strong>No going back</strong><span>one question at a time</span></li>
        </ul>

        {/* Allowance renders ONLY when finite (§10.7.2 honesty constraint).
            Every allowance is NULL today, so most students see nothing here
            rather than an invented "2 of 3 left". */}
        {allowance && (
          <p className={`cat-allowance${exhausted ? ' is-exhausted' : ''}`}>
            {exhausted
              ? 'You have used all the CATs included in your plan.'
              : `${allowance.remaining} of ${allowance.total} CATs remaining on your plan.`}
          </p>
        )}

        <div className="cat-actions">
          {inProgressAttemptId ? (
            <>
              <button
                type="button"
                className="cat-btn cat-btn-primary"
                onClick={() => router.push(`/session/${inProgressAttemptId}`)}
              >
                Resume your CAT
              </button>
              <p className="cat-note">
                You have a CAT in progress. It is already using your attempt, so resuming
                costs nothing extra.
              </p>
            </>
          ) : exhausted ? (
            // Allowance used up (§15.5): a dead disabled button leaves no way
            // forward, so the CTA becomes a route to buy more bank access —
            // a new pass carries its own CAT allowance.
            <>
              <Link href="/bank-access" className="cat-btn cat-btn-primary">
                Get more bank access →
              </Link>
              <p className="cat-note">
                You&apos;ve used every CAT included in your current plan. A new bank
                pass includes more.
              </p>
            </>
          ) : (
            <button
              type="button"
              className="cat-btn cat-btn-primary"
              onClick={() => setShowPreflight(true)}
            >
              Start a CAT
            </button>
          )}
        </div>
      </header>

      <section className="cat-section">
        <h2 className="cat-h2">Your CAT history</h2>
        {history.length === 0 ? (
          <p className="cat-empty">
            You haven&apos;t taken a CAT yet. Your results will appear here once you finish one.
          </p>
        ) : (
          <table className="cat-table">
            <thead>
              <tr><th>Date</th><th>Questions</th><th>Result</th><th /><th /></tr>
            </thead>
            <tbody>
              {history.map((h) => {
                // A direct shortcut into the per-question walkthrough, beside
                // the report link (§14.3 keeps the report the row's primary
                // destination; this is an added convenience). Only shown when
                // there is actually something to review: an ABANDONED CAT has
                // its rows hard-deleted, so /session would bounce to Practice.
                const reviewable =
                  h.status !== 'ABANDONED' && (h.itemsAdministered ?? 0) > 0;
                return (
                  <tr key={h.attemptId}>
                    <td>{formatDate(h.endedAt)}</td>
                    <td>{h.itemsAdministered ?? '—'}</td>
                    <td>{verdictLabel(h)}</td>
                    <td className="cat-table-go">
                      {reviewable && (
                        <Link href={`/session/${h.attemptId}`} className="cat-review-btn">
                          Review
                        </Link>
                      )}
                    </td>
                    <td className="cat-table-go">
                      {/* Every terminal row links — including one with no
                          verdict, which lands on the abandoned surface and is
                          told why there is nothing to show. */}
                      <Link href={`/student/bank/cat/result/${h.attemptId}`}>
                        {h.verdict ? 'View report' : 'Details'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {showPreflight && (
        // Backdrop click maps to the SAFE option (CLAUDE.md UI #2). Ignored
        // while a start is in flight, so a stray click cannot leave the
        // student on this page while an attempt is being created.
        <div className="cat-preflight-backdrop" role="dialog" aria-modal="true"
             aria-labelledby="cat-preflight-title"
             onClick={() => { if (!pending) { setShowPreflight(false); setError(null); } }}>
          <div className="cat-preflight" onClick={(e) => e.stopPropagation()}>
            <h2 id="cat-preflight-title" className="cat-preflight-title">
              Before you begin
            </h2>

            <ul className="cat-preflight-points">
              <li>
                <strong>Starting spends this attempt.</strong> However the exam ends —
                including if your device or connection fails — it counts as used. We
                cannot tell the difference, so we are telling you now rather than
                deciding afterwards.
              </li>
              <li>
                <strong>One sitting, up to {shape.hours} hours.</strong> There is no pause.
              </li>
              <li>
                <strong>You cannot go back.</strong> Each answer decides the next question,
                so previous questions cannot be revisited or changed.
              </li>
              <li>
                <strong>Length varies.</strong> The exam ends between {shape.minItems} and{' '}
                {shape.maxItems} questions, whenever it is confident — a short exam is not
                a bad sign.
              </li>
            </ul>

            {error && <p className="cat-preflight-error" role="alert">{error}</p>}

            <a
              className="cat-preflight-help"
              href="/help/cat"
              target="_blank"
              rel="noopener noreferrer"
            >
              How CAT works <span aria-hidden="true">↗</span>
            </a>

            <div className="cat-preflight-actions">
              <button
                type="button"
                className="cat-btn cat-btn-ghost"
                onClick={() => { setShowPreflight(false); setError(null); }}
                disabled={pending}
              >
                Not now
              </button>
              <button
                type="button"
                className="cat-btn cat-btn-danger"
                onClick={onConfirm}
                disabled={pending}
              >
                {pending ? 'Starting…' : 'Start my CAT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
