// mynclex/app/(app)/tutor/cohort/[cohort_id]/settings/page.tsx
//
// Cohort Settings tab — Edit + Cancel. Edit reuses
// <CohortFormModal> in edit mode (modal pattern matches programme
// edit). Cancel is a simple confirm dialog — soft cancellation
// sets cancelled_at; reversible by admin later.

import { notFound } from 'next/navigation';
import { getCohortForShell } from '@/lib/cohorts/queries';
import { formatCohortName } from '@/lib/cohorts/format';
import { EditCohortTrigger } from '@/lib/cohorts/edit-cohort-trigger';
import { CancelCohortConfirm } from '@/lib/cohorts/cancel-cohort-confirm';

export const dynamic = 'force-dynamic';

export default async function CohortSettingsPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  const ctx = await getCohortForShell(cohort_id);
  if (!ctx) notFound();

  const { cohort, programme } = ctx;
  const isCancelled = cohort.cancelled_at != null;
  const cohortLabel = formatCohortName(cohort);

  // Form-payload shape consumed by the cohort modal in edit mode.
  const initial = {
    name: cohort.name,
    start_date: cohort.start_date,
    end_date: cohort.end_date,
    cohort_size: cohort.cohort_size,
    allow_late_join: cohort.allow_late_join,
  };

  return (
    <div className="cohort-page">
      <header className="cohort-page-head">
        <div>
          <h1 className="cohort-page-title">Settings</h1>
          <p className="cohort-page-sub">{cohortLabel}</p>
        </div>
      </header>

      <section className="cohort-settings-card">
        <h2 className="cohort-settings-card-title">Edit cohort</h2>
        <p className="cohort-settings-card-body">
          Change the cohort&apos;s name, start date, seat cap, or
          late-join policy. End date stays derived from the
          programme&apos;s length ({programme.length_units} weeks).
        </p>
        {isCancelled ? (
          <p className="cohort-settings-disabled-note">
            Cancelled cohorts can&apos;t be edited from this page.
          </p>
        ) : (
          <EditCohortTrigger
            cohortId={cohort.cohort_id}
            programmeLengthUnits={programme.length_units}
            initial={initial}
          />
        )}
      </section>

      <section className="cohort-settings-card is-danger">
        <h2 className="cohort-settings-card-title">Cancel cohort</h2>
        <p className="cohort-settings-card-body">
          Marks the cohort cancelled. Enrolled students lose access;
          new enrolments are blocked. The cohort row stays in place
          and can be reinstated by an admin later — this is a soft
          cancellation, not a delete.
        </p>
        {isCancelled ? (
          <p className="cohort-settings-disabled-note">
            Already cancelled on{' '}
            {new Date(cohort.cancelled_at!).toLocaleDateString()}.
          </p>
        ) : (
          <CancelCohortConfirm
            cohortId={cohort.cohort_id}
            cohortLabel={cohortLabel}
          />
        )}
      </section>
    </div>
  );
}
