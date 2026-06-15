// mynclex/lib/cohorts/cohort-sessions-pane.tsx
//
// The cohort Sessions tab — the Live Session Planner. Server component:
// fetches every live-session marker in the programme curriculum joined to
// this cohort's schedule rows, then hands the data to the client list
// (which owns the schedule editor, the "+ Add session" one-off flow, and
// the empty state).

import { getCohortSessionsPlanner } from './live-session-queries';
import { CohortSessionsClient } from './cohort-sessions-client';

export async function CohortSessionsPane({ cohortId }: { cohortId: string }) {
  const planner = await getCohortSessionsPlanner(cohortId);
  // Null only on a race (cohort deleted mid-request) — the parent already
  // guarded ownership.
  if (!planner) return null;

  return (
    <div className="cohort-sessions-pane">
      <header className="cohort-sessions-head">
        <div>
          <h2 className="cohort-sessions-title">Live sessions</h2>
          <p className="cohort-sessions-sub">
            Set the date and join details for each live session in this
            cohort. Every run meets at its own time — this schedule applies
            to this cohort only.
          </p>
        </div>
      </header>

      <CohortSessionsClient
        planner={planner}
        cohortId={cohortId}
        unitLabelKind={planner.programme.unit_label}
      />
    </div>
  );
}
