// mynclex/lib/cohorts/types.ts
//
// Shape mirrors nclex_cohorts (slice 9.2a migration).
// Status is NOT stored — derived via cohortStatus() in ./format.

export type CohortStatus =
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'ENDED'
  | 'CANCELLED';

export type Cohort = {
  cohort_id: string;
  programme_id: string;
  name: string | null;            // NULL → UI auto-generates from dates
  start_date: string;             // ISO YYYY-MM-DD
  end_date: string;               // ISO YYYY-MM-DD
  cohort_size: number | null;     // NULL → no cap
  allow_late_join: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

// Projection used by the Cohorts tab list. Same shape as Cohort
// for now — kept as a named type so the list query has somewhere
// to grow if we later add enrolled-count or other rollups.
export type CohortListRow = Cohort;

// Editable subset — the cohort form modal's input. Used by
// createCohortAction (and, in 9.2c, the edit-cohort flow).
export type CohortFormValues = Pick<
  Cohort,
  | 'name'
  | 'start_date'
  | 'end_date'
  | 'cohort_size'
  | 'allow_late_join'
>;
