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

  revalidatePath('/tutor/programmes');
  revalidatePath(`/tutor/programme/${data.programme_id}/cohorts`);
  revalidatePath(`/tutor/programme/${data.programme_id}/overview`);
  revalidatePath(`/tutor/cohort/${cohort_id}/overview`);
  revalidatePath(`/tutor/cohort/${cohort_id}/settings`);
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
  revalidatePath(`/tutor/cohort/${cohort_id}/overview`);
  revalidatePath(`/tutor/cohort/${cohort_id}/settings`);
  return { ok: true };
}

// =====================================================================
// Slice 9.3f / 10.7 — Cohort checklist mutations
// =====================================================================
//
// Four narrow actions over `nclex_cohort_checklist_items`:
//   • setChecklistItemIncludedAction    — toggles inclusion.
//   • setChecklistItemReleaseDateAction — updates release_date.
//   • setChecklistItemDueDateAction     — updates due_date (10.7).
//   • setChecklistItemCloseDateAction   — updates close_date (10.7).
//
// RLS on the table gates writes to rows whose cohort belongs to a
// programme the caller owns; the actions don't re-implement that
// check at the app layer (would just shadow the policy). A
// stale/mis-typed checklist_item_id surfaces as a generic
// "not found or not yours" through the maybeSingle() return shape.
//
// The three date actions each read the row's current window first,
// then validate release <= due <= close (where set) before the
// UPDATE — ordering is an app-layer rule, not a DB CHECK (a CHECK
// would block moving release_date past an existing due/close).

type ChecklistMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type SetChecklistItemIncludedResult = ChecklistMutationResult;
export type SetChecklistItemReleaseDateResult = ChecklistMutationResult;
export type SetChecklistItemDueDateResult = ChecklistMutationResult;
export type SetChecklistItemCloseDateResult = ChecklistMutationResult;

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

export async function setChecklistItemIncludedAction(
  checklist_item_id: string,
  included: boolean
): Promise<SetChecklistItemIncludedResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('nclex_cohort_checklist_items')
    .update({ is_included: included, updated_at: nowIso })
    .eq('checklist_item_id', checklist_item_id)
    .select('cohort_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Checklist item not found or not yours to edit.',
    };
  }

  revalidatePath(`/tutor/cohort/${data.cohort_id}/curriculum`);
  return { ok: true };
}

