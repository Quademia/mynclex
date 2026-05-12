// mynclex/lib/curriculum/actions.ts
//
// Server actions for the Unit Builder (slice 9.3b). Five actions:
//   • createActivityAction — INSERT loose Text activity at end of
//     unit body.
//   • editActivityAction  — UPDATE shared fields + payload.
//   • deleteActivityAction — DELETE (simple confirm, no
//     type-to-confirm: low-stakes, text content is recoverable
//     mentally and v1 has no consuming students yet).
//   • reorderActivityAction — swap two loose activities by
//     ordinal direction.
//   • editUnitAction — UPDATE unit title / description /
//     is_published.
//
// RLS on nclex_programme_units / _activities enforces parent-
// programme ownership; these actions don't re-check ownership in
// app code beyond the auth.getUser() guard. The .select('...').single()
// pattern surfaces "row not found OR not yours" as a generic error
// so a malicious client can't probe for IDs.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  ActivityType,
  TextActivityFormValues,
  UnitFormValues,
} from './types';

// ---------- shared helpers ----------

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function trimOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function refreshProgrammeCurriculumPaths(programmeId: string, unitId: string) {
  // Units overview meta-line counts change; unit detail body
  // contents change. Both surfaces need a refresh.
  revalidatePath(`/tutor/programme/${programmeId}/curriculum`);
  revalidatePath(`/tutor/programme/${programmeId}/curriculum/unit/${unitId}`);
}

// =========================================================
// createActivityAction (TEXT in 9.3b; other types in 9.3d)
// =========================================================

export type CreateActivityResult =
  | { ok: true; activity_id: string }
  | { ok: false; error: string };

export async function createActivityAction(
  unitId: string,
  type: ActivityType,
  values: TextActivityFormValues
): Promise<CreateActivityResult> {
  // 9.3b only ships the Text editor; other types remain disabled
  // in the picker. Gate at the server too in case a stale tab
  // submits with a non-Text type.
  if (type !== 'TEXT') {
    return { ok: false, error: 'That activity type is not available yet.' };
  }

  const title = values.title.trim();
  if (title.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Resolve the unit's programme_id + compute next ordinal in one
  // round trip via the unit row + a max-ordinal subquery. RLS on
  // the units row scopes to the tutor's own; if the unit doesn't
  // exist for this user we surface "not found" generically.
  const { data: unitRow, error: unitErr } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, programme_id')
    .eq('unit_id', unitId)
    .maybeSingle();
  if (unitErr) return { ok: false, error: unitErr.message };
  if (!unitRow) {
    return { ok: false, error: 'Unit not found or not yours.' };
  }

  // Next ordinal in the loose stack — append at the bottom of the
  // unit body. Two-step is fine for v1 volumes; we'll consider a
  // single RPC if contention surfaces.
  const { data: maxRow } = await supabase
    .from('nclex_programme_activities')
    .select('ordinal')
    .eq('unit_id', unitId)
    .is('block_id', null)
    .order('ordinal', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdinal = (maxRow?.ordinal ?? 0) + 1;

  const payload = {
    body: values.body,
    ...(values.estimated_minutes != null
      ? { estimated_minutes: values.estimated_minutes }
      : {}),
  };

  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .insert({
      unit_id: unitId,
      block_id: null,
      ordinal: nextOrdinal,
      type: 'TEXT',
      title,
      note: trimOrNull(values.note),
      payload,
      is_published: false,
    })
    .select('activity_id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to create activity.' };
  }

  refreshProgrammeCurriculumPaths(unitRow.programme_id, unitId);
  return { ok: true, activity_id: data.activity_id };
}

// =========================================================
// editActivityAction (TEXT in 9.3b)
// =========================================================

export type EditActivityResult = { ok: true } | { ok: false; error: string };

export async function editActivityAction(
  activityId: string,
  values: TextActivityFormValues
): Promise<EditActivityResult> {
  const title = values.title.trim();
  if (title.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }

  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const payload = {
    body: values.body,
    ...(values.estimated_minutes != null
      ? { estimated_minutes: values.estimated_minutes }
      : {}),
  };

  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .update({
      title,
      note: trimOrNull(values.note),
      payload,
      updated_at: new Date().toISOString(),
    })
    .eq('activity_id', activityId)
    .eq('type', 'TEXT') // belt + suspenders: editing only TEXT in 9.3b
    .select('activity_id, unit_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Activity not found or not yours to edit.' };
  }

  // Look up programme_id for revalidation (cheap; one row).
  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', data.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, data.unit_id);
  }
  return { ok: true };
}

