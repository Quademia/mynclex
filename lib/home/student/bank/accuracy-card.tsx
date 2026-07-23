// mynclex/lib/home/student/bank/accuracy-card.tsx
//
// Cards 5 + 6 — the weakest-area nudge and the eight blueprint bars.
// One read powers both, so the nudge can never name an area the bars
// contradict.
//
// The design's "biggest slice of the blueprint" claim is deliberately
// dropped: the bars are not blueprint-weighted, so saying so would be
// a claim we don't back. What we say instead is exactly what we know —
// it is your weakest area, and a focused set there lifts your average
// most.
//
// Below the cold-start gate neither appears: a mastery map drawn from
// a handful of questions is noise wearing the clothes of a diagnosis.

import Link from 'next/link';
import { DashboardAccuracyBulb } from '@/lib/hints/practice/dashboard-accuracy-bulb';
import { barTone, type BankAccuracy } from './accuracy';

/** The practice builder honours ?subcat= as a content pre-filter — the
 *  same deep link the readiness report uses to send a student to drill
 *  an area. */
function drillHref(subcategory: string): string {
  return `/student/bank/practice?subcat=${encodeURIComponent(subcategory)}`;
}

export function FocusBanner({ accuracy }: { accuracy: BankAccuracy }) {
  const weakest = accuracy.weakest;
  if (!weakest) return null;
  return (
    <section className="bd-card bd-focus" aria-label="Lowest-scoring category">
      <span className="bd-focus-icon" aria-hidden="true">
        💡
      </span>
      <div className="bd-focus-body">
        <span className="bd-eyebrow">Lowest-scoring category</span>
        <h2 className="bd-focus-title">
          {weakest.name} — {weakest.percent}% across {weakest.answered} answered
        </h2>
        <p className="bd-focus-sub">
          Your weakest of {accuracy.bars.length} areas. A focused set here lifts your
          average most.
        </p>
      </div>
      <Link className="bd-btn" href={drillHref(weakest.name)}>
        Drill it →
      </Link>
    </section>
  );
}

export function AccuracyCard({ accuracy }: { accuracy: BankAccuracy }) {
  if (!accuracy.hasEnough) {
    return (
      <section className="bd-card bd-acc" aria-label="Accuracy by category">
        <div className="bd-card-head">
          <h2 className="bd-card-title">Accuracy by category</h2>
          <DashboardAccuracyBulb />
        </div>
        <p className="bd-empty">
          Keep practising to unlock your mastery map — it appears once you have answered
          enough questions for the picture to mean something.
        </p>
      </section>
    );
  }

  return (
    <section className="bd-card bd-acc" aria-label="Accuracy by category">
      <div className="bd-card-head">
        <h2 className="bd-card-title">Accuracy by category</h2>
        <DashboardAccuracyBulb />
        {/* The bars' OWN denominator, not the overall answered count —
            older sittings snapshotted no subcategory and cannot be
            placed on this map. */}
        <span className="bd-card-note">from {accuracy.barsAnswered} answered</span>
      </div>
      <ul className="bd-acc-rows">
        {accuracy.bars.map((bar) => (
          <li key={bar.name} className="bd-acc-row">
            <span className="bd-acc-name" title={bar.name}>
              {bar.name}
            </span>
            <span
              className="bd-track bd-acc-track"
              role="img"
              aria-label={`${bar.name}: ${bar.correct} of ${bar.answered} correct`}
            >
              <span
                className={`bd-track-fill is-${barTone(bar.percent)}`}
                style={{ width: `${bar.percent}%` }}
              />
            </span>
            <span className={`bd-acc-pct is-${barTone(bar.percent)}`}>{bar.percent}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
