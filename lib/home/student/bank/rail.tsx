// mynclex/lib/home/student/bank/rail.tsx
//
// The right rail — cards 9 (doorways) and 7 (recent activity).
//
// A doorway with no href renders as a non-interactive row rather than
// a dead link: the Journey Tracker isn't built, and a link that goes
// nowhere is worse than a door that visibly isn't open yet.

import Link from 'next/link';
import type { Doorway, RecentItem } from './types';

function Chevron() {
  return (
    <svg
      className="bd-chev"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function DoorwayRow({ door }: { door: Doorway }) {
  const inner = (
    <>
      <span className="bd-door-body">
        <span className="bd-door-title">{door.title}</span>
        {door.sub && <span className="bd-door-sub">{door.sub}</span>}
      </span>
      {door.href && <Chevron />}
    </>
  );

  if (!door.href) {
    // No aria-disabled: it isn't supported on a listitem, and there is
    // no control here to disable — the row is simply text until the
    // pillar exists.
    return <li className="bd-door is-locked">{inner}</li>;
  }

  return (
    <li>
      <Link className={`bd-door is-${door.tone}`} href={door.href}>
        {inner}
      </Link>
    </li>
  );
}

export function WhereToNext({ doorways }: { doorways: Doorway[] }) {
  return (
    <section className="bd-card" aria-label="Where to next">
      <div className="bd-card-head">
        <h2 className="bd-card-title">Where to next</h2>
      </div>
      <ul className="bd-doors">
        {doorways.map((d) => (
          <DoorwayRow key={d.key} door={d} />
        ))}
      </ul>
    </section>
  );
}

export function RecentActivity({ recent }: { recent: RecentItem[] }) {
  return (
    <section className="bd-card" aria-label="Recent activity">
      <div className="bd-card-head">
        <h2 className="bd-card-title">Recent activity</h2>
        {recent.length > 0 && (
          <Link className="bd-card-link" href="/student/bank/history">
            All history →
          </Link>
        )}
      </div>
      {recent.length === 0 ? (
        <p className="bd-empty">
          Nothing yet — your practice sets, readiness packs and CAT sittings will appear
          here.
        </p>
      ) : (
        <ul className="bd-recent">
          {recent.map((item) => {
            const row = (
              <>
                <span className="bd-recent-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="bd-recent-body">
                  <span className="bd-recent-title">{item.title}</span>
                  <span className="bd-recent-meta">{item.meta}</span>
                </span>
                {item.badge && (
                  <span className={`bd-pill is-${item.badge.tone}`}>{item.badge.label}</span>
                )}
              </>
            );
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link className="bd-recent-row" href={item.href}>
                    {row}
                  </Link>
                ) : (
                  <span className="bd-recent-row">{row}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
