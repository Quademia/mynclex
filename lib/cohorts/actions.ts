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
import {
  buildPayload,
  validatePdfAssetForSave,
  validateQuizForActivity,
} from '@/lib/curriculum/activity-payload';
import { UNIT_BODY_ORDINAL_STEP } from '@/lib/curriculum/unit-body';
import { validateScheduleInput } from './live-session-schedule';
import type { LiveSessionScheduleInput } from './live-session-schedule';
import type { ActivityFormValues } from '@/lib/curriculum/types';
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
    )
    // Only TEMPLATE activities are "unconfigured" and bulk-includable.
    // Cohort-only adds (cohort_id set) are born with their own included
    // checklist row, so "Include all" must never touch them.
    .is('cohort_id', null);

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

// =====================================================================
// Cohort-specific activities — Slice 1 (loose, self-contained types)
// =====================================================================
//
// A cohort-only activity is an ordinary nclex_programme_activities row
// tagged with cohort_id = this cohort (so it belongs to one run and never
// propagates), PLUS a COHORT_ONLY checklist row carrying its dates +
// inclusion. The two rows are created together. It reuses the shared
// activity editor + payload builder + every render path (Option A); the
// only differences from a template activity are the cohort_id tag and
// that its publish state (the editor's Status tick) is its single
// student-visibility switch. See
// docs/product-plan/cohort-specific-activities.md.
//
// RLS gates both writes: the activity via unit -> programme -> tutor, the
// checklist row via cohort -> programme -> tutor. The actions add the
// scope checks app code is responsible for (the unit belongs to the
// cohort's programme; a delete only touches THIS cohort's own rows).

type CohortActionsSupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Bottom-of-week ordinal in THIS cohort's view (Slice 4 — one spaced
// number line). Template + cohort-only items share the same scale, so the
// bottom is just the max ordinal across the unit's template items AND this
// cohort's own cohort-only ones, + a full STEP. Scoped so another cohort's
// content can't shift where this one's lands.
async function nextCohortUnitBodyOrdinal(
  supabase: CohortActionsSupabaseClient,
  unitId: string,
  cohortId: string
): Promise<number> {
  const scope = `cohort_id.is.null,cohort_id.eq.${cohortId}`;
  const [b, a] = await Promise.all([
    supabase
      .from('nclex_programme_blocks')
      .select('ordinal')
      .eq('unit_id', unitId)
      .or(scope)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('nclex_programme_activities')
      .select('ordinal')
      .eq('unit_id', unitId)
      .is('block_id', null)
      .or(scope)
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const blockMax = (b.data as { ordinal: number } | null)?.ordinal ?? 0;
  const looseMax = (a.data as { ordinal: number } | null)?.ordinal ?? 0;
  return Math.max(blockMax, looseMax) + UNIT_BODY_ORDINAL_STEP;
}

// Next ordinal inside a single block — its children share one in-block
// position line. A cohort-only block holds only cohort-only activities,
// so no extra cohort filter is needed here.
async function nextCohortBlockOrdinal(
  supabase: CohortActionsSupabaseClient,
  blockId: string
): Promise<number> {
  const { data } = await supabase
    .from('nclex_programme_activities')
    .select('ordinal')
    .eq('block_id', blockId)
    .order('ordinal', { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { ordinal: number } | null)?.ordinal ?? 0) + 1;
}

export type CreateCohortActivityResult =
  | { ok: true; activity_id: string }
  | { ok: false; error: string };

export async function createCohortOnlyActivityAction(
  cohortId: string,
  unitId: string,
  values: ActivityFormValues,
  // Slice 2 — when set, create the activity INSIDE this cohort-only block
  // (it must belong to THIS cohort + this unit). null = loose under the
  // unit (the Slice 1 path).
  blockId: string | null = null
): Promise<CreateCohortActivityResult> {
  const title = values.title.trim();
  if (title.length === 0) return { ok: false, error: 'Title is required.' };

  // Slice 1 = the 3 self-contained types; Slice 3a adds the 2 quiz types.
  // Library Note + Shelf use their own attach flow (Slice 3b), not this
  // action. ONLINE_LIVE_SESSION is allowed: a cohort-only live session is
  // just a cohort-only MARKER (title + typical duration via buildPayload,
  // no schedule) — same as a template marker. The tutor schedules it
  // per-cohort on the Sessions tab (the "+ Add session" flow is the
  // alternative entry that also schedules in one step).
  if (
    values.type !== 'TEXT' &&
    values.type !== 'PDF' &&
    values.type !== 'EXTERNAL_LINK' &&
    values.type !== 'ONLINE_LIVE_SESSION' &&
    values.type !== 'MOCK' &&
    values.type !== 'PRACTICE_QUIZ'
  ) {
    return {
      ok: false,
      error: 'That activity type can’t be added as a cohort-only activity yet.',
    };
  }

  const built = buildPayload(values);
  if (!built.ok) return built;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // PDF asset ownership/readiness (defence in depth; RLS gates the row).
  if (values.type === 'PDF') {
    const v = await validatePdfAssetForSave(supabase, values.pdf_asset_id);
    if (!v.ok) return v;
  }

  // Quiz-activity: if a quiz is linked, verify it's the tutor's own quiz
  // of the matching kind (published when the activity itself is being
  // published). A cohort-only quiz activity is a COHORT-scoped use of the
  // quiz, so — unlike the template create path — it is NOT mirrored into
  // nclex_programme_quizzes (the programme-wide "used in" junction). The
  // quiz-delete guard scans nclex_programme_activities directly, so this
  // usage still protects the quiz from deletion without that mirror.
  if (
    (values.type === 'MOCK' || values.type === 'PRACTICE_QUIZ') &&
    values.quiz_id
  ) {
    const v = await validateQuizForActivity(
      supabase,
      values.quiz_id,
      values.type,
      values.is_published
    );
    if (!v.ok) return v;
  }

  // Resolve the cohort (RLS scopes to the tutor's own).
  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id, programme_id, start_date')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!cohort) return { ok: false, error: 'Cohort not found or not yours.' };

  // Resolve the host unit + its index, and confirm it belongs to the
  // cohort's programme (a cohort-only activity always lands inside a
  // TEMPLATE unit of the same programme — never an extra unit, never
  // another programme's unit). RLS already scopes the unit to the tutor.
  const { data: unit } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id, unit_index')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (!unit) return { ok: false, error: 'Unit not found or not yours.' };
  if (
    (unit as { programme_id: string }).programme_id !==
    (cohort as { programme_id: string }).programme_id
  ) {
    return { ok: false, error: 'That unit belongs to a different programme.' };
  }

  // When adding into a cohort-only block, validate it's THIS cohort's own
  // block in THIS unit (the nesting rule: a cohort-only activity may only
  // go loose or inside a cohort-only block — never a template block), and
  // position it within that block. Otherwise it's loose and lands at the
  // bottom of the week.
  let nextOrdinal: number;
  if (blockId !== null) {
    const { data: block } = await supabase
      .from('nclex_programme_blocks')
      .select('block_id, unit_id, cohort_id')
      .eq('block_id', blockId)
      .maybeSingle();
    if (
      !block ||
      (block as { unit_id: string }).unit_id !== unitId ||
      (block as { cohort_id: string | null }).cohort_id !== cohortId
    ) {
      return {
        ok: false,
        error: 'That block isn’t a cohort-only block in this unit.',
      };
    }
    nextOrdinal = await nextCohortBlockOrdinal(supabase, blockId);
  } else {
    nextOrdinal = await nextCohortUnitBodyOrdinal(supabase, unitId, cohortId);
  }

  // Insert the activity row: cohort-only (cohort_id set); loose (block_id
  // null) or inside the cohort-only block. is_published comes straight
  // from the editor's Status tick — we never force it.
  const { data: activity, error: actErr } = await supabase
    .from('nclex_programme_activities')
    .insert({
      unit_id: unitId,
      block_id: blockId,
      cohort_id: cohortId,
      ordinal: nextOrdinal,
      type: values.type,
      title,
      description: values.description.trim() || null,
      note: values.note.trim() || null,
      payload: built.payload,
      is_published: values.is_published,
    })
    .select('activity_id')
    .single();
  if (actErr || !activity) {
    return {
      ok: false,
      error: actErr?.message ?? 'Failed to add the activity.',
    };
  }

  // The COHORT_ONLY checklist row carries the dates + inclusion. Born
  // included with the week-pacing default release (cohort start +
  // (unit_index - 1) × 7d), matching template seeding. If this insert
  // fails, roll back the activity — a cohort-only activity with no
  // checklist row would never reach the delivery path (which reads
  // through the checklist).
  const startMs = new Date(
    `${(cohort as { start_date: string }).start_date}T00:00:00Z`
  ).getTime();
  const releaseDate = new Date(
    startMs + ((unit as { unit_index: number }).unit_index - 1) * 7 * DAY_MS
  )
    .toISOString()
    .slice(0, 10);

  const { error: itemErr } = await supabase
    .from('nclex_cohort_checklist_items')
    .insert({
      cohort_id: cohortId,
      template_activity_id: activity.activity_id,
      is_included: true,
      release_date: releaseDate,
      source: 'COHORT_ONLY',
    });
  if (itemErr) {
    await supabase
      .from('nclex_programme_activities')
      .delete()
      .eq('activity_id', activity.activity_id);
    return {
      ok: false,
      error: 'Could not add the activity. Please try again.',
    };
  }

  revalidatePath(
    `/tutor/programme/${(cohort as { programme_id: string }).programme_id}/cohorts`
  );
  return { ok: true, activity_id: activity.activity_id };
}

export type CreateCohortLiveSessionInput = {
  title: string;
  typicalDurationMinutes: number | null;
  isPublished: boolean;
  // The per-run schedule to create alongside the marker (the "+ Add
  // session" flow fills it in the same step). null = create unscheduled.
  schedule: LiveSessionScheduleInput | null;
};

// Slice 2 — the "+ Add session" one-off (Option B). ATOMIC: creates a
// COHORT-ONLY live-session MARKER and (optionally) its planner schedule row
// in one step, validating the schedule FIRST so a bad field never leaves an
// orphan unscheduled marker behind (the bug from the original two-call
// build). The planner owns live-session creation — tutors never pick "live
// session" in the cohort-only activity picker. Born loose in the chosen
// week, included, with the editor's Live/Draft choice. See
// docs/product-plan/live-session-planner.md.
export async function createCohortOnlyLiveSessionAction(
  cohortId: string,
  unitId: string,
  input: CreateCohortLiveSessionInput
): Promise<CreateCohortActivityResult> {
  const title = input.title.trim();
  if (title.length === 0) return { ok: false, error: 'Title is required.' };
  if (
    input.typicalDurationMinutes != null &&
    (!Number.isInteger(input.typicalDurationMinutes) ||
      input.typicalDurationMinutes <= 0)
  ) {
    return {
      ok: false,
      error: 'Typical duration must be a positive number, or blank.',
    };
  }

  // Validate the schedule BEFORE touching the DB — if a field is bad, we
  // return the error and nothing is created (no orphan, no data loss; the
  // client keeps the form open with everything intact).
  let scheduleRow: ReturnType<typeof validateScheduleInput> | null = null;
  if (input.schedule) {
    const v = validateScheduleInput(input.schedule);
    if (!v.ok) return { ok: false, error: v.error };
    scheduleRow = v;
  }

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

  const { data: unit } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id, unit_index')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (!unit) return { ok: false, error: 'Week not found or not yours.' };
  if (
    (unit as { programme_id: string }).programme_id !==
    (cohort as { programme_id: string }).programme_id
  ) {
    return { ok: false, error: 'That week belongs to a different programme.' };
  }

  const nextOrdinal = await nextCohortUnitBodyOrdinal(supabase, unitId, cohortId);
  const payload =
    input.typicalDurationMinutes != null
      ? { typical_duration_minutes: input.typicalDurationMinutes }
      : {};

  const { data: activity, error: actErr } = await supabase
    .from('nclex_programme_activities')
    .insert({
      unit_id: unitId,
      block_id: null,
      cohort_id: cohortId,
      ordinal: nextOrdinal,
      type: 'ONLINE_LIVE_SESSION',
      title,
      description: null,
      note: null,
      payload,
      is_published: input.isPublished,
    })
    .select('activity_id')
    .single();
  if (actErr || !activity) {
    return {
      ok: false,
      error: actErr?.message ?? 'Failed to add the session.',
    };
  }

  // Roll the marker back if anything downstream fails — its FK cascades
  // wipe the checklist row + any planner row, leaving no orphan.
  const rollback = async () => {
    await supabase
      .from('nclex_programme_activities')
      .delete()
      .eq('activity_id', activity.activity_id);
  };

  const startMs = new Date(
    `${(cohort as { start_date: string }).start_date}T00:00:00Z`
  ).getTime();
  const releaseDate = new Date(
    startMs + ((unit as { unit_index: number }).unit_index - 1) * 7 * DAY_MS
  )
    .toISOString()
    .slice(0, 10);

  const { error: itemErr } = await supabase
    .from('nclex_cohort_checklist_items')
    .insert({
      cohort_id: cohortId,
      template_activity_id: activity.activity_id,
      is_included: true,
      release_date: releaseDate,
      source: 'COHORT_ONLY',
    });
  if (itemErr) {
    await rollback();
    return {
      ok: false,
      error: 'Could not add the session. Please try again.',
    };
  }

  // The schedule (already validated above) lands in the same step.
  if (scheduleRow && scheduleRow.ok) {
    const { error: schedErr } = await supabase
      .from('nclex_cohort_live_sessions')
      .insert({
        cohort_id: cohortId,
        marker_activity_id: activity.activity_id,
        ...scheduleRow.row,
      });
    if (schedErr) {
      await rollback();
      return {
        ok: false,
        error: 'Could not save the session schedule. Please try again.',
      };
    }
  }

  revalidatePath(
    `/tutor/programme/${(cohort as { programme_id: string }).programme_id}/cohorts`
  );
  return { ok: true, activity_id: activity.activity_id };
}

export type DeleteCohortActivityResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteCohortOnlyActivityAction(
  cohortId: string,
  activityId: string
): Promise<DeleteCohortActivityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Delete ONLY a row that is genuinely this cohort's own cohort-only
  // activity — the cohort_id match refuses both shared template rows
  // (cohort_id NULL) and any other cohort's. The COHORT_ONLY checklist
  // row cascades via its template_activity_id FK (ON DELETE CASCADE).
  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .delete()
    .eq('activity_id', activityId)
    .eq('cohort_id', cohortId)
    .select('activity_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Activity not found, or not a cohort-only activity you can delete.',
    };
  }

  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (cohort) {
    revalidatePath(
      `/tutor/programme/${(cohort as { programme_id: string }).programme_id}/cohorts`
    );
  }
  return { ok: true };
}

