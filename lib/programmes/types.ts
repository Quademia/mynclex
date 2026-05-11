// mynclex/lib/programmes/types.ts
//
// Shape mirrors nclex_programmes after slice 9.2a (programme/cohort
// split + curriculum architecture rework). Cohort-y fields
// (start_date, end_date, cohort_size, cancelled_at) and the
// CANCELLED status moved to nclex_cohorts; programme gains
// delivery_mode + unit_label; length_weeks renamed length_units.

export type ProgrammeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type DeliveryMode = 'TUTOR_LED' | 'SELF_PACED';
export type UnitLabel = 'WEEK' | 'MODULE';

export type Programme = {
  programme_id: string;
  tutor_id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
  price_minor_ghs: number;
  price_minor_usd: number;
  show_price_publicly: boolean;
  status: ProgrammeStatus;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// Projection for the My Programmes list. Includes display fields
// (title, status, label) AND all editable fields so the per-card
// Edit modal populates without a second round trip. cohort_count
// is a rollup from nclex_cohorts (added in this slice for the
// card's schedule-line replacement; real Cohorts tab lands in 9.2c).
export type ProgrammeListRow = Pick<
  Programme,
  | 'programme_id'
  | 'title'
  | 'tagline'
  | 'description'
  | 'delivery_mode'
  | 'unit_label'
  | 'length_units'
  | 'price_minor_ghs'
  | 'price_minor_usd'
  | 'show_price_publicly'
  | 'status'
  | 'updated_at'
> & {
  cohort_count: number;
};

// The form-payload shape — the editable subset of a programme.
// Used by ProgrammeFormModal in edit mode (initial values) and
// as the input to createProgrammeAction / editProgrammeAction.
// Date / cohort_size moved to the cohort modal (9.2b).
export type ProgrammeFormValues = Pick<
  Programme,
  | 'title'
  | 'tagline'
  | 'description'
  | 'delivery_mode'
  | 'unit_label'
  | 'length_units'
  | 'price_minor_ghs'
  | 'price_minor_usd'
  | 'show_price_publicly'
>;
