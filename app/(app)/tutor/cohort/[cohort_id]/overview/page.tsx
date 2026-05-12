// mynclex/app/(app)/tutor/cohort/[cohort_id]/overview/page.tsx
//
// Cohort overview — first-real-content tab. Shows dates, derived
// status, seat info, late-join state, and a one-click link into
// the parent programme. Enrolled-count / next-session card / etc.
// land with the slices that ship the underlying features.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCohortForShell } from '@/lib/cohorts/queries';
import {
  cohortStatus,
  cohortStatusPillClass,
  formatCohortName,
  formatCohortSeats,
  formatCohortStatusLabel,
  formatDateRange,
} from '@/lib/cohorts/format';

export const dynamic = 'force-dynamic';

export default async function CohortOverviewPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  const ctx = await getCohortForShell(cohort_id);
  if (!ctx) notFound();

  const { cohort, programme } = ctx;
  const status = cohortStatus(cohort);
  const dateRange = formatDateRange(cohort.start_date, cohort.end_date);
  const displayName = formatCohortName(cohort);
  const hasCustomName = displayName !== dateRange;

  return (
    <div className="cohort-page">
      <header className="cohort-page-head">
        <div>
          <h1 className="cohort-page-title">{displayName}</h1>
          {hasCustomName && (
            <p className="cohort-page-sub">{dateRange}</p>
          )}
        </div>
        <span className={`cohort-pill ${cohortStatusPillClass(status)}`}>
          {formatCohortStatusLabel(status)}
        </span>
      </header>

      <div className="cohort-overview-grid">
        <section className="cohort-overview-card">
          <h2 className="cohort-overview-card-title">Schedule</h2>
          <dl className="cohort-overview-dl">
            <div>
              <dt>Start</dt>
              <dd>{cohort.start_date}</dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>{cohort.end_date}</dd>
            </div>
            <div>
              <dt>Late joiners</dt>
              <dd>{cohort.allow_late_join ? 'Allowed' : 'Closed at start'}</dd>
            </div>
          </dl>
        </section>

        <section className="cohort-overview-card">
          <h2 className="cohort-overview-card-title">Enrolment</h2>
          <dl className="cohort-overview-dl">
            <div>
              <dt>Capacity</dt>
              <dd>{formatCohortSeats(cohort.cohort_size)}</dd>
            </div>
            <div>
              <dt>Enrolled</dt>
              <dd className="cohort-overview-faint">
                Coming soon — needs the enrolment table.
              </dd>
            </div>
          </dl>
        </section>

        <section className="cohort-overview-card">
          <h2 className="cohort-overview-card-title">Programme</h2>
          <p className="cohort-overview-prose">
            This cohort runs the{' '}
            <Link
              href={`/tutor/programme/${programme.programme_id}/overview`}
              className="cohort-overview-link"
            >
              {programme.title}
            </Link>{' '}
            programme ({programme.length_units} {programme.unit_label === 'WEEK' ? 'weeks' : 'modules'}).
            Curriculum edits at the programme layer apply to every
            cohort.
          </p>
        </section>

        {status === 'CANCELLED' && cohort.cancelled_at && (
          <section className="cohort-overview-card is-cancelled">
            <h2 className="cohort-overview-card-title">Cancelled</h2>
            <p className="cohort-overview-prose">
              This cohort was cancelled on{' '}
              {new Date(cohort.cancelled_at).toLocaleDateString()}.
              Students lose access; new enrolments are blocked. Contact
              an admin to reinstate it if needed.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