// =========================================================
// deleteActivityAction
// =========================================================

export type DeleteActivityResult = { ok: true } | { ok: false; error: string };

export async function deleteActivityAction(
  activityId: string
): Promise<DeleteActivityResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programme_activities')
    .delete()
    .eq('activity_id', activityId)
    .select('activity_id, unit_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Activity not found or not yours to delete.' };
  }

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', data.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, data.unit_id);
  }
  return { ok: true };
}

// =========================================================
// reorderActivityAction — arrow-driven swap
// =========================================================
// Swaps the activity with the loose-activity neighbour in the
// given direction. No-op when there's no neighbour (top row up,
// bottom row down). Two UPDATE statements; not atomic at the DB
// level — for v1 volumes a brief mid-swap state (a stray
// duplicate ordinal) reads back consistently on the next fetch
// because ordering is by ordinal ASC and ties never matter (we
// re-render after revalidate).

export type ReorderActivityResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reorderActivityAction(
  activityId: string,
  direction: 'up' | 'down'
): Promise<ReorderActivityResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Load this row's unit + ordinal.
  const { data: self, error: selfErr } = await supabase
    .from('nclex_programme_activities')
    .select('activity_id, unit_id, ordinal, block_id')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (selfErr) return { ok: false, error: selfErr.message };
  if (!self) return { ok: false, error: 'Activity not found or not yours.' };

  // Find the neighbour — the loose activity whose ordinal is the
  // next-lower (up) or next-higher (down) than self in the same
  // unit body. block_id IS NULL gate keeps 9.3b loose-only.
  const neighbourQuery = supabase
    .from('nclex_programme_activities')
    .select('activity_id, ordinal')
    .eq('unit_id', self.unit_id)
    .is('block_id', null);

  const { data: neighbour } = direction === 'up'
    ? await neighbourQuery
        .lt('ordinal', self.ordinal)
        .order('ordinal', { ascending: false })
        .limit(1)
        .maybeSingle()
    : await neighbourQuery
        .gt('ordinal', self.ordinal)
        .order('ordinal', { ascending: true })
        .limit(1)
        .maybeSingle();

  if (!neighbour) {
    // No-op — already at the edge. Don't error; the UI's arrow
    // button should be disabled, but a stale click here is safe.
    return { ok: true };
  }

  // Swap. UNIQUE constraint isn't on (unit_id, ordinal), so two
  // separate UPDATEs are fine — there's no overlap risk.
  const now = new Date().toISOString();
  await supabase
    .from('nclex_programme_activities')
    .update({ ordinal: neighbour.ordinal, updated_at: now })
    .eq('activity_id', self.activity_id);
  await supabase
    .from('nclex_programme_activities')
    .update({ ordinal: self.ordinal, updated_at: now })
    .eq('activity_id', neighbour.activity_id);

  const { data: unitRow } = await supabase
    .from('nclex_programme_units')
    .select('programme_id')
    .eq('unit_id', self.unit_id)
    .maybeSingle();
  if (unitRow) {
    refreshProgrammeCurriculumPaths(unitRow.programme_id, self.unit_id);
  }
  return { ok: true };
}

// =========================================================
// editUnitAction — title / description / is_published
// =========================================================

export type EditUnitResult = { ok: true } | { ok: false; error: string };

export async function editUnitAction(
  unitId: string,
  values: UnitFormValues
): Promise<EditUnitResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programme_units')
    .update({
      title: trimOrNull(values.title),
      description: trimOrNull(values.description),
      is_published: values.is_published,
      updated_at: new Date().toISOString(),
    })
    .eq('unit_id', unitId)
    .select('unit_id, programme_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Unit not found or not yours to edit.' };
  }

  refreshProgrammeCurriculumPaths(data.programme_id, unitId);
  return { ok: true };
}
