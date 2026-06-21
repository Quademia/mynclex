// mynclex/lib/cohorts/cohort-sessions-pane.tsx
//
// The cohort Sessions tab. Two sub-tabs (Slice 3):
//   • Schedule   — the Live Session Planner: set date + join details per
//                  cohort, add one-off sessions (the original surface).
//   • Attendance — take attendance for held sessions (tutor-marked
//                  PRESENT/ABSENT/EXCUSED → derived completion).
//
// This wrapper is a thin server component: it renders the shared header +
// the sub-tab bar (?stab=), then delegates to the active sub-pane. Only the
// active sub-pane fetches, so each request pays for one sub-tab — same
// philosophy as the cohort tab switch in cohort-detail.tsx.

import Link from 'next/link';
import { getCohortSessionsPlanner } from './live-session-queries';
import { CohortSessionsClient } from './cohort-sessions-client';
import { CohortAttendancePane } from './cohort-attendance-pane';
import type { SessionsSubTab } from './cohort-detail';

function subTabHref(
  programmeId: string,
  cohortId: string,
  subTab: SessionsSubTab,
): string {
  const base = `/tutor/programme/${programmeId}/cohorts?cohort=${cohortId}&tab=sessions`;
  return subTab === 'attendance' ? `${base}&stab=attendance` : base;
}

export async function CohortSessionsPane({
  programmeId,
  cohortId,
  subTab,
}: {
  programmeId: string;
  cohortId: string;
  subTab: SessionsSubTab;
}) {
  return (
    <div className="cohort-sessions-pane">
      <header className="cohort-sessions-head">
        <div>
          <h2 className="cohort-sessions-title">Live sessions</h2>
          <p className="cohort-sessions-sub">
            Schedule each session for this cohort, then take attendance after
            the call. Attendance you mark is what counts toward a student&apos;s
            progress.
          </p>
        </div>
      </header>

      <nav className="cohort-subtabs" aria-label="Sessions sub-sections">
        <Link
          href={subTabHref(programmeId, cohortId, 'schedule')}
          className={subTab === 'schedule' ? 'cohort-subtab active' : 'cohort-subtab'}
          aria-current={subTab === 'schedule' ? 'page' : undefined}
        >
          Schedule
        </Link>
        <Link
          href={subTabHref(programmeId, cohortId, 'attendance')}
          className={subTab === 'attendance' ? 'cohort-subtab active' : 'cohort-subtab'}
          aria-current={subTab === 'attendance' ? 'page' : undefined}
        >
          Attendance
        </Link>
      </nav>

      {subTab === 'attendance' ? (
        <CohortAttendancePane cohortId={cohortId} />
      ) : (
        <CohortSchedulePane cohortId={cohortId} />
      )}
    </div>
  );
}

// The Schedule sub-pane — the original planner. Fetches the markers +
// per-cohort schedules and hands them to the client list (which owns the
// schedule editor, "+ Add session", and Remove).
async function CohortSchedulePane({ cohortId }: { cohortId: string }) {
  const planner = await getCohortSessionsPlanner(cohortId);
  // Null only on a race (cohort deleted mid-request) — parent guarded
  // ownership.
  if (!planner) return null;

  return (
    <CohortSessionsClient
      planner={planner}
      cohortId={cohortId}
      unitLabelKind={planner.programme.unit_label}
    />
  );
}
