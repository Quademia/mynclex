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
import { useRouter } from 'next/navigation';
import { startCatAttemptAction } from '@/lib/practice/cat/start-action';
import type { CatHomeView } from '@/lib/practice/cat/home-view';

function verdictLabel(v: 'ABOVE_STANDARD' | 'BELOW_STANDARD' | null): string {
  if (v === 'ABOVE_STANDARD') return 'Above standard';
  if (v === 'BELOW_STANDARD') return 'Below standard';
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
          ) : (
            <button
              type="button"
              className="cat-btn cat-btn-primary"
              onClick={() => setShowPreflight(true)}
              disabled={exhausted}
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
              <tr><th>Date</th><th>Questions</th><th>Result</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.attemptId}>
                  <td>{formatDate(h.endedAt)}</td>
                  <td>{h.itemsAdministered ?? '—'}</td>
                  <td>{verdictLabel(h.verdict)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* Slice 7 turns these rows into links to the full report. */}
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
