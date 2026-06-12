// mynclex/lib/cohorts/actions.ts
//
// Server actions for cohort surfaces (slices 9.2b + 9.2c).
// Three actions: create, edit, cancel. RLS enforces parent-
// programme ownership on INSERT/UPDATE; for edit + cancel, the
// row's existing programme_id is the ownership anchor (the action
// never lets the caller reassign programme_id).

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { CohortFormValues } from './types';

export type CreateCohortInput = CohortFormValues;

export type CreateCohortResult =
  | { ok: true; cohort_id: string }
  | { ok: false; error: string };

function validate(input: CreateCohortInput): string | null {
  if (!input.start_date || !input.end_date) {
    return 'Start and end dates are required.';
  }
  if (input.end_date < input.start_date) {
    return 'End date cannot be before start date.';
  }
  if (
    input.cohort_size != null &&
    (!Number.isInteger(input.cohort_size) || input.cohort_size < 1)
  ) {
    return 'Cohort size must be a positive number or blank.';
  }
  return null;
}

export async function createCohortAction(
  programmeId: string,
  input: CreateCohortInput
): Promise<CreateCohortResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const trimmedName = input.name?.trim() || null;

  const { data, error } = await supabase
    .from('nclex_cohorts')
    .insert({
      programme_id: programmeId,
      name: trimmedName,
      start_date: input.start_date,
      end_date: input.end_date,
      cohort_size: input.cohort_size,
      allow_late_join: input.allow_late_join,
    })
    .select('cohort_id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to create cohort.' };
  }

  // Refresh the surfaces that care about cohort counts.
  revalidatePath('/tutor/programmes');
  revalidatePath(`/tutor/programme/${programmeId}/cohorts`);
  revalidatePath(`/tutor/programme/${programmeId}/overview`);
  return { ok: true, cohort_id: data.cohort_id };
}

// =====================================================================
// editCohortAction (slice 9.2c)
// =====================================================================

export type EditCohortInput = CohortFormValues;
export type EditCohortResult = { ok: true } | { ok: false; error: string };

export async function editCohortAction(
  cohort_id: string,
  input: EditCohortInput
): Promise<EditCohortResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // RLS on UPDATE filters via parent-programme ownership; a tutor
  // editing a cohort whose programme isn't theirs gets 0 rows updated
  // (no error from PostgREST, just no row). Surface that as a generic
  // failure so a malicious client can't probe for IDs. The action
  // deliberately does NOT touch programme_id — caller can't reparent.
  const { data, error } = await supabase
    .from('nclex_cohorts')
    .update({
      name: input.name?.trim() || null,
      start_date: input.start_date,
      end_date: input.end_date,
      cohort_size: input.cohort_size,
      allow_late_join: input.allow_late_join,
      updated_at: new Date().toISOString(),
    })
    .eq('cohort_id', cohort_id)
    .select('cohort_id, programme_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Cohort not found or not yours to edit.' };

  // The Cohorts page carries both the list and the in-page run detail
  // (cohort-workspace fold) — one revalidate covers every ?cohort= view.
  revalidatePath('/tutor/programmes');
  revalidatePath(`/tutor/programme/${data.programme_id}/cohorts`);
  revalidatePath(`/tutor/programme/${data.programme_id}/overview`);
  return { ok: true };
}

// =====================================================================
// cancelCohortAction (slice 9.2c)
// =====================================================================
// Soft cancellation — sets cancelled_at; the row stays in place.
// Reversible later by clearing the timestamp (admin path; no v1 UI).

export type CancelCohortResult = { ok: true } | { ok: false; error: string };

export async function cancelCohortAction(
  cohort_id: string
): Promise<CancelCohortResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_cohorts')
    .update({
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('cohort_id', cohort_id)
    .is('cancelled_at', null) // no-op if already cancelled
    .select('cohort_id, programme_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Cohort not found, already cancelled, or not yours to cancel.',
    };
  }

  revalidatePath('/tutor/programmes');
  revalidatePath(`/tutor/programme/${data.programme_id}/cohorts`);
  return { ok: true };
}

// =====================================================================
// Cohort checklist mutations (three-state live model — see the
// "Three-state checklist writes" block below for the per-action set)
// =====================================================================
//
// RLS on the table gates writes to rows whose cohort belongs to a
// programme the caller owns; the actions don't re-implement that
// check at the app layer (would just shadow the policy).
//
// Date edits validate release <= due <= close (where set) against the
// effective values before writing — ordering is an app-layer rule, not
// a DB CHECK (a CHECK would block moving release_date past an existing
// due/close).

