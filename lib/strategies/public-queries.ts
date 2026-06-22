// mynclex/lib/strategies/public-queries.ts
//
// Public read of a programme's active payment plans, for the checkout
// plan picker (Slice 7c). Reads the nclex_public_payment_strategies view
// (active plans of PUBLISHED programmes), which is granted to anon — so it
// works for pay-first guests, not just logged-in students.
//
// Cohort override (2026-06-22): a cohort can carry its OWN plans. The
// EFFECTIVE plans for a checkout = the cohort's rows if it has any (custom),
// else the programme defaults (cohort_id IS NULL). The presence of cohort
// rows IS the "custom pricing" state. Pass no cohortId (or null) for the
// programme default — the discovery listing keeps showing that.

import { createClient } from '@/lib/supabase/server';
import type { PublicPaymentPlan } from './types';

const PLAN_COLS = `strategy_id, programme_id, cohort_id, kind, label,
  total_price_minor, initial_price_minor,
  installment_count, installment_interval_days,
  balance_due_days_after_enrolment, sort_order`;

export async function getPublicPaymentPlans(
  programmeId: string,
  cohortId?: string | null
): Promise<PublicPaymentPlan[]> {
  const supabase = await createClient();

  // Custom cohort? Read its own rows first; only fall back to the programme
  // default when the cohort has none.
  if (cohortId) {
    const { data: cohortRows } = await supabase
      .from('nclex_public_payment_strategies')
      .select(PLAN_COLS)
      .eq('programme_id', programmeId)
      .eq('cohort_id', cohortId)
      .order('sort_order', { ascending: true });
    if (cohortRows && cohortRows.length > 0) {
      return cohortRows as PublicPaymentPlan[];
    }
  }

  const { data, error } = await supabase
    .from('nclex_public_payment_strategies')
    .select(PLAN_COLS)
    .eq('programme_id', programmeId)
    .is('cohort_id', null)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];
  return data as PublicPaymentPlan[];
}

// Checkout reads ALL of a programme's active public plans in one go and
// partitions them: the programme defaults, plus a per-cohort map for any
// cohort running CUSTOM pricing. The checkout client picks the cohort
// client-side, so it switches between these without a round-trip:
// byCohort[selectedCohort] ?? defaultPlans (the view is active-only, so a
// cohort appears in byCohort only when it has active custom plans).
export async function getCheckoutPlansByScope(programmeId: string): Promise<{
  defaultPlans: PublicPaymentPlan[];
  byCohort: Record<string, PublicPaymentPlan[]>;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_public_payment_strategies')
    .select(PLAN_COLS)
    .eq('programme_id', programmeId)
    .order('sort_order', { ascending: true });

  const rows = (data ?? []) as PublicPaymentPlan[];
  const defaultPlans = rows.filter((r) => r.cohort_id == null);
  const byCohort: Record<string, PublicPaymentPlan[]> = {};
  for (const r of rows) {
    if (r.cohort_id != null) (byCohort[r.cohort_id] ??= []).push(r);
  }
  return { defaultPlans, byCohort };
}
