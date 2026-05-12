// mynclex/lib/cohorts/cohort-list.tsx
//
// Cohort list + card for the Cohorts tab (slice 9.2b). Static
// presentation in v1 — the cohort detail subtree (Overview /
// Students / Sessions / Announcements / Settings) lands with
// 9.2c and that's when the cards become clickable.

import type { CohortListRow } from './types';
import {
  cohortStatus,
  cohortStatusPillClass,
  formatCohortName,
  formatCohortSeats,
  formatCohortStatusLabel,
  formatDateRange,
} from './format';

export function CohortList({ cohorts }: { cohorts: CohortListRow[] }) {
  return (
    <div className="cohort-list">
      {cohorts.map((cohort) => {
        const status = cohortStatus(cohort);
        const display = formatCohortName(cohort);
        const range = formatDateRange(cohort.start_date, cohort.end_date);
        // If the tutor set a custom name, show the auto-range as a
        // secondary line so the dates are still surfaced; if there's
        // no custom name display already IS the range, so no second
        // line.
        const hasCustomName = display !== range;

        return (
          <article key={cohort.cohort_id} className="cohort-card">
            <header className="cohort-card-head">
              <h3 className="cohort-card-title">{display}</h3>
              <span className={`cohort-pill ${cohortStatusPillClass(status)}`}>
                {formatCohortStatusLabel(status)}
              </span>
            </header>

            {hasCustomName && (
              <p className="cohort-card-range">{range}</p>
            )}

            <footer className="cohort-card-foot">
              <span className="cohort-card-meta">
                {formatCohortSeats(cohort.cohort_size)}
              </span>
              {cohort.allow_late_join && (
                <span className="cohort-card-late-join">Late join on</span>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
