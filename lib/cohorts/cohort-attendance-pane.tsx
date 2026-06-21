// mynclex/lib/cohorts/cohort-attendance-pane.tsx
//
// The Sessions → Attendance sub-pane (Slice 3). A thin server fetch
// boundary: it loads the attendance data and hands it to the client
// island, passing the request's `now` so the client's held/upcoming
// derivations stay stable (no server↔client clock drift / hydration
// mismatch). All rendering + date formatting happens client-side.

import { getCohortAttendance } from './attendance-queries';
import { CohortAttendanceClient } from './cohort-attendance-client';

export async function CohortAttendancePane({ cohortId }: { cohortId: string }) {
  const data = await getCohortAttendance(cohortId);
  // Null only on a race (cohort deleted mid-request) — parent guarded
  // ownership.
  if (!data) return null;

  return (
    <CohortAttendanceClient cohortId={cohortId} data={data} nowMs={data.nowMs} />
  );
}
