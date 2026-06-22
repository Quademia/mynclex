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
import type { PaymentPlansContext, PaymentStrategy } from './types';

export async function getPaymentPlansContext(
  programmeId: string
): Promise<PaymentPlansContext | null> {
  const supabase = await createClient();

  const { data: prog, error } = await supabase
    .from('nclex_programmes')
    .select(
      'programme_id, title, price_currency, payment_collection_mode, status'
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
    },
    strategies: (strategies ?? []) as PaymentStrategy[],
  };
}