// =====================================================================
// Cohort-specific activities — Slice 2 (cohort-only blocks)
// =====================================================================
//
// A cohort-only block is one nclex_programme_blocks row tagged with
// cohort_id = this cohort, sitting under a TEMPLATE unit. It holds only
// cohort-only activities (created via createCohortOnlyActivityAction with
// a blockId). Editing the block reuses the template editBlockAction (it
// updates by block_id under RLS, and the modal's router.refresh() repaints
// the cohort page). Create + delete are cohort-scoped here. Blocks land at
// the bottom of the week for now — placement/reorder is Slice 4.

export type CreateCohortBlockResult =
  | { ok: true; block_id: string }
  | { ok: false; error: string };

export async function createCohortOnlyBlockAction(
  cohortId: string,
  unitId: string,
  title: string
): Promise<CreateCohortBlockResult> {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Block title is required.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id, programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (!cohort) return { ok: false, error: 'Cohort not found or not yours.' };

  const { data: unit } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (!unit) return { ok: false, error: 'Unit not found or not yours.' };
  if (
    (unit as { programme_id: string }).programme_id !==
    (cohort as { programme_id: string }).programme_id
  ) {
    return { ok: false, error: 'That unit belongs to a different programme.' };
  }

  const nextOrdinal = await nextCohortUnitBodyOrdinal(supabase, unitId, cohortId);

  // Born Draft (is_published default false in the DB), like the inline
  // template block create — the tutor fills it, then flips it Live.
  const { data: block, error } = await supabase
    .from('nclex_programme_blocks')
    .insert({
      unit_id: unitId,
      cohort_id: cohortId,
      ordinal: nextOrdinal,
      title: trimmed,
    })
    .select('block_id')
    .single();
  if (error || !block) {
    return { ok: false, error: error?.message ?? 'Failed to add the block.' };
  }

  revalidatePath(
    `/tutor/programme/${(cohort as { programme_id: string }).programme_id}/cohorts`
  );
  return { ok: true, block_id: block.block_id };
}

