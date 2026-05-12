// mynclex/app/(app)/tutor/programme/[programme_id]/cohorts/page.tsx
//
// Cohorts tab — list of runs for this programme. Slice 9.2b.
//
// SELF_PACED programmes have no cohort layer, so direct nav to the
// URL 404s; the sidebar entry hides for them too (see
// components/nav/tutor/programme-shell.tsx).
//
// The +New cohort button lives in the header; an empty-state CTA
// covers the "no cohorts yet" path.

import { notFound } from 'next/navigation';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getCohortsForProgramme } from '@/lib/cohorts/queries';
import { CohortList } from '@/lib/cohorts/cohort-list';
import { NewCohortTrigger } from '@/lib/cohorts/new-cohort-trigger';

export const dynamic = 'force-dynamic';

export default async function ProgrammeCohortsPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  const programme = await getProgrammeForShell(programme_id);
  if (!programme) notFound();
  if (programme.delivery_mode === 'SELF_PACED') notFound();

  const cohorts = await getCohortsForProgramme(programme_id);

  return (
    <div className="cohorts-page">
      <header className="cohorts-head">
        <div>
          <h1 className="cohorts-title">Cohorts</h1>
          <p className="cohorts-sub">
            Each cohort is one run of this programme — its own dates,
            seats, and enrolled students.
          </p>
        </div>
        {cohorts.length > 0 && (
          <NewCohortTrigger
            programmeId={programme_id}
            programmeLengthUnits={programme.length_units}
            variant="header"
          />
        )}
      </header>

      {cohorts.length === 0 ? (
        <div className="cohorts-empty">
          <h2 className="cohorts-empty-title">
            No cohorts yet.
          </h2>
          <p className="cohorts-empty-sub">
            You can&apos;t enrol students until at least one cohort
            exists. Pick a start date, an end date, and (optionally) a
            seat cap.
          </p>
          <NewCohortTrigger
            programmeId={programme_id}
            programmeLengthUnits={programme.length_units}
            variant="empty"
          />
        </div>
      ) : (
        <CohortList cohorts={cohorts} />
      )}
    </div>
  );
}