export async function setChecklistItemReleaseDateAction(
  checklist_item_id: string,
  release_date: string // YYYY-MM-DD (required — release is NOT NULL)
): Promise<SetChecklistItemReleaseDateResult> {
  if (!isDateString(release_date)) {
    return { ok: false, error: 'Release date must be a YYYY-MM-DD value.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Read the current window so a moved release_date can be checked
  // against any existing due/close date. RLS gates this read.
  const { data: current } = await supabase
    .from('nclex_cohort_checklist_items')
    .select('due_date, close_date')
    .eq('checklist_item_id', checklist_item_id)
    .maybeSingle();
  if (!current) {
    return {
      ok: false,
      error: 'Checklist item not found or not yours to edit.',
    };
  }

  const orderError = validateWindowOrdering(
    release_date,
    current.due_date,
    current.close_date
  );
  if (orderError) return { ok: false, error: orderError };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('nclex_cohort_checklist_items')
    .update({ release_date, updated_at: nowIso })
    .eq('checklist_item_id', checklist_item_id)
    .select('cohort_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Checklist item not found or not yours to edit.',
    };
  }

  revalidatePath(`/tutor/cohort/${data.cohort_id}/curriculum`);
  return { ok: true };
}

// due_date — soft target. Nullable: passing null clears it. Does
// NOT gate student access (that's close_date) — the student-side
// just surfaces "Due <date>".
export async function setChecklistItemDueDateAction(
  checklist_item_id: string,
  due_date: string | null // YYYY-MM-DD, or null to clear
): Promise<SetChecklistItemDueDateResult> {
  if (due_date != null && !isDateString(due_date)) {
    return { ok: false, error: 'Due date must be a YYYY-MM-DD value.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: current } = await supabase
    .from('nclex_cohort_checklist_items')
    .select('release_date, close_date')
    .eq('checklist_item_id', checklist_item_id)
    .maybeSingle();
  if (!current) {
    return {
      ok: false,
      error: 'Checklist item not found or not yours to edit.',
    };
  }

  const orderError = validateWindowOrdering(
    current.release_date,
    due_date,
    current.close_date
  );
  if (orderError) return { ok: false, error: orderError };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('nclex_cohort_checklist_items')
    .update({ due_date, updated_at: nowIso })
    .eq('checklist_item_id', checklist_item_id)
    .select('cohort_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Checklist item not found or not yours to edit.',
    };
  }

  revalidatePath(`/tutor/cohort/${data.cohort_id}/curriculum`);
  return { ok: true };
}

// close_date — hard gate. Nullable: passing null clears it. Once
// past, the student-side activity locks ("Closed <date>").
export async function setChecklistItemCloseDateAction(
  checklist_item_id: string,
  close_date: string | null // YYYY-MM-DD, or null to clear
): Promise<SetChecklistItemCloseDateResult> {
  if (close_date != null && !isDateString(close_date)) {
    return { ok: false, error: 'Close date must be a YYYY-MM-DD value.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: current } = await supabase
    .from('nclex_cohort_checklist_items')
    .select('release_date, due_date')
    .eq('checklist_item_id', checklist_item_id)
    .maybeSingle();
  if (!current) {
    return {
      ok: false,
      error: 'Checklist item not found or not yours to edit.',
    };
  }

  const orderError = validateWindowOrdering(
    current.release_date,
    current.due_date,
    close_date
  );
  if (orderError) return { ok: false, error: orderError };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('nclex_cohort_checklist_items')
    .update({ close_date, updated_at: nowIso })
    .eq('checklist_item_id', checklist_item_id)
    .select('cohort_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Checklist item not found or not yours to edit.',
    };
  }

  revalidatePath(`/tutor/cohort/${data.cohort_id}/curriculum`);
  return { ok: true };
}

// =====================================================================
// addNewTemplateActivitiesToCohortAction — the deferred 9.3f affordance
// =====================================================================
//
// A cohort is a snapshot of the template at creation time (the seed
// trigger runs once, AFTER INSERT ON nclex_cohorts). Activities added to
// the programme afterwards have no checklist row in existing cohorts, so
// they don't appear in the cohort checklist or to students. This action
// is the explicit "pull the new template activities into this cohort"
// path the 9.3f migration deferred: it inserts a checklist row for every
// template activity missing one, with the same default release-date
// pacing the seed trigger uses (start_date + (unit_index - 1) x 7 days),
// is_included = true, source = 'TEMPLATE'. The tutor then curates
// inclusion / release dates per row as normal.
//
// RLS: the tutor self_insert policy on nclex_cohort_checklist_items
// already permits this (ownership via cohort -> programme -> tutor).

export type AddNewTemplateActivitiesResult =
  | { ok: true; added: number }
  | { ok: false; error: string };

export async function addNewTemplateActivitiesToCohortAction(
  cohortId: string
): Promise<AddNewTemplateActivitiesResult> {
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
    .eq('nclex_programme_units.programme_id', cohort.programme_id);

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

  const startMs = new Date(`${cohort.start_date}T00:00:00Z`).getTime();
  const DAY_MS = 86_400_000;
  const rows = missing.map((a) => {
    const u = Array.isArray(a.nclex_programme_units)
      ? a.nclex_programme_units[0]
      : a.nclex_programme_units;
    const unitIndex = u?.unit_index ?? 1;
    const releaseDate = new Date(startMs + (unitIndex - 1) * 7 * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return {
      cohort_id: cohortId,
      template_activity_id: a.activity_id,
      release_date: releaseDate,
    };
  });

  const { error } = await supabase
    .from('nclex_cohort_checklist_items')
    .upsert(rows, {
      onConflict: 'cohort_id,template_activity_id',
      ignoreDuplicates: true,
    });
  if (error) {
    return { ok: false, error: 'Could not add the new activities.' };
  }

  revalidatePath(`/tutor/cohort/${cohortId}/curriculum`);
  return { ok: true, added: rows.length };
}