export type DeleteCohortBlockResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteCohortOnlyBlockAction(
  cohortId: string,
  blockId: string
): Promise<DeleteCohortBlockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Delete ONLY this cohort's own cohort-only block (the cohort_id match
  // refuses template blocks + other cohorts'). Child activities cascade
  // via the block FK, and each child's COHORT_ONLY checklist row cascades
  // via its template_activity_id FK — one DELETE cleans the whole subtree.
  const { data, error } = await supabase
    .from('nclex_programme_blocks')
    .delete()
    .eq('block_id', blockId)
    .eq('cohort_id', cohortId)
    .select('block_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Block not found, or not a cohort-only block you can delete.',
    };
  }

  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (cohort) {
    revalidatePath(
      `/tutor/programme/${(cohort as { programme_id: string }).programme_id}/cohorts`
    );
  }
  return { ok: true };
}

// =====================================================================
// Cohort-specific activities — Slice 4 (reorder, spaced position numbers)
// =====================================================================
//
// Reorder a COHORT-ONLY item (loose activity or block) within its week by
// rewriting ONLY its own number to the midpoint of the gap it lands in,
// on the one spaced number line — template rows are never rewritten, so
// other cohorts are unaffected. An in-block cohort-only activity reorders
// by a plain swap with its sibling (a cohort-only block holds only
// cohort-only activities).

