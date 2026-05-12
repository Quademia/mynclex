// mynclex/app/(app)/tutor/programme/[programme_id]/overview/page.tsx
//
// Programme Overview. Currently a placeholder for the real overview
// content (next live session, weekly progress, etc.) — that lands in
// a later slice.
//
// Slice 9.2b layers an empty-state CTA on top of the placeholder
// when the TUTOR_LED programme has zero cohorts: tutors landing
// here see an obvious "+ Add your first cohort" call rather than
// having to navigate to the Cohorts tab and find it there.

import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/nav/shared/placeholder';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getCohortCountForProgramme } from '@/lib/cohorts/queries';
import { NewCohortTrigger } from '@/lib/cohorts/new-cohort-trigger';

export const dynamic = 'force-dynamic';

export default async function ProgrammeOverviewPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  const programme = await getProgrammeForShell(programme_id);
  if (!programme) notFound();

  // SELF_PACED has no cohort layer — skip the cohort-empty CTA path.
  const cohortCount =
    programme.delivery_mode === 'SELF_PACED'
      ? null
      : await getCohortCountForProgramme(programme_id);

  return (
    <>
      <Placeholder
        title="Overview"
        subtitle="Programme home"
        description="Next live session, announcements, weekly progress, cohort size."
      />

      {cohortCount === 0 && (
        <div className="programme-overview-cohorts-empty">
          <h2 className="programme-overview-cohorts-empty-title">
            No cohorts yet.
          </h2>
          <p className="programme-overview-cohorts-empty-sub">
            Spin up a cohort when you&apos;re ready to enrol students.
            The curriculum on this programme will be available to every
            cohort you create.
          </p>
          <NewCohortTrigger
            programmeId={programme_id}
            programmeLengthUnits={programme.length_units}
            variant="empty"
          />
        </div>
      )}
    </>
  );
}
