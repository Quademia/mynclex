// mynclex/lib/strategies/actions.ts
//
// Server actions for the tutor payment-plans surface (Slice 7b).
// Three actions: create, edit, set-active. RLS on
// nclex_programme_payment_strategies enforces parent-programme
// ownership on every write (WITH CHECK walks programme.tutor_id), so
// the actions don't re-implement the ownership test — a programme
// that isn't the caller's makes the INSERT/UPDATE affect zero rows.
//
// UPFRONT_FULL is NOT created/edited here — it's maintained by the
// programme price box (see lib/programmes/actions.ts syncUpfront).
// These actions only handle DEPOSIT_BALANCE + EQUAL_INSTALLMENTS.
//
// App-layer validation mirrors the DB CHECK constraints (added in
// 7a) so the tutor gets a friendly message instead of a raw
// constraint error.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { installmentSplit } from './format';
import type { EditableStrategyKind, StrategyFormValues } from './types';

export type StrategyActionResult = { ok: true } | { ok: false; error: string };

// Stable display order per kind (upfront first, then deposit, then
// installments). UNIQUE(programme_id, kind) caps each at one row, so
// this fully determines ordering without a manual reorder UI.
const SORT_BY_KIND: Record<EditableStrategyKind, number> = {
  DEPOSIT_BALANCE: 1,
  EQUAL_INSTALLMENTS: 2,
};

// Validates a form payload + returns the DB row fields to write, or
// an error string. Keeps the kind-specific shape rules in one place.
function buildRow(
  input: StrategyFormValues
):
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string } {
  const label = input.label?.trim() || null;
  const total = input.total_price_minor;

  if (!Number.isInteger(total) || total <= 0) {
    return { ok: false, error: 'Total price must be greater than zero.' };
  }

  if (input.kind === 'DEPOSIT_BALANCE') {
    const deposit = input.deposit_minor;
    const days = input.balance_due_days_after_enrolment;
    if (deposit == null || !Number.isInteger(deposit) || deposit <= 0) {
      return { ok: false, error: 'Deposit must be greater than zero.' };
    }
    if (deposit >= total) {
      return {
        ok: false,
        error: 'Deposit must be less than the total (there has to be a balance to pay).',
      };
    }
    if (days == null || !Number.isInteger(days) || days < 1) {
      return {
        ok: false,
        error: 'Balance due-window must be at least 1 day after enrolment.',
      };
    }
    return {
      ok: true,
      row: {
        kind: 'DEPOSIT_BALANCE',
        label,
        total_price_minor: total,
        initial_price_minor: deposit,
        installment_count: null,
        installment_interval_days: null,
        balance_due_days_after_enrolment: days,
        sort_order: SORT_BY_KIND.DEPOSIT_BALANCE,
      },
    };
  }

  // EQUAL_INSTALLMENTS
  const count = input.installment_count;
  const interval = input.installment_interval_days;
  if (count == null || !Number.isInteger(count) || count < 2 || count > 12) {
    return { ok: false, error: 'Number of installments must be between 2 and 12.' };
  }
  if (interval == null || !Number.isInteger(interval) || interval < 1) {
    return { ok: false, error: 'Interval between installments must be at least 1 day.' };
  }
  // First installment absorbs any rounding remainder.
  const { first } = installmentSplit(total, count);
  return {
    ok: true,
    row: {
      kind: 'EQUAL_INSTALLMENTS',
      label,
      total_price_minor: total,
      initial_price_minor: first,
      installment_count: count,
      installment_interval_days: interval,
      balance_due_days_after_enrolment: null,
      sort_order: SORT_BY_KIND.EQUAL_INSTALLMENTS,
    },
  };
}

export async function createStrategyAction(
  programmeId: string,
  input: StrategyFormValues
): Promise<StrategyActionResult> {
  const built = buildRow(input);
  if (!built.ok) return built;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await supabase
    .from('nclex_programme_payment_strategies')
    .insert({ programme_id: programmeId, is_active: true, ...built.row })
    .select('strategy_id')
    .single();

  if (error) {
    // UNIQUE(programme_id, kind) → a plan of this kind already exists.
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'You already have a plan of this type. Edit the existing one instead.',
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/tutor/programme/${programmeId}/payment-plans`);
  return { ok: true };
}

export async function editStrategyAction(
  strategyId: string,
  input: StrategyFormValues
): Promise<StrategyActionResult> {
  const built = buildRow(input);
  if (!built.ok) return built;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // kind + sort_order aren't editable on an existing row (kind is the
  // identity of the plan; changing it would clash with the UNIQUE
  // index). Strip them from the update.
  const mutable = { ...built.row };
  delete mutable.kind;
  delete mutable.sort_order;

  const { data, error } = await supabase
    .from('nclex_programme_payment_strategies')
    .update({ ...mutable, updated_at: new Date().toISOString() })
    .eq('strategy_id', strategyId)
    .select('programme_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not yours to edit.' };

  revalidatePath(`/tutor/programme/${data.programme_id}/payment-plans`);
  return { ok: true };
}

// Activate / deactivate a plan (hide-not-delete). Deactivating is how
// a tutor stops offering a plan — including upfront — without
// disrupting students already on it (they keep their frozen snapshot).
// Guard: a programme must keep at least one active plan, or there'd be
// nothing for a new student to buy.
export async function setStrategyActiveAction(
  strategyId: string,
  active: boolean
): Promise<StrategyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Resolve the plan's programme (RLS-scoped read).
  const { data: target } = await supabase
    .from('nclex_programme_payment_strategies')
    .select('programme_id, is_active')
    .eq('strategy_id', strategyId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Plan not found or not yours.' };
  if (target.is_active === active) return { ok: true }; // no-op

  if (!active) {
    // Block deactivating the last active plan.
    const { count } = await supabase
      .from('nclex_programme_payment_strategies')
      .select('strategy_id', { count: 'exact', head: true })
      .eq('programme_id', target.programme_id)
      .eq('is_active', true);
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: 'A programme needs at least one active payment plan. Add another before turning this one off.',
      };
    }
  }

  const { data, error } = await supabase
    .from('nclex_programme_payment_strategies')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('strategy_id', strategyId)
    .select('programme_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Plan not found or not yours.' };

  revalidatePath(`/tutor/programme/${data.programme_id}/payment-plans`);
  return { ok: true };
}
