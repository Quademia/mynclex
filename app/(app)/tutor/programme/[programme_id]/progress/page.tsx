// mynclex/app/(app)/tutor/programme/[programme_id]/progress/page.tsx
//
// Programme Progress — the self-paced delivery unit's dashboard.
//
// ⭐ WHY THIS EXISTS AT PROGRAMME LEVEL. A tutor-led programme delivers
// through cohorts, and each cohort's Progress tab already carries this
// dashboard. A self-paced programme has no cohort layer — the programme IS
// the delivery unit ("one cohort with late joins") — so its dashboard has
// nowhere else to live. Before this, a tutor running self-paced could see
// who had paid and nothing else: no way to tell whether anybody had ever
// opened the curriculum.
//
// ⚠ SELF_PACED ONLY, gated twice. The sidebar hides the row for tutor-led
// (components/nav/tutor/programme-shell.tsx), and this page 404s on it
// regardless — a hidden nav entry is not access control, and the URL is
// guessable. Per the layered-enforcement rule: gate at every layer.
// The third layer is RLS: every read behind getSelfPacedProgrammeAnalytics
// is scoped to programmes the caller owns.
//
// Renders the SAME view component as the cohort tab, in its self-paced
// vocabulary — see lib/analytics/tutor/analytics-view.tsx.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getSelfPacedProgrammeAnalytics } from '@/lib/analytics/tutor/programme-queries';
import { CohortAnalyticsView } from '@/lib/analytics/tutor/analytics-view';

export const dynamic = 'force-dynamic';

export default async function ProgrammeProgressPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  // Ownership gate (RLS-scoped, null → 404).
  const programme = await getProgrammeForShell(programme_id);
  if (!programme) notFound();

  // Mode gate — see the header note.
  if (programme.delivery_mode !== 'SELF_PACED') notFound();

  const analytics = await getSelfPacedProgrammeAnalytics(programme_id, {
    includePerformance: true,
  });
  if (!analytics) notFound();

  const enrolmentsHref = `/tutor/programme/${programme_id}/enrolments`;

  return (
    <div className="an-page">
      <div className="an-pagehead">
        <div>
          <h1 className="an-pagetitle">Progress</h1>
          <p className="an-pagesub">
            How your self-paced students are getting on. Everyone works to
            their own clock, so this is ordered by who needs you.
          </p>
        </div>
        <div className="an-pagehead-actions">
          <span className="an-pagehead-count">
            {analytics.summary.studentCount}{' '}
            {analytics.summary.studentCount === 1 ? 'student' : 'students'}
          </span>
          <Link href={enrolmentsHref} className="an-pagehead-link">
            Manage enrolments →
          </Link>
        </div>
      </div>

      <CohortAnalyticsView data={analytics} />
    </div>
  );
}
