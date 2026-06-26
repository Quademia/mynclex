// mynclex/app/(app)/tutor/programme/[programme_id]/overview/page.tsx
//
// Programme Overview — the programme detail landing. Rebuilt from the CD
// "Overview — A Card Grid" prototype (the "built LAST" surface, now that
// everything it summarises is in place). Mode-aware (TUTOR_LED vs
// SELF_PACED) via the programme's delivery_mode.
//
// Slice 1: header (status / gating / Edit / Archive) + KPI strip +
// sections grid, assembled by lib/home/tutor/getProgrammeOverview. The
// two-column work row (cohort / enrolment health + enquiries) is Slice 2.
//
// The zero-cohort "+ Add your first cohort" CTA is preserved for a brand-
// new TUTOR_LED programme — its KPIs/panels are empty, so the first action
// is to spin up a cohort.

import { notFound } from 'next/navigation';
import { getProgrammeOverview } from '@/lib/home/tutor/programme-overview-queries';
import { ProgrammeOverview } from '@/lib/home/tutor/programme-overview';
import { getCohortCountForProgramme } from '@/lib/cohorts/queries';
import { NewCohortTrigger } from '@/lib/cohorts/new-cohort-trigger';

export const dynamic = 'force-dynamic';

export default async function ProgrammeOverviewPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  const [data, cohortCount] = await Promise.all([
    getProgrammeOverview(programme_id),
    getCohortCountForProgramme(programme_id),
  ]);
  if (!data) notFound();

  const showEmptyCohortCta =
    data.header.deliveryMode === 'TUTOR_LED' && cohortCount === 0;

  return (
    <>
      <ProgrammeOverview data={data} />

      {showEmptyCohortCta && (
        <div className="pov pov-empty-wrap">
          <div className="programme-overview-cohorts-empty">
            <h2 className="programme-overview-cohorts-empty-title">
              No cohorts yet.
            </h2>
            <p className="programme-overview-cohorts-empty-sub">
              Spin up a cohort when you&apos;re ready to enrol students. The
              curriculum on this programme will be available to every cohort you
              create.
            </p>
            <NewCohortTrigger
              programmeId={programme_id}
              programmeLengthUnits={data.header.lengthUnits}
              variant="empty"
            />
          </div>
        </div>
      )}
    </>
  );
}
