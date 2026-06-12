// mynclex/lib/cohorts/cohort-overview-pane.tsx
//
// Overview pane of the in-page cohort run detail — the landing tab.
// Body moved from the old /tutor/cohort/[id]/overview page in the
// cohort-workspace fold; the run header (name + status + dates) now
// lives in <CohortDetail>, and the old "Programme" card is dropped
// (you're already inside the programme).

import Link from 'next/link';
import type { getCohortAnalytics } from '@/lib/analytics/tutor/cohort-queries';
import type { Cohort } from './types';
import { cohortStatus, formatCohortSeats } from './format';

export function CohortOverviewPane({
  programmeId,
  cohort,
  analytics,
}: {
  programmeId: string;
  cohort: Cohort;
  analytics: Awaited<ReturnType<typeof getCohortAnalytics>>;
}) {
  const status = cohortStatus(cohort);

  return (
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
          href={`/tutor/programme/${programmeId}/enrolments?cohort=${cohort.cohort_id}`}
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
            href={`/tutor/programme/${programmeId}/cohorts?cohort=${cohort.cohort_id}&tab=analytics`}
            className="cohort-overview-link"
          >
            View analytics →
          </Link>
        </section>
      )}

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
  );
}
