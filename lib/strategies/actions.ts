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
  input: StrategyFormValues,
  // Per-cohort override (2026-06-22): when set, the plan belongs to this
  // cohort's custom set rather than the programme defaults.
  cohortId?: string | null
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
    .insert({
      programme_id: programmeId,
      cohort_id: cohortId ?? null,
      is_active: true,
      ...built.row,
    })
    .select('strategy_id')
    .single();

  if (error) {
    // Partial UNIQUE on (programme_id|cohort_id, kind) → a plan of this kind
    // already exists in this scope.
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'You already have a plan of this type. Edit the existing one instead.',
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(
    cohortId
      ? `/tutor/programme/${programmeId}/cohorts`
      : `/tutor/programme/${programmeId}/payment-plans`
  );
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

  // Resolve the plan's programme + scope (RLS-scoped read).
  const { data: target } = await supabase
    .from('nclex_programme_payment_strategies')
    .select('programme_id, cohort_id, is_active')
    .eq('strategy_id', strategyId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Plan not found or not yours.' };
  if (target.is_active === active) return { ok: true }; // no-op

  if (!active) {
    // Block deactivating the last active plan IN THE SAME SCOPE — a
    // programme's defaults (cohort_id IS NULL) or a single cohort's set.
    let countQuery = supabase
      .from('nclex_programme_payment_strategies')
      .select('strategy_id', { count: 'exact', head: true })
      .eq('programme_id', target.programme_id)
      .eq('is_active', true);
    countQuery = target.cohort_id
      ? countQuery.eq('cohort_id', target.cohort_id)
      : countQuery.is('cohort_id', null);
    const { count } = await countQuery;
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

// ─────────────────────────────────────────────────────────────────────
// Per-cohort custom pricing (2026-06-22). A cohort is "custom" when it has
// ACTIVE plan rows of its own; otherwise it inherits the programme
// defaults. We never DELETE plan rows (enrolments + payments reference
// strategy_id ON DELETE RESTRICT), so revert = deactivate, and re-enable
// reuses any existing rows. Ownership is RLS-enforced (writes WITH CHECK
// walk programme.tutor_id; a cohort that isn't the caller's resolves to no
// programme and the action errors out).
// ─────────────────────────────────────────────────────────────────────

async function cohortProgrammeId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cohortId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  return (data?.programme_id as string | undefined) ?? null;
}

// Turn ON custom pricing for a cohort. If the cohort already has rows (from
// a prior custom stint), reactivate them (reuse); otherwise clone the
// programme's CURRENT active plans into the cohort's own set.
export async function enableCohortCustomPricingAction(
  cohortId: string
): Promise<StrategyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const programmeId = await cohortProgrammeId(supabase, cohortId);
  if (!programmeId) return { ok: false, error: 'Cohort not found or not yours.' };

  const { data: existing } = await supabase
    .from('nclex_programme_payment_strategies')
    .select('strategy_id, is_active')
    .eq('cohort_id', cohortId);

  if (existing && existing.length > 0) {
    // Already custom? (≥1 active) → no-op. Else reactivate the prior set.
    if (existing.some((r) => r.is_active)) return { ok: true };
    const { error } = await supabase
      .from('nclex_programme_payment_strategies')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('cohort_id', cohortId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/tutor/programme/${programmeId}/cohorts`);
    return { ok: true };
  }

  // Fresh: clone the programme's active default plans.
  const { data: defaults } = await supabase
    .from('nclex_programme_payment_strategies')
    .select(
      `kind, label, total_price_minor, initial_price_minor,
       installment_count, installment_interval_days,
       balance_due_days_after_enrolment, sort_order`
    )
    .eq('programme_id', programmeId)
    .is('cohort_id', null)
    .eq('is_active', true);

  if (!defaults || defaults.length === 0) {
    return { ok: false, error: 'This programme has no active plans to copy yet.' };
  }

  const rows = defaults.map((d) => ({
    ...d,
    programme_id: programmeId,
    cohort_id: cohortId,
    is_active: true,
  }));
  const { error } = await supabase
    .from('nclex_programme_payment_strategies')
    .insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tutor/programme/${programmeId}/cohorts`);
  return { ok: true };
}

// Revert a cohort to programme pricing — deactivate all its rows (kept, not
// deleted, so enrolled students' references survive and a later re-enable
// can reuse them).
export async function disableCohortCustomPricingAction(
  cohortId: string
): Promise<StrategyActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const programmeId = await cohortProgrammeId(supabase, cohortId);
  if (!programmeId) return { ok: false, error: 'Cohort not found or not yours.' };

  const { error } = await supabase
    .from('nclex_programme_payment_strategies')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('cohort_id', cohortId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tutor/programme/${programmeId}/cohorts`);
  return { ok: true };
}

// Set a custom cohort's full (upfront) price — the cohort equivalent of the
// programme price box. Upserts the cohort's UPFRONT_FULL row.
export async function setCohortUpfrontAction(
  cohortId: string,
  priceMinor: number
): Promise<StrategyActionResult> {
  if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
    return { ok: false, error: 'Full price must be greater than zero.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const programmeId = await cohortProgrammeId(supabase, cohortId);
  if (!programmeId) return { ok: false, error: 'Cohort not found or not yours.' };

  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('nclex_programme_payment_strategies')
    .update({
      total_price_minor: priceMinor,
      initial_price_minor: priceMinor,
      is_active: true,
      updated_at: nowIso,
    })
    .eq('cohort_id', cohortId)
    .eq('kind', 'UPFRONT_FULL')
    .select('strategy_id')
    .maybeSingle();

  if (!data) {
    const { error } = await supabase
      .from('nclex_programme_payment_strategies')
      .insert({
        programme_id: programmeId,
        cohort_id: cohortId,
        kind: 'UPFRONT_FULL',
        label: null,
        total_price_minor: priceMinor,
        initial_price_minor: priceMinor,
        is_active: true,
        sort_order: 0,
      });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/tutor/programme/${programmeId}/cohorts`);
  return { ok: true };
}
