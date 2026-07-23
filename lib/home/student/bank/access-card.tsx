// mynclex/lib/home/student/bank/access-card.tsx
//
// Card 2 — the bank-access countdown. The eyebrow names WHICH pass is
// running out ("Bank 90-day"), which matters once a student has stacked
// subscriptions; the bar and the number come from that same pass, so
// they cannot disagree. No bar when we have no window length (a legacy
// row with no started_at) — the number still stands on its own.

import type { BankAccessCard } from './types';

export function AccessCard({ access }: { access: BankAccessCard }) {
  return (
    <div className="bd-access">
      <div className="bd-access-head">
        <span className="bd-eyebrow">{access.label}</span>
        <span className="bd-access-days">
          <strong>{access.daysLeft}</strong> {access.daysLeft === 1 ? 'day' : 'days'} left
        </span>
      </div>
      {access.percentLeft !== null && (
        <div
          className="bd-track"
          role="img"
          aria-label={`${access.percentLeft}% of your ${access.windowDays}-day pass remaining`}
        >
          <div className="bd-track-fill" style={{ width: `${access.percentLeft}%` }} />
        </div>
      )}
    </div>
  );
}
