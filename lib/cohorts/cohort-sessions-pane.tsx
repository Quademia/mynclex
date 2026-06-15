// mynclex/lib/cohorts/cohort-sessions-pane.tsx
//
// The cohort Sessions tab — the Live Session Planner (Slice 1b).
// Replaces the old placeholder. Server component: fetches every
// live-session marker in the programme curriculum joined to this
// cohort's schedule rows, then hands the data to the client list.

import Link from 'next/link';
import { getCohortSessionsPlanner } from './live-session-queries';
import { CohortSessionsClient } from './cohort-sessions-client';

export async function CohortSessionsPane({
  programmeId,
  cohortId,
}: {
  programmeId: string;
  cohortId: string;
}) {
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

      {planner.sessions.length === 0 ? (
        <div className="cohort-sessions-empty">
          <p className="cohort-sessions-empty-title">
            No live sessions in this programme&apos;s curriculum yet.
          </p>
          <p className="cohort-sessions-empty-sub">
            Add a live-session activity in the{' '}
            <Link href={`/tutor/programme/${programmeId}/curriculum`}>
              Curriculum
            </Link>
            , then schedule it here for this cohort.
          </p>
        </div>
      ) : (
        <CohortSessionsClient
          planner={planner}
          cohortId={cohortId}
          unitLabelKind={planner.programme.unit_label}
        />
      )}
    </div>
  );
}
