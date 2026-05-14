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
//
// Slice 9.3e adds the Publish / Archive status controls. Renders
// at the top of the page — high-impact action, deserves prime
// position. Independent of the cohort-empty CTA below it (the
// CTA is TUTOR_LED-only; status controls apply to every mode).

import { notFound } from 'next/navigation';
import { Placeholder } from '@/components/nav/shared/placeholder';
import {
  getProgrammeForShell,
  getProgrammeStatus,
} from '@/lib/programmes/queries';
import { getCohortCountForProgramme } from '@/lib/cohorts/queries';
import { NewCohortTrigger } from '@/lib/cohorts/new-cohort-trigger';
import { ProgrammeStatusControls } from '@/lib/programmes/programme-status-controls';

export const dynamic = 'force-dynamic';

export default async function ProgrammeOverviewPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  // Three parallel reads — shell context for the page itself,
  // status context for the controls, cohort count for the empty
  // CTA. All RLS-scoped to this tutor.
  const [programme, status, cohortCount] = await Promise.all([
    getProgrammeForShell(programme_id),
    getProgrammeStatus(programme_id),
    getCohortCountForProgramme(programme_id),
  ]);
  if (!programme || !status) notFound();

  return (
    <>
      <ProgrammeStatusControls programme={status} />

      <Placeholder
        title="Overview"
        subtitle="Programme home"
        description="Next live session, announcements, weekly progress, cohort size."
      />

      {programme.delivery_mode === 'TUTOR_LED' && cohortCount === 0 && (
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
