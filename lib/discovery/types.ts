// mynclex/lib/discovery/types.ts
//
// Public-facing programme discovery. Reads the nclex_public_programmes
// view (the single public read path — see db/rls.sql "PUBLIC VIEWS").
// Reuses the programme enums from lib/programmes (same product — the
// no-cross-import rule is about sibling products, not internal modules).

import type {
  Currency,
  DeliveryMode,
  PaymentCollectionMode,
  UnitLabel,
} from '@/lib/programmes/types';

// One row of nclex_public_programmes. The view exposes only public
// fields; tutor identity is name + avatar, never email / phone / role.
export type PublicProgramme = {
  programme_id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
  price_currency: Currency;
  price_minor: number;
  show_price_publicly: boolean;
  payment_collection_mode: PaymentCollectionMode;
  access_window_days: number | null;
  published_at: string | null;
  tutor_name: string | null;
  tutor_avatar_url: string | null;
  next_cohort_start: string | null;
  open_cohort_count: number;
};

// One row of nclex_public_units — a published curriculum unit.
export type PublicUnit = {
  programme_id: string;
  unit_index: number;
  title: string | null;
  description: string | null;
};

// One row of nclex_public_cohorts — a non-cancelled cohort.
export type PublicCohort = {
  cohort_id: string;
  programme_id: string;
  name: string | null;
  start_date: string;
  end_date: string;
  allow_late_join: boolean;
};
