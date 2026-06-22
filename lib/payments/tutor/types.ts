// mynclex/lib/payments/tutor/types.ts
//
// Shapes for the global tutor Payments page (/tutor/payments) — the
// "what money came in?" ledger across ALL of a tutor's programmes.
// Built from the CD "Tutor Payments v1.1" prototype; design settled in
// payments-and-enrolment.md → "Settled 2026-06-12 — tutor money
// surfaces: who shows what (IA)".
//
// The page shows MONEY THAT ACTUALLY ARRIVED only — programme-fee
// payments (PROGRAMME_INITIAL / PROGRAMME_INSTALLMENT). Bank /
// readiness / bank-opt-in purposes are QAcademy's money and never
// appear here. "Owed / upcoming" is not a row — it lives in the
// per-student history drawer (the 🕑 in the Purpose cell).

import type { Currency } from '@/lib/payments/types';

// PAYSTACK → online (into the platform); OFF_PLATFORM → tutor recorded
// a cash/transfer by hand.
export type TutorPaymentChannel = 'online' | 'offplatform';

// Real nclex_payments.status collapses to two display states here:
// received = PAID / ACTIVATED / SETUP_REQUIRED; refunded = REFUNDED.
// INIT / FAILED are excluded upstream (abandoned / failed attempts).
export type TutorPaymentStatus = 'received' | 'refunded';

export type TutorPaymentRow = {
  paymentId: string;
  // Payer. name falls back to the email's local part when the user_id
  // is missing (a pay-first row not yet attached to a profile).
  name: string;
  email: string;
  programmeId: string;
  programmeName: string;
  // Resolved via the enrolment (cohort_id lives only on the INITIAL
  // payment row, so installments get their cohort through the join).
  // null → self-paced (no cohort).
  cohortId: string | null;
  cohortLabel: string | null;
  purpose: 'initial' | 'installment';
  // installment position (2..N) and the plan's total — for "2 of 4".
  installmentIndex: number | null;
  installmentTotal: number | null;
  channel: TutorPaymentChannel;
  amountMinor: number;
  currency: Currency;
  status: TutorPaymentStatus;
  // Effective payment date (paid_at → activated_at → created_at).
  dateIso: string;
  // The enrolment this payment belongs to + whether a frozen plan
  // exists behind it. hasHistory drives the Purpose-cell clock: present
  // only when there's a schedule to open (Slice 2).
  enrolmentId: string | null;
  hasHistory: boolean;
};

// A selectable cohort for the Cohort filter — the tutor's own
// non-cancelled cohorts, INCLUDING ones with no payments yet (so the
// tutor can drill in and confirm "nothing collected here"). Carries the
// parent programme for scoping + disambiguating the "All programmes"
// label.
export type TutorCohortOption = {
  cohortId: string;
  label: string;
  programmeId: string;
  programmeName: string;
};

export type TutorPaymentsData = {
  rows: TutorPaymentRow[];
  cohorts: TutorCohortOption[];
};
