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

// =====================================================================
// Slice 9.3f — Cohort curriculum checklist
// =====================================================================
//
// One row per (cohort, template_activity). Seeded by an AFTER INSERT
// trigger on nclex_cohorts (one row per current template activity);
// new template activities added AFTER cohort creation do NOT
// auto-seed — that's the one structural change that doesn't
// propagate. Everything else (reorder, move, delete) flows live
// from the template via the joined render.
//
// The per-activity window (all DATE, day-granularity):
//   `release_date` — when the activity opens. NOT NULL, trigger-
//     seeded at cohort creation.
//   `due_date`     — soft target ("do this by"). Nullable, tutor-
//     set. Does NOT gate access — the activity stays open.
//   `close_date`   — hard gate ("unopenable after"). Nullable,
//     tutor-set. (Slice 10.7.)
// Ordering release <= due <= close is validated in the server
// actions, not as a DB CHECK.
//
// `source` reserved for future COHORT_ONLY adds (activities added
// to a single cohort without a template entry). v1 only ever
// writes 'TEMPLATE'.

export type ChecklistItemSource = 'TEMPLATE' | 'COHORT_ONLY';

export type CohortChecklistItem = {
  checklist_item_id: string;
  cohort_id: string;
  template_activity_id: string;
  is_included: boolean;
  release_date: string;             // ISO YYYY-MM-DD
  due_date: string | null;          // ISO YYYY-MM-DD; null = not set
  close_date: string | null;        // ISO YYYY-MM-DD; null = not set
  source: ChecklistItemSource;
  created_at: string;
  updated_at: string;
};

// Projection joining the checklist row with the template activity
// it points to. The tutor view renders the full template shape;
// activity content is read live from `nclex_programme_activities`
// (content edits on the template propagate to every cohort).
import type {
  ProgrammeActivity,
  ProgrammeBlock,
  ProgrammeUnit,
} from '@/lib/curriculum/types';

// Three-state cohort-checklist model. The checklist is the LIVE
// programme template; a checklist row is only an *override*. So each
// activity is one of:
//   • unconfigured — no override row yet (renders with defaults)
//   • included     — override row, is_included = true
//   • excluded     — override row, is_included = false
export type ChecklistActivityState = 'unconfigured' | 'included' | 'excluded';

export type CohortChecklistActivityRow = {
  activity: ProgrammeActivity;       // live-read from template
  state: ChecklistActivityState;
  // Dates are the stored override values when configured, else the
  // computed week-pacing defaults (so the inputs always show something).
  release_date: string;
  due_date: string | null;
  close_date: string | null;
  // true when release_date is the computed default (no stored row /
  // release) — lets the UI show it faint vs. a solid configured date.
  release_is_default: boolean;
};

// Block + its in-block checklist rows. Mirrors the curriculum-tab
// unit-body shape but with checklist projections instead of raw
// activities.
export type CohortChecklistBlockEntry = {
  kind: 'block';
  block: ProgrammeBlock;
  rows: CohortChecklistActivityRow[];
};

export type CohortChecklistLooseEntry = {
  kind: 'loose';
  row: CohortChecklistActivityRow;
};

export type CohortChecklistBodyEntry =
  | CohortChecklistBlockEntry
  | CohortChecklistLooseEntry;

// One unit with its full in-cohort body (blocks + loose rows,
// interleaved in template ordinal order).
export type CohortChecklistUnit = {
  unit: ProgrammeUnit;
  body: CohortChecklistBodyEntry[];
};

// Top-level projection returned by getCohortChecklist(). Includes
// the cohort identity + programme status fields needed to render
// the per-row "Visible to students" derivation.
export type CohortChecklistTree = {
  cohort: {
    cohort_id: string;
    programme_id: string;
    start_date: string;
    name: string | null;
  };
  programme: {
    programme_id: string;
    title: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    unit_label: 'WEEK' | 'MODULE';
    delivery_mode: 'TUTOR_LED' | 'SELF_PACED';
  };
  units: CohortChecklistUnit[];
};
