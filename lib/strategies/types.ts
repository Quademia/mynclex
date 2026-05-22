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

// What the payment-plans page loads: the programme's pricing context
// plus all its plans (active + inactive, in sort order).
export type PaymentPlansContext = {
  programme: {
    programme_id: string;
    title: string;
    price_currency: Currency;
    price_minor: number;
    payment_collection_mode: PaymentCollectionMode;
    status: ProgrammeStatus;
  };
  strategies: PaymentStrategy[];
};
