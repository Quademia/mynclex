// mynclex/lib/strategies/public-queries.ts
//
// Public read of a programme's active payment plans, for the checkout
// plan picker (Slice 7c). Reads the nclex_public_payment_strategies view
// (active plans of PUBLISHED programmes), which is granted to anon — so it
// works for pay-first guests, not just logged-in students.

import { createClient } from '@/lib/supabase/server';
import type { PublicPaymentPlan } from './types';

export async function getPublicPaymentPlans(
  programmeId: string
): Promise<PublicPaymentPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_public_payment_strategies')
    .select(
      `strategy_id, programme_id, kind, label,
       total_price_minor, initial_price_minor,
       installment_count, installment_interval_days,
       balance_due_days_after_enrolment, sort_order`
    )
    .eq('programme_id', programmeId)
    .order('sort_order', { ascending: true });

  if (error || !data) return [];
  return data as PublicPaymentPlan[];
}
