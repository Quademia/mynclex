'use client';

// mynclex/app/(app)/student/bank/cat/result/[attemptId]/result-view.tsx
//
// The CAT results page (§13.2), in the plan's priority order: verdict →
// readiness probability → items administered → trajectory → category
// breakdown → clinical judgment → compare-to-previous → CTAs.
//
// Built from the Claude Design "CAT results" prototype (concept, not source
// — the app's own tokens and CSS classes are used throughout).
//
// WHAT IS DELIBERATELY NOT HERE (§13.5): a real-NCLEX pass prediction, a
// percentile against other students, a raw "X of N correct" score, and any
// restatement of the verdict on the Review surface. Each was excluded on
// purpose; don't add one without reopening §13.5.
//
// Also absent by decision: the raw theta / standard-error figures. The
// engine's internals are not a student-facing measure — the trajectory IS
// the ability estimate, drawn rather than named.

import { useState } from 'react';
import Link from 'next/link';
import {
  CATEGORY_FOOTNOTE,
  itemsAdministeredLine,
  formatProbability,
  verdictHeadline,
  verdictSubline,
  verdictBody,
  isNearBoundary,
} from '@/lib/practice/cat/report-derive';
import type { CatReport } from '@/lib/practice/cat/report';
import { TrajectoryChart } from './trajectory-chart';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const CJ_COPY = {
  STRONG: {
    label: 'Strong',
    note: 'You handled the case scenarios well.',
  },
  MIXED: {
    label: 'Mixed',
    note: 'Steady on some steps, shakier on others — worth targeted case practice.',
  },
  DEVELOPING: {
    label: 'Developing',
    note: 'The multi-step case scenarios are the area to strengthen next.',
  },
} as const;