type ChecklistMutationResult =
  | { ok: true }
  | { ok: false; error: string };

// Shape guard for a date input.
function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Validates the per-activity window ordering: release <= due <=
// close, skipping any leg whose date isn't set. Returns an error
// string for the tutor, or null when the window is coherent.
function validateWindowOrdering(
  release: string,
  due: string | null,
  close: string | null
): string | null {
  if (due != null && due < release) {
    return 'Due date cannot be before the release date.';
  }
  if (close != null && close < release) {
    return 'Close date cannot be before the release date.';
  }
  if (due != null && close != null && close < due) {
    return 'Close date cannot be before the due date.';
  }
  return null;
}

// =====================================================================
// Three-state checklist writes (cohort-checklist live model)
// =====================================================================
//
// The cohort checklist is no longer a snapshot: it is the live programme
// template, where each activity is Unconfigured (no row) / Included
// (row, is_included=true) / Excluded (row, is_included=false). A row is
// written on the FIRST explicit tutor action (include/exclude or a date)
// via these (cohort_id, activity_id)-keyed upserts. release_date is NOT
// NULL, so any row gets stamped with the default week-pacing release
// (start_date + (unit_index - 1) x 7d) unless the tutor sets one. Window
// ordering (release <= due <= close) is validated against the effective
// values. RLS gates writes via the tutor self_insert / self_update
// policies.

const DAY_MS = 86_400_000;

// Default release date for an activity in a cohort (week-N pacing).
// Null when the cohort or activity can't be resolved (not yours).
async function defaultReleaseDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cohortId: string,
  activityId: string
): Promise<string | null> {
  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('start_date')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!cohort) return null;
  const { data: act } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, nclex_programme_units!inner(unit_index)')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!act) return null;
  const u = (act as {
    nclex_programme_units: { unit_index: number } | { unit_index: number }[];
  }).nclex_programme_units;
  const unitIndex = (Array.isArray(u) ? u[0]?.unit_index : u?.unit_index) ?? 1;
  const startMs = new Date(
    `${(cohort as { start_date: string }).start_date}T00:00:00Z`
  ).getTime();
  return new Date(startMs + (unitIndex - 1) * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

type ChecklistChange = Partial<{
  is_included: boolean;
  release_date: string;
  due_date: string | null;
  close_date: string | null;
}>;

// Ensure-and-apply: create the override row (with defaults) if absent,
// else update it - applying `change` and validating window ordering
// against the effective values.
async function applyChecklistChange(
  cohortId: string,
  activityId: string,
  change: ChecklistChange
): Promise<ChecklistMutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: existing } = await supabase
    .from('nclex_cohort_checklist_items')
    .select(
      'checklist_item_id, is_included, release_date, due_date, close_date'
    )
    .eq('cohort_id', cohortId)
    .eq('template_activity_id', activityId)
    .maybeSingle();

  const baseRelease =
    (existing as { release_date: string } | null)?.release_date ??
    (await defaultReleaseDate(supabase, cohortId, activityId));
  if (baseRelease == null) {
    return { ok: false, error: 'Cohort or activity not found, or not yours.' };
  }

  const eff = {
    release_date: change.release_date ?? baseRelease,
    due_date:
      change.due_date !== undefined
        ? change.due_date
        : (existing as { due_date: string | null } | null)?.due_date ?? null,
    close_date:
      change.close_date !== undefined
        ? change.close_date
        : (existing as { close_date: string | null } | null)?.close_date ??
          null,
    is_included:
      change.is_included ??
      (existing as { is_included: boolean } | null)?.is_included ??
      true,
  };

  const orderError = validateWindowOrdering(
    eff.release_date,
    eff.due_date,
    eff.close_date
  );
  if (orderError) return { ok: false, error: orderError };

  const nowIso = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from('nclex_cohort_checklist_items')
      .update({ ...change, updated_at: nowIso })
      .eq(
        'checklist_item_id',
        (existing as { checklist_item_id: string }).checklist_item_id
      );
    if (error) return { ok: false, error: 'Could not save the change.' };
  } else {
    const { error } = await supabase
      .from('nclex_cohort_checklist_items')
      .insert({
        cohort_id: cohortId,
        template_activity_id: activityId,
        is_included: eff.is_included,
        release_date: eff.release_date,
        due_date: eff.due_date,
        close_date: eff.close_date,
      });
    if (error) return { ok: false, error: 'Could not save the change.' };
  }

  // The checklist renders inside the programme Cohorts page
  // (?cohort=&tab=curriculum). The action only holds the cohort id,
  // so resolve the parent programme for the revalidate (cheap
  // RLS-scoped single-row read).
  const { data: parent } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (parent) {
    revalidatePath(
      `/tutor/programme/${(parent as { programme_id: string }).programme_id}/cohorts`
    );
  }
  return { ok: true };
}

