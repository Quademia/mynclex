// mynclex/lib/strategies/queries.ts
//
// Server-side fetch for the tutor payment-plans surface (Slice 7b).
// RLS scopes both reads to programmes owned by the signed-in tutor
// (nclex_programme_payment_strategies → parent-programme ownership;
// nclex_programmes → tutor_id). A programme the tutor doesn't own
// returns null → the page 404s.

import { createClient } from '@/lib/supabase/server';
import type {
  Currency,
  PaymentCollectionMode,
  ProgrammeStatus,
} from '@/lib/programmes/types';
import type {
  CohortPaymentPlansContext,
  PaymentPlansContext,
  PaymentStrategy,
} from './types';

const STRATEGY_COLS = `strategy_id, programme_id, kind, label,
  total_price_minor, initial_price_minor,
  installment_count, installment_interval_days,
  balance_due_days_after_enrolment,
  is_active, sort_order, created_at, updated_at`;

export async function getPaymentPlansContext(
  programmeId: string
): Promise<PaymentPlansContext | null> {
  const supabase = await createClient();

  const { data: prog, error } = await supabase
    .from('nclex_programmes')
    .select(
      'programme_id, title, price_currency, payment_collection_mode, status, payment_gates_access'
    )
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (error || !prog) return null;

  // Programme-default plans only (cohort_id IS NULL). A cohort's own
  // override plans (cohort_id set) live behind the cohort Payment-plans
  // pane — they must not leak into the programme tab.
  const { data: strategies } = await supabase
    .from('nclex_programme_payment_strategies')
    .select(
      `strategy_id, programme_id, kind, label,
       total_price_minor, initial_price_minor,
       installment_count, installment_interval_days,
       balance_due_days_after_enrolment,
       is_active, sort_order, created_at, updated_at`
    )
    .eq('programme_id', programmeId)
    .is('cohort_id', null)
    .order('sort_order', { ascending: true });

  return {
    programme: {
      programme_id: prog.programme_id as string,
      title: prog.title as string,
      price_currency: prog.price_currency as Currency,
      payment_collection_mode:
        prog.payment_collection_mode as PaymentCollectionMode,
      status: prog.status as ProgrammeStatus,
      payment_gates_access: prog.payment_gates_access as boolean,
    },
    strategies: (strategies ?? []) as PaymentStrategy[],
  };
}

// At-a-glance "is this cohort on custom pricing?" — ≥1 active plan row of
// its own. Used for the cohort-header badge. RLS owner-scoped.
export async function getCohortHasCustomPricing(
  cohortId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('nclex_programme_payment_strategies')
    .select('strategy_id', { count: 'exact', head: true })
    .eq('cohort_id', cohortId)
    .eq('is_active', true);
  return (count ?? 0) > 0;
}

// The cohort Payment-plans pane (per-cohort override, 2026-06-22). Returns
// the cohort's parent-programme pricing context + BOTH plan sets: the
// programme defaults (cohort_id IS NULL — the read-only preview / clone
// source) and the cohort's own rows (active + inactive, for the editor).
// RLS scopes every read to the owning tutor; a cohort the caller doesn't
// own returns null (the pane 404s / hides). `isCustom` = the cohort has at
// least one ACTIVE plan row of its own.
export async function getCohortPaymentPlansContext(
  cohortId: string
): Promise<CohortPaymentPlansContext | null> {
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id,
       nclex_programmes!inner(programme_id, price_currency, payment_collection_mode, status)`
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!cohort) return null;

  const prog = (
    cohort as typeof cohort & {
      nclex_programmes:
        | {
            programme_id: string;
            price_currency: Currency;
            payment_collection_mode: PaymentCollectionMode;
            status: ProgrammeStatus;
          }
        | {
            programme_id: string;
            price_currency: Currency;
            payment_collection_mode: PaymentCollectionMode;
            status: ProgrammeStatus;
          }[]
        | null;
    }
  ).nclex_programmes;
  const programme = Array.isArray(prog) ? prog[0] : prog;
  if (!programme) return null;

  const [{ data: progStrats }, { data: cohortStrats }] = await Promise.all([
    supabase
      .from('nclex_programme_payment_strategies')
      .select(STRATEGY_COLS)
      .eq('programme_id', programme.programme_id)
      .is('cohort_id', null)
      .order('sort_order', { ascending: true }),
    supabase
      .from('nclex_programme_payment_strategies')
      .select(STRATEGY_COLS)
      .eq('cohort_id', cohortId)
      .order('sort_order', { ascending: true }),
  ]);

  const cohortStrategies = (cohortStrats ?? []) as PaymentStrategy[];
  const upfront = cohortStrategies.find((s) => s.kind === 'UPFRONT_FULL');

  return {
    cohortId,
    programmeId: programme.programme_id,
    currency: programme.price_currency,
    collectionMode: programme.payment_collection_mode,
    programmeStatus: programme.status,
    isCustom: cohortStrategies.some((s) => s.is_active),
    upfrontMinor: upfront ? upfront.total_price_minor : null,
    programmeStrategies: (progStrats ?? []) as PaymentStrategy[],
    cohortStrategies,
  };
}