export function CatResultView({ report }: { report: CatReport }) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const {
    verdict,
    probability,
    terminationReason,
    itemsAdministered,
    limitHours,
    trajectory,
    categories,
    clinicalJudgment: cj,
    priorCats,
    endedAt,
  } = report;

  const nearBoundary = isNearBoundary(probability);
  const hitCeiling = terminationReason === 'MAX_ITEMS_HIT';
  const reachedConfidence = terminationReason === 'CONFIDENCE_REACHED';

  // Amber whenever the engine did NOT settle — a near-boundary result or a
  // run that was cut off. Green/red are reserved for a confident verdict, so
  // the colour itself carries how much to trust the headline.
  const tone: 'pass' | 'fail' | 'caution' =
    nearBoundary || !reachedConfidence
      ? 'caution'
      : verdict === 'ABOVE_STANDARD'
        ? 'pass'
        : 'fail';

  const focused = focusIndex !== null ? trajectory[focusIndex] : null;

  return (
    <div className={`catr catr-${tone}`}>
      <header className="catr-top">
        <Link href="/student/bank/cat" className="catr-back">
          ← CAT home
        </Link>
        <p className="catr-eyebrow">Computerised Adaptive Test · Result</p>
        <p className="catr-date">{formatDate(endedAt)}</p>
      </header>

      {/* ── 1 + 2. Verdict and readiness probability ─────────────────── */}
      {/* The rail and main are explicit wrappers rather than letting the
          grid auto-place every card: with flat children the desktop grid
          gave the items line a row as tall as the verdict card beside it,
          stranding it above a large gap. Two children, two columns. */}
      <div className="catr-rail">
      <section className="catr-card catr-verdict">
        <div className="catr-verdict-head">
          <div className="catr-ring" aria-hidden="true">
            <span className="catr-ring-pct">{formatProbability(probability)}</span>
            {/* Just "confident" — the sub-line below already says confident
                OF WHAT, and the longer caption wrapped to three cramped
                lines inside the ring. */}
            <span className="catr-ring-cap">confident</span>
          </div>
          <div className="catr-verdict-text">
            <span className="catr-chip">
              {hitCeiling ? 'Maximum length reached' : 'Result'}
            </span>
            <h1 className="catr-headline">{verdictHeadline(verdict)}</h1>
          </div>
        </div>
        <div className="catr-verdict-body">
          <p className="catr-subline">{verdictSubline(verdict, probability)}</p>
          <p className="catr-body">{verdictBody(verdict, probability)}</p>
        </div>
      </section>
      </div>

      <div className="catr-main">
      {/* ── 3. Items administered ────────────────────────────────────── */}
      <p className="catr-items">
        {itemsAdministeredLine(itemsAdministered, terminationReason, limitHours)}
      </p>

      {/* The ceiling caveat (§9.5). A full-length run can show a
          confident-LOOKING probability while never having cleared the
          stopping threshold — the two are one measurement read at different
          thresholds. Said plainly here so the page doesn't look like it is
          contradicting itself. */}
      {hitCeiling && !nearBoundary && (
        <div className="catr-caveat" role="note">
          <p className="catr-caveat-title">
            Why {formatProbability(probability)} confident, but the exam still ran to the end?
          </p>
          <p className="catr-caveat-body">
            These are the same measurement read at two thresholds. The exam only stops
            early once we are about 97.5% sure — yours pointed one way but kept moving,
            so it ran the full length. The trajectory below shows a line that never
            quite settled: an honest full-length read, not a false stamp of confidence.
          </p>
        </div>
      )}

      {/* ── 4. Trajectory + per-item marker ──────────────────────────── */}
      <section className="catr-card">
        <h2 className="catr-h2">Your ability trajectory</h2>
        <p className="catr-sub">
          How the estimate moved with every answer. The line at zero is our passing
          standard, and the shaded band is how sure we were — it narrows as the exam
          learns more about you.
        </p>

        <TrajectoryChart points={trajectory} focusIndex={focusIndex} tone={tone} />

        {focused && (
          <p className="catr-focus" aria-live="polite">
            <strong>Question {focused.position}</strong> —{' '}
            {focused.isCorrect
              ? 'you answered this correctly'
              : focused.isPartial
                ? 'you earned partial credit here'
                : focused.answered
                  ? 'you answered this incorrectly'
                  : 'this one went unanswered'}
            {focused.isCaseChild ? ', inside a case study' : ''}.
          </p>
        )}

        <p className="catr-chips-label">Tap a question to place it on the curve</p>
        <div className="catr-chips" role="group" aria-label="Questions in this exam">
          {trajectory.map((p, i) => (
            <button
              key={p.position}
              type="button"
              className={
                'catr-chip-q' +
                (p.isCorrect ? ' is-correct' : p.isPartial ? ' is-partial' : ' is-wrong') +
                (p.isCaseChild ? ' is-case' : '') +
                (focusIndex === i ? ' is-focused' : '')
              }
              aria-pressed={focusIndex === i}
              aria-label={`Question ${p.position}`}
              onClick={() => setFocusIndex(focusIndex === i ? null : i)}
            />
          ))}
        </div>

        <ul className="catr-legend">
          <li><span className="catr-key is-correct" /> correct</li>
          <li><span className="catr-key is-partial" /> partial</li>
          <li><span className="catr-key is-wrong" /> wrong</li>
          <li><span className="catr-key is-case" /> case study</li>
        </ul>
      </section>

      {/* ── 5. Client Needs breakdown ────────────────────────────────── */}
      <section className="catr-card">
        <h2 className="catr-h2">Where you stood, by client-needs category</h2>
        <p className="catr-sub">
          Ordered weakest first. Read these against each other rather than as marks out
          of 100 — see the note below.
        </p>

        <ul className="catr-cats">
          {categories.map((c) => (
            <li key={c.name} className="catr-cat">
              <div className="catr-cat-head">
                <span className="catr-cat-name">{c.name}</span>
                <span className="catr-cat-num">
                  {c.correct} / {c.seen} · {Math.round(c.frac * 100)}%
                </span>
              </div>
              <div className="catr-bar">
                <div
                  className="catr-bar-fill"
                  style={{ width: `${Math.round(c.frac * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>

        {/* Mandatory (§13.2 / §4.5) — without it the category score reads as
            lower than the credit the engine actually gave. */}
        <p className="catr-footnote">{CATEGORY_FOOTNOTE}</p>
      </section>

      {/* ── 6. Clinical judgment ─────────────────────────────────────── */}
      {cj && (
        <section className="catr-card">
          <div className="catr-cj-head">
            <h2 className="catr-h2">Clinical judgment</h2>
            <span className={`catr-cj-chip is-${cj.band.toLowerCase()}`}>
              {CJ_COPY[cj.band].label}
            </span>
          </div>
          <p className="catr-sub">
            Drawn from the {cj.casesSeen === 1 ? 'case study' : `${cj.casesSeen} case studies`} you
            worked through — a competency the NCLEX measures on its own.{' '}
            {CJ_COPY[cj.band].note}
          </p>
        </section>
      )}

      {/* ── 7. Compare to previous ───────────────────────────────────── */}
      {priorCats.length > 1 ? (
        <section className="catr-card">
          <h2 className="catr-h2">Compared to your previous CATs</h2>
          <ol className="catr-prior">
            {priorCats.map((p, i) => (
              <li
                key={p.attemptId}
                className={`catr-prior-row${p.isCurrent ? ' is-current' : ''}`}
              >
                <span className="catr-prior-label">
                  {p.isCurrent ? 'This CAT' : `CAT ${i + 1}`}
                </span>
                <span className="catr-prior-track" aria-hidden="true">
                  <span
                    className={`catr-prior-dot${p.theta >= 0 ? ' is-above' : ' is-below'}`}
                    style={{ left: `${Math.round(((Math.max(-2, Math.min(2, p.theta)) + 2) / 4) * 100)}%` }}
                  />
                </span>
                <span className="catr-prior-verdict">
                  {p.verdict === 'ABOVE_STANDARD' ? 'Above' : 'Below'}
                </span>
              </li>
            ))}
          </ol>
          <p className="catr-footnote">
            Each dot is where a sitting ended, left to right from weaker to stronger. The
            middle is our passing standard.
          </p>
        </section>
      ) : (
        <section className="catr-card catr-first">
          <h2 className="catr-h2">This was your first CAT</h2>
          <p className="catr-sub">
            Take another in a few days and this space will chart how your ability moves
            from one sitting to the next.
          </p>
        </section>
      )}

      {/* ── CTAs ─────────────────────────────────────────────────────── */}
      <div className="catr-actions">
        {/* The shared runner Review surface (§14) — the same /session route
            every other quiz type reviews through, reached with a terminal
            attempt id. CAT adds no review surface of its own. */}
        <Link href={`/session/${report.attemptId}`} className="catr-btn catr-btn-primary">
          Review answers →
        </Link>
        <p className="catr-btn-note">
          Walk through every question, your answer and the rationale.
        </p>

        <Link href="/student/bank/cat" className="catr-btn catr-btn-ghost">
          When you’re ready — take another CAT
        </Link>
        <p className="catr-btn-note">
          A CAT is one full sitting and uses one attempt. Best after a short break, not
          straight away.
        </p>
      </div>
      </div>
    </div>
  );
}
