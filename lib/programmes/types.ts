// mynclex/lib/programmes/types.ts
//
// Shape mirrors the nclex_programmes columns (slice 9.1a migration).
// Schema is provisional — expect revisions during build.

export type ProgrammeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'CANCELLED';

export type Programme = {
  programme_id: string;
  tutor_id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  length_weeks: number;
  start_date: string; // ISO YYYY-MM-DD
  end_date: string;   // ISO YYYY-MM-DD
  cohort_size: number | null;
  price_minor_ghs: number;
  price_minor_usd: number;
  show_price_publicly: boolean;
  status: ProgrammeStatus;
  published_at: string | null;
  archived_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

// Projection for the My Programmes list. Includes display fields
// (title, status, schedule, students-cap) AND all editable fields
// (description, prices, public toggle) so the per-card Edit modal
// can populate without a second round trip.
export type ProgrammeListRow = Pick<
  Programme,
  | 'programme_id'
  | 'title'
  | 'tagline'
  | 'description'
  | 'length_weeks'
  | 'start_date'
  | 'end_date'
  | 'cohort_size'
  | 'price_minor_ghs'
  | 'price_minor_usd'
  | 'show_price_publicly'
  | 'status'
  | 'updated_at'
>;

// The form-payload shape — the editable subset of a programme.
// Used by ProgrammeFormModal in edit mode (initial values) and as
// the input to createProgrammeAction / editProgrammeAction.
export type ProgrammeFormValues = Pick<
  Programme,
  | 'title'
  | 'tagline'
  | 'description'
  | 'length_weeks'
  | 'start_date'
  | 'end_date'
  | 'cohort_size'
  | 'price_minor_ghs'
  | 'price_minor_usd'
  | 'show_price_publicly'
>;
