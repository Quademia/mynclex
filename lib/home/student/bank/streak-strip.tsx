// mynclex/lib/home/student/bank/streak-strip.tsx
//
// Card 3 — the bank study streak. A BANK streak, independent of the
// programme home's: it counts everything bank-related (built practice,
// CAT, readiness packs). The week cells and the numbers are derived
// from one feed of timestamps, so the strip can never contradict the
// count beside it.

import type { BankStreak } from './types';

export function StreakStrip({ streak }: { streak: BankStreak }) {
  return (
    <section className="bd-streak" aria-label="Study streak">
      <span className="bd-streak-flame" aria-hidden="true">
        🔥
      </span>
      <span className="bd-streak-stat">
        <span className="bd-streak-label">Current</span>
        <strong className="bd-streak-num">{streak.current}</strong>
        <span className="bd-streak-unit">{streak.current === 1 ? 'day' : 'days'}</span>
      </span>
      <span className="bd-streak-rule" aria-hidden="true" />
      <span className="bd-streak-stat">
        <span className="bd-streak-label">Longest</span>
        <strong className="bd-streak-num is-best">{streak.best}</strong>
        <span className="bd-streak-unit">{streak.best === 1 ? 'day' : 'days'}</span>
      </span>
      <span className="bd-streak-week" aria-hidden="true">
        {streak.days.map((on, i) => (
          <span key={i} className={`bd-streak-cell${on ? ' is-on' : ''}`} />
        ))}
      </span>
      <span className="bd-streak-caption">{streak.caption}</span>
    </section>
  );
}