type UnitBodyItem = {
  kind: 'block' | 'loose';
  id: string;
  ordinal: number;
};

// Load the unit body (template + THIS cohort's cohort-only blocks/loose
// activities) as one list sorted by position. Template + cohort-only share
// one spaced number line (Slice 4), so the stored ordinal IS the position.
async function loadCohortUnitBody(
  supabase: CohortActionsSupabaseClient,
  unitId: string,
  cohortId: string
): Promise<UnitBodyItem[]> {
  const scope = `cohort_id.is.null,cohort_id.eq.${cohortId}`;
  const [blocksRes, looseRes] = await Promise.all([
    supabase
      .from('nclex_programme_blocks')
      .select('block_id, ordinal')
      .eq('unit_id', unitId)
      .or(scope),
    supabase
      .from('nclex_programme_activities')
      .select('activity_id, ordinal')
      .eq('unit_id', unitId)
      .is('block_id', null)
      .or(scope),
  ]);
  const items: UnitBodyItem[] = [];
  for (const b of (blocksRes.data ?? []) as Array<{
    block_id: string;
    ordinal: number;
  }>) {
    items.push({ kind: 'block', id: b.block_id, ordinal: b.ordinal });
  }
  for (const a of (looseRes.data ?? []) as Array<{
    activity_id: string;
    ordinal: number;
  }>) {
    items.push({ kind: 'loose', id: a.activity_id, ordinal: a.ordinal });
  }
  items.sort((x, y) => x.ordinal - y.ordinal);
  return items;
}

// New number for a cohort-only item moving one step up/down in the merged
// list — the midpoint of the gap it lands in. Distinguishes a legit
// EDGE (already at the top/bottom — a silent no-op) from the rare NOGAP
// (the gap has no whole number left — surfaced to the tutor; reachable
// only after ~20 inserts into the exact same spot, so essentially never
// via the one-step arrows).
type MoveResult =
  | { kind: 'ok'; ordinal: number }
  | { kind: 'edge' }
  | { kind: 'nogap' };

function newOrdinalForMove(
  items: UnitBodyItem[],
  kind: 'block' | 'loose',
  movingId: string,
  direction: 'up' | 'down'
): MoveResult {
  const i = items.findIndex((it) => it.kind === kind && it.id === movingId);
  if (i === -1) return { kind: 'edge' };
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= items.length) return { kind: 'edge' };

  let lower: number;
  let upper: number;
  if (direction === 'up') {
    // Land ABOVE item j → between items[j-1] and items[j].
    lower = j - 1 >= 0 ? items[j - 1].ordinal : 0;
    upper = items[j].ordinal;
  } else {
    // Land BELOW item j → between items[j] and items[j+1].
    lower = items[j].ordinal;
    upper =
      j + 1 < items.length
        ? items[j + 1].ordinal
        : lower + 2 * UNIT_BODY_ORDINAL_STEP;
  }

  if (lower <= 0) {
    const top = Math.floor(upper / 2);
    return top >= 1 && top < upper
      ? { kind: 'ok', ordinal: top }
      : { kind: 'nogap' };
  }
  const mid = Math.floor((lower + upper) / 2);
  return mid > lower && mid < upper
    ? { kind: 'ok', ordinal: mid }
    : { kind: 'nogap' };
}

