// mynclex/app/(app)/tutor/cohort/[cohort_id]/analytics/page.tsx
//
// Cohort Analytics tab — "how the class is doing" (cohort-scoped).
// Phase 1 = completion (navy); Phase 2 = quiz performance (teal) lands
// with the tutor-attempt access change. Built from the Claude Design
// "Cohort Analytics" handoff. Ownership is gated via getCohortAnalytics
// (null → 404), which itself proves cohort ownership.

import { notFound } from 'next/navigation';
import { getCohortAnalytics } from '@/lib/analytics/tutor/cohort-queries';
import { CohortAnalyticsView } from '@/lib/analytics/tutor/analytics-view';

export const dynamic = 'force-dynamic';

export default async function CohortAnalyticsPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  const data = await getCohortAnalytics(cohort_id, { includePerformance: true });
  if (!data) notFound();

  return (
    <div className="cohort-page">
      <header className="cohort-page-head">
        <div>
          <h1 className="cohort-page-title">Analytics</h1>
          <p className="cohort-page-sub">
            {data.meta.cohortName} · how the class is doing
          </p>
        </div>
      </header>
      <CohortAnalyticsView data={data} />
    </div>
  );
}