export async function setActivityIncludedAction(
  cohortId: string,
  activityId: string,
  included: boolean
): Promise<ChecklistMutationResult> {
  return applyChecklistChange(cohortId, activityId, { is_included: included });
}

export async function setActivityReleaseDateAction(
  cohortId: string,
  activityId: string,
  release_date: string
): Promise<ChecklistMutationResult> {
  if (!isDateString(release_date)) {
    return { ok: false, error: 'Release date must be a YYYY-MM-DD value.' };
  }
  return applyChecklistChange(cohortId, activityId, { release_date });
}

export async function setActivityDueDateAction(
  cohortId: string,
  activityId: string,
  due_date: string | null
): Promise<ChecklistMutationResult> {
  if (due_date != null && !isDateString(due_date)) {
    return { ok: false, error: 'Due date must be a YYYY-MM-DD value.' };
  }
  return applyChecklistChange(cohortId, activityId, { due_date });
}

export async function setActivityCloseDateAction(
  cohortId: string,
  activityId: string,
  close_date: string | null
): Promise<ChecklistMutationResult> {
  if (close_date != null && !isDateString(close_date)) {
    return { ok: false, error: 'Close date must be a YYYY-MM-DD value.' };
  }
  return applyChecklistChange(cohortId, activityId, { close_date });
}

// Include EVERY currently-unconfigured template activity in this cohort
// in one click (the "N unconfigured -> Include all" affordance). Inserts
// is_included=true rows with default release dates for activities with
// no row yet; existing rows are untouched.
export type IncludeAllResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

export async function includeAllUnconfiguredActivitiesAction(
  cohortId: string
): Promise<IncludeAllResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id, programme_id, start_date')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!cohort) return { ok: false, error: 'Cohort not found or not yours.' };

  const { data: existing } = await supabase
    .from('nclex_cohort_checklist_items')
    .select('template_activity_id')
    .eq('cohort_id', cohortId);
  const have = new Set(
    (existing ?? []).map(
      (r) => (r as { template_activity_id: string }).template_activity_id
    )
  );

  const { data: acts } = await supabase
    .from('nclex_programme_activities')
    .select(
      'activity_id, nclex_programme_units!inner(programme_id, unit_index)'
    )
    .eq(
      'nclex_programme_units.programme_id',
      (cohort as { programme_id: string }).programme_id
    );

  type ActRow = {
    activity_id: string;
    nclex_programme_units:
      | { unit_index: number }
      | { unit_index: number }[]
      | null;
  };
  const missing = ((acts ?? []) as ActRow[]).filter(
    (a) => !have.has(a.activity_id)
  );
  if (missing.length === 0) return { ok: true, added: 0 };

  const startMs = new Date(
    `${(cohort as { start_date: string }).start_date}T00:00:00Z`
  ).getTime();
  const rows = missing.map((a) => {
    const u = Array.isArray(a.nclex_programme_units)
      ? a.nclex_programme_units[0]
      : a.nclex_programme_units;
    const unitIndex = u?.unit_index ?? 1;
    return {
      cohort_id: cohortId,
      template_activity_id: a.activity_id,
      is_included: true,
      release_date: new Date(startMs + (unitIndex - 1) * 7 * DAY_MS)
        .toISOString()
        .slice(0, 10),
    };
  });

  const { error } = await supabase
    .from('nclex_cohort_checklist_items')
    .upsert(rows, {
      onConflict: 'cohort_id,template_activity_id',
      ignoreDuplicates: true,
    });
  if (error) return { ok: false, error: 'Could not include the activities.' };

  revalidatePath(
    `/tutor/programme/${(cohort as { programme_id: string }).programme_id}/cohorts`
  );
  return { ok: true, added: rows.length };
}