const NOGAP_ERROR =
  'Couldn’t move it there — the items here are packed too tightly. Try moving a neighbour first.';

async function revalidateCohortPath(
  supabase: CohortActionsSupabaseClient,
  cohortId: string
): Promise<void> {
  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (cohort) {
    revalidatePath(
      `/tutor/programme/${(cohort as { programme_id: string }).programme_id}/cohorts`
    );
  }
}

export type ReorderCohortResult = { ok: true } | { ok: false; error: string };

export async function reorderCohortOnlyActivityAction(
  cohortId: string,
  activityId: string,
  direction: 'up' | 'down'
): Promise<ReorderCohortResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Must be THIS cohort's own cohort-only activity.
  const { data: self } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, unit_id, block_id, ordinal, cohort_id')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!self || (self as { cohort_id: string | null }).cohort_id !== cohortId) {
    return {
      ok: false,
      error: 'Activity not found, or not a cohort-only activity you can move.',
    };
  }
  const blockId = (self as { block_id: string | null }).block_id;
  const unitId = (self as { unit_id: string }).unit_id;
  const ordinal = (self as { ordinal: number }).ordinal;

  if (blockId !== null) {
    // In-block: swap with the adjacent sibling (all in-block children of a
    // cohort-only block are cohort-only, one scale → a plain swap).
    const neighbourQ = supabase
      .from('nclex_programme_activities')
      .select('activity_id, ordinal')
      .eq('block_id', blockId);
    const { data: neighbour } =
      direction === 'up'
        ? await neighbourQ
            .lt('ordinal', ordinal)
            .order('ordinal', { ascending: false })
            .limit(1)
            .maybeSingle()
        : await neighbourQ
            .gt('ordinal', ordinal)
            .order('ordinal', { ascending: true })
            .limit(1)
            .maybeSingle();
    if (!neighbour) return { ok: true }; // edge — no-op
    const now = new Date().toISOString();
    await supabase
      .from('nclex_programme_activities')
      .update({
        ordinal: (neighbour as { ordinal: number }).ordinal,
        updated_at: now,
      })
      .eq('activity_id', activityId);
    await supabase
      .from('nclex_programme_activities')
      .update({ ordinal, updated_at: now })
      .eq('activity_id', (neighbour as { activity_id: string }).activity_id);
  } else {
    // Loose: midpoint move in the unit-body merged list.
    const items = await loadCohortUnitBody(supabase, unitId, cohortId);
    const move = newOrdinalForMove(items, 'loose', activityId, direction);
    if (move.kind === 'edge') return { ok: true }; // already at the edge
    if (move.kind === 'nogap') return { ok: false, error: NOGAP_ERROR };
    await supabase
      .from('nclex_programme_activities')
      .update({ ordinal: move.ordinal, updated_at: new Date().toISOString() })
      .eq('activity_id', activityId)
      .eq('cohort_id', cohortId);
  }

  await revalidateCohortPath(supabase, cohortId);
  return { ok: true };
}

export async function reorderCohortOnlyBlockAction(
  cohortId: string,
  blockId: string,
  direction: 'up' | 'down'
): Promise<ReorderCohortResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: self } = await supabase
    .from('nclex_programme_blocks')
    .select('block_id, unit_id, cohort_id')
    .eq('block_id', blockId)
    .maybeSingle();
  if (!self || (self as { cohort_id: string | null }).cohort_id !== cohortId) {
    return {
      ok: false,
      error: 'Block not found, or not a cohort-only block you can move.',
    };
  }
  const unitId = (self as { unit_id: string }).unit_id;

  const items = await loadCohortUnitBody(supabase, unitId, cohortId);
  const move = newOrdinalForMove(items, 'block', blockId, direction);
  if (move.kind === 'edge') return { ok: true }; // already at the edge
  if (move.kind === 'nogap') return { ok: false, error: NOGAP_ERROR };
  await supabase
    .from('nclex_programme_blocks')
    .update({ ordinal: move.ordinal, updated_at: new Date().toISOString() })
    .eq('block_id', blockId)
    .eq('cohort_id', cohortId);

  await revalidateCohortPath(supabase, cohortId);
  return { ok: true };
}
