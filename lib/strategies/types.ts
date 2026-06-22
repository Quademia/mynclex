// mynclex/lib/strategies/types.ts
//
// Tutor-side payment-plan config (Payments Slice 7b). Mirrors
// nclex_programme_payment_strategies. Distinct from lib/payments/,
// which is the checkout/charge engine — this folder is purely the
// tutor's "what plans do I offer" surface.
//
// UPFRONT_FULL rows exist in the table (one per programme, kept in
// step with nclex_programmes.price_minor) but the tutor doesn't
// create/edit them here — the full price is edited via the programme
// price box. The add/edit modal only handles the two real plans.

import type {
  Currency,
  PaymentCollectionMode,
  ProgrammeStatus,
} from '@/lib/programmes/types';

export type StrategyKind =
  | 'UPFRONT_FULL'
  | 'DEPOSIT_BALANCE'
  | 'EQUAL_INSTALLMENTS';

// The two kinds the tutor manages on this surface.
export type EditableStrategyKind = 'DEPOSIT_BALANCE' | 'EQUAL_INSTALLMENTS';

export type PaymentStrategy = {
  strategy_id: string;
  programme_id: string;
  kind: StrategyKind;
  label: string | null;
  total_price_minor: number;
  initial_price_minor: number;
  installment_count: number | null;
  installment_interval_days: number | null;
  balance_due_days_after_enrolment: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// Form payload from the add/edit modal. The action turns this into
// the DB row shape (computing initial_price_minor + nulling the
// fields the kind doesn't use).
export type StrategyFormValues = {
  kind: EditableStrategyKind;
  label: string | null;
  total_price_minor: number;
  // DEPOSIT_BALANCE only — deposit becomes initial_price_minor.
  deposit_minor: number | null;
  balance_due_days_after_enrolment: number | null;
  // EQUAL_INSTALLMENTS only.
  installment_count: number | null;
  installment_interval_days: number | null;
};

// Public projection (Slice 7c) — what the checkout plan picker reads from
// the nclex_public_payment_strategies view. Active plans only; no is_active
// or audit columns (the view already filters to active + published).
export type PublicPaymentPlan = {
  strategy_id: string;
  programme_id: string;
  cohort_id: string | null; // per-cohort override; NULL = programme default
  kind: StrategyKind;
  label: string | null;
  total_price_minor: number;
  initial_price_minor: number;
  installment_count: number | null;
  installment_interval_days: number | null;
  balance_due_days_after_enrolment: number | null;
  sort_order: number;
};

// The plan frozen onto an enrolment at checkout (Slice 7c writes this into
// nclex_enrolments.strategy_snapshot_json). A later tutor edit to the plan
// can't rewrite an existing student's schedule because this copy is what the
// schedule engine reads. Mirrors the strategy row's rhythm fields plus the
// freeze timestamp; no is_active / sort_order (irrelevant once chosen).
export type FrozenStrategySnapshot = {
  strategy_id: string;
  kind: StrategyKind;
  label: string | null;
  total_price_minor: number;
  initial_price_minor: number;
  installment_count: number | null;
  installment_interval_days: number | null;
  balance_due_days_after_enrolment: number | null;
  frozen_at: string;
};

// What the payment-plans page loads: the programme's pricing context
// plus all its plans (active + inactive, in sort order). Slice 7e —
// the programme's canonical full price is now whatever the UPFRONT_FULL
// row in strategies says (or 0 if it doesn't exist yet); the deprecated
// programme.price_minor column is gone.
export type PaymentPlansContext = {
  programme: {
    programme_id: string;
    title: string;
    price_currency: Currency;
    payment_collection_mode: PaymentCollectionMode;
    status: ProgrammeStatus;
  };
  strategies: PaymentStrategy[];
};
