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
export type Currency = 'GHS' | 'USD';
export type PaymentCollectionMode = 'OFF_PLATFORM' | 'ON_PLATFORM';

export type Programme = {
  programme_id: string;
  tutor_id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
  // Slice 3a — single tutor-chosen currency replaces dual GHS/USD.
  // The price *amount* lives on nclex_programme_payment_strategies
  // (one row per plan; UPFRONT_FULL is canonical full price). Slice
  // 7e retired the legacy price_minor column from this table.
  price_currency: Currency;
  show_price_publicly: boolean;
  payment_collection_mode: PaymentCollectionMode;
  access_window_days: number | null;
  status: ProgrammeStatus;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// Projection for the My Programmes list. Includes display fields
// (title, status, label) AND all editable fields so the per-card
// Edit modal populates without a second round trip. cohort_count
// is a rollup from nclex_cohorts (added in 9.2a for the card's
// schedule-line replacement). upfront_total_minor is the canonical
// full price, pulled from the programme's UPFRONT_FULL plan row
// (slice 7e — replaces the retired price_minor column); used to
// pre-fill the programme form's Price field on edit. NULL when no
// upfront plan exists yet (only happens transiently mid-create).
export type ProgrammeListRow = Pick<
  Programme,
  | 'programme_id'
  | 'title'
  | 'tagline'
  | 'description'
  | 'delivery_mode'
  | 'unit_label'
  | 'length_units'
  | 'price_currency'
  | 'show_price_publicly'
  | 'payment_collection_mode'
  | 'access_window_days'
  | 'status'
  | 'updated_at'
> & {
  cohort_count: number;
  upfront_total_minor: number | null;
};

// The form-payload shape — the editable subset of a programme.
// Used by ProgrammeFormModal in edit mode (initial values) and
// as the input to createProgrammeAction / editProgrammeAction.
// Date / cohort_size moved to the cohort modal (9.2b). price_minor
// removed in 7e — the form still has a Price field, but the action
// writes it to the UPFRONT_FULL plan, not a programme column.
export type ProgrammeFormValues = Pick<
  Programme,
  | 'title'
  | 'tagline'
  | 'description'
  | 'delivery_mode'
  | 'unit_label'
  | 'length_units'
  | 'price_currency'
  | 'show_price_publicly'
  | 'payment_collection_mode'
  | 'access_window_days'
> & {
  // Full-price authoring — mirrored to the UPFRONT_FULL plan by the action.
  upfront_total_minor: number;
};
