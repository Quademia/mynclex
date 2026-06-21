// mynclex/lib/cohorts/cohort-settings-pane.tsx
//
// Settings pane of the in-page cohort run detail — Edit + Cancel.
// Body moved from the old /tutor/cohort/[id]/settings page in the
// cohort-workspace fold; the old page header dropped (the run header
// + active tab carry the context).

import type { CohortShellContext } from './queries';
import { formatCohortName } from './format';
import { EditCohortTrigger } from './edit-cohort-trigger';
import { CancelCohortConfirm } from './cancel-cohort-confirm';

export function CohortSettingsPane({
  cohort,
  programme,
}: {
  cohort: CohortShellContext['cohort'];
  programme: CohortShellContext['programme'];
}) {
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
    <>
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
    </>
  );
}
