// mynclex/lib/home/student/bank/bank-dashboard.tsx
//
// The Bank Dashboard view — the student's home for the Question Bank
// (CAT plan §19.4 Slice 9). Built from the Claude Design "Bank
// Dashboard" 2d handoff; concept-not-source, rebuilt against our own
// tokens. Styling: styles/bank-dashboard.css (`bd-` prefix).
//
// Server component: it renders data the route already loaded. Only the
// pieces that genuinely need interactivity (the 💡 bulbs) are clients.

import { AccessCard } from './access-card';
import { StreakStrip } from './streak-strip';
import { ResumeBanner } from './resume-banner';
import { AccuracyCard, FocusBanner } from './accuracy-card';
import { RecentActivity, WhereToNext } from './rail';
import { ReadinessPanel } from './readiness-panel';
import type { BankDashboardData } from './types';

export function BankDashboard({ data }: { data: BankDashboardData }) {
  return (
    <div className="bd">
      <header className="bd-top">
        <div className="bd-greet">
          <h1 className="bd-greet-title">
            Welcome back{data.firstName ? `, ${data.firstName}` : ''}
          </h1>
          {/* One text node, not three — a bare " · " between JSX
              expressions renders as its own whitespace node and the
              leading space gets lost against the date. */}
          <p className="bd-greet-sub">
            {`${data.todayLabel} · Here’s everything on your bank right now.`}
          </p>
        </div>
        {data.access && <AccessCard access={data.access} />}
      </header>

      <StreakStrip streak={data.streak} />

      <ReadinessPanel data={data.readiness} />

      {/* Two columns: the work on the left, doorways + activity on the
          right. */}
      <div className="bd-grid">
        <div className="bd-col-work">
          {data.resume && <ResumeBanner resume={data.resume} />}
          <FocusBanner accuracy={data.accuracy} />
          <AccuracyCard accuracy={data.accuracy} />
        </div>
        <div className="bd-col-rail">
          <WhereToNext doorways={data.doorways} />
          <RecentActivity recent={data.recent} />
        </div>
      </div>
    </div>
  );
}
