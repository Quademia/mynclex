// mynclex/app/(app)/tutor/cohort/[cohort_id]/overview/page.tsx
//
// Cohort overview — first-real-content tab. Shows dates, derived
// status, seat info, late-join state, and a one-click link into
// the parent programme. Enrolled-count / next-session card / etc.
// land with the slices that ship the underlying features.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCohortForShell } from '@/lib/cohorts/queries';
import { getCohortAnalytics } from '@/lib/analytics/tutor/cohort-queries';
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

  // Class-progress teaser (Slice 1) — replaces the old "coming soon"
  // enrolment placeholder + links into the Analytics tab. Owned-cohort
  // guaranteed by getCohortForShell above; null only on a race → skip.
  const analytics = await getCohortAnalytics(cohort_id);

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
              <dd>
                {analytics
                  ? `${analytics.summary.studentCount} ${
                      analytics.summary.studentCount === 1 ? 'student' : 'students'
                    }`
                  : '—'}
              </dd>
            </div>
          </dl>
          {/* The roster lives at programme level (2026-06-12 move);
              ?cohort= pre-filters it to this cohort's students. */}
          <Link
            href={`/tutor/programme/${programme.programme_id}/enrolments?cohort=${cohort_id}`}
            className="cohort-overview-link"
          >
            Manage enrolments →
          </Link>
        </section>

        {analytics && analytics.summary.studentCount > 0 && (
          <section className="cohort-overview-card">
            <h2 className="cohort-overview-card-title">Class progress</h2>
            <p className="cohort-overview-prose">
              <strong>{analytics.summary.avgCompletion}%</strong> average completion
              of released work.{' '}
              <strong>{analytics.summary.buckets.ontrack}</strong> on track
              {analytics.summary.buckets.behind + analytics.summary.buckets.risk > 0 && (
                <>
                  {', '}
                  <strong>
                    {analytics.summary.buckets.behind + analytics.summary.buckets.risk}
                  </strong>{' '}
                  need attention
                </>
              )}
              {analytics.summary.buckets.notstarted > 0 && (
                <>
                  {', '}
                  <strong>{analytics.summary.buckets.notstarted}</strong> not started
                </>
              )}
              .
            </p>
            <Link
              href={`/tutor/cohort/${cohort_id}/analytics`}
              className="cohort-overview-link"
            >
              View analytics →
            </Link>
          </section>
        )}

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
