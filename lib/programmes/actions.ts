// mynclex/lib/programmes/actions.ts
//
// Server actions for the programme tutor surfaces.
// Slice 9.2a — input shape drops date/seat fields (moved to the
// cohort modal in 9.2b) and gains delivery_mode + unit_label +
// length_units.
//
// RLS allows INSERT only when tutor_id = auth.uid(); we set
// tutor_id from the current session here so the policy check is
// the belt-and-braces authorisation.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { DeliveryMode, UnitLabel } from './types';

export type CreateProgrammeInput = {
  title: string;
  tagline: string | null;
  description: string | null;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
  price_minor_ghs: number;
  price_minor_usd: number;
  show_price_publicly: boolean;
};

export type CreateProgrammeResult =
  | { ok: true; programme_id: string }
  | { ok: false; error: string };

function validate(input: CreateProgrammeInput): string | null {
  const trimmedTitle = input.title?.trim() ?? '';
  if (trimmedTitle.length === 0) return 'Title is required.';
  if (
    input.delivery_mode !== 'TUTOR_LED' &&
    input.delivery_mode !== 'SELF_PACED'
  ) {
    return 'Delivery mode is invalid.';
  }
  if (input.unit_label !== 'WEEK' && input.unit_label !== 'MODULE') {
    return 'Unit label is invalid.';
  }
  if (
    !Number.isInteger(input.length_units) ||
    input.length_units < 1 ||
    input.length_units > 52
  ) {
    return 'Length must be between 1 and 52 units.';
  }
  if (
    !Number.isInteger(input.price_minor_ghs) ||
    input.price_minor_ghs < 0 ||
    !Number.isInteger(input.price_minor_usd) ||
    input.price_minor_usd < 0
  ) {
    return 'Prices must be non-negative numbers.';
  }
  return null;
}

export async function createProgrammeAction(
  input: CreateProgrammeInput
): Promise<CreateProgrammeResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programmes')
    .insert({
      tutor_id: user.id,
      title: input.title.trim(),
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      delivery_mode: input.delivery_mode,
      unit_label: input.unit_label,
      length_units: input.length_units,
      price_minor_ghs: input.price_minor_ghs,
      price_minor_usd: input.price_minor_usd,
      show_price_publicly: input.show_price_publicly,
    })
    .select('programme_id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to create programme.' };
  }

  revalidatePath('/tutor/programmes');
  return { ok: true, programme_id: data.programme_id };
}

// =====================================================================
// editProgrammeAction
// =====================================================================
//
// Slice 9.1d — added the destructive-decrease preflight. The DB
// trigger on nclex_programmes (AFTER UPDATE OF length_units)
// fires unconditionally once the UPDATE reaches it, cascading
// DELETEs through blocks + activities for the removed unit tail.
// This action is the application-layer gate that intercepts a
// shrinking length_units and asks for type-to-confirm before any
// content gets cascaded.
//
// Round-trip contract:
//   1. First call (confirmDestructive omitted / false). If the
//      new length is shorter AND the to-be-removed tail isn't
//      empty, return `{ ok: false, requiresConfirm: true, impact }`.
//      No UPDATE happens.
//   2. Modal shows the confirm overlay with the impact summary.
//      Tutor types DELETE.
//   3. Second call (confirmDestructive = true). Action skips the
//      preflight and runs the UPDATE; trigger handles cleanup.
//
// "Tail isn't empty" is computed across three signals: any block
// in those units, any activity in those units, OR any unit row
// with non-null/non-empty title, non-null description, or
// is_published = true. Empty trailing units shorten silently.

type DecreaseImpact = {
  units: number;
  blocks: number;
  activities: number;
  affectedUnitIndices: number[];
};

export type EditProgrammeResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; requiresConfirm: true; impact: DecreaseImpact };

async function measureDecreaseImpact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programme_id: string,
  newLength: number
): Promise<{ shouldConfirm: boolean; impact: DecreaseImpact }> {
  // The doomed units = unit_index > newLength under this programme.
  // RLS on nclex_programme_units scopes the read to programmes
  // owned by the caller. If the caller doesn't own the programme,
  // the SELECT returns zero rows — we'll fall through to a no-op
  // decrease (the UPDATE will then fail with "not found or not
  // yours" anyway).
  const { data: doomedUnits } = await supabase
    .from('nclex_programme_units')
    .select('unit_id, unit_index, title, description, is_published')
    .eq('programme_id', programme_id)
    .gt('unit_index', newLength)
    .order('unit_index');

  const doomed = (doomedUnits ?? []) as Array<{
    unit_id: string;
    unit_index: number;
    title: string | null;
    description: string | null;
    is_published: boolean;
  }>;

  if (doomed.length === 0) {
    return {
      shouldConfirm: false,
      impact: { units: 0, blocks: 0, activities: 0, affectedUnitIndices: [] },
    };
  }

  const doomedIds = doomed.map((u) => u.unit_id);
  const [blocksRes, activitiesRes] = await Promise.all([
    supabase
      .from('nclex_programme_blocks')
      .select('block_id', { count: 'exact', head: true })
      .in('unit_id', doomedIds),
    supabase
      .from('nclex_programme_activities')
      .select('activity_id', { count: 'exact', head: true })
      .in('unit_id', doomedIds),
  ]);

  const blocksCount = blocksRes.count ?? 0;
  const activitiesCount = activitiesRes.count ?? 0;

  // Any unit-level metadata that would silently disappear without
  // a confirm? Title set, description set, or already published —
  // all signs the tutor has put real work into the unit row even
  // if no blocks/activities are inside it yet.
  const anyUnitHasMetadata = doomed.some(
    (u) =>
      (u.title !== null && u.title.trim() !== '') ||
      (u.description !== null && u.description.trim() !== '') ||
      u.is_published === true
  );

  const shouldConfirm =
    blocksCount > 0 || activitiesCount > 0 || anyUnitHasMetadata;

  return {
    shouldConfirm,
    impact: {
      units: doomed.length,
      blocks: blocksCount,
      activities: activitiesCount,
      affectedUnitIndices: doomed.map((u) => u.unit_index),
    },
  };
}

export async function editProgrammeAction(
  programme_id: string,
  input: CreateProgrammeInput,
  confirmDestructive: boolean = false
): Promise<EditProgrammeResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Read OLD length_units. RLS gates the SELECT to programmes
  // owned by the caller; a missing row will be re-surfaced by the
  // UPDATE step below.
  const { data: existing } = await supabase
    .from('nclex_programmes')
    .select('length_units')
    .eq('programme_id', programme_id)
    .maybeSingle();

  // Destructive-decrease preflight. Skipped on the second call
  // when confirmDestructive=true is set.
  if (
    !confirmDestructive &&
    existing &&
    input.length_units < existing.length_units
  ) {
    const { shouldConfirm, impact } = await measureDecreaseImpact(
      supabase,
      programme_id,
      input.length_units
    );
    if (shouldConfirm) {
      return { ok: false, requiresConfirm: true, impact };
    }
  }

  // RLS on UPDATE filters by tutor_id = auth.uid(); a tutor editing a
  // row that isn't theirs gets 0 rows updated (no error from PostgREST,
  // just no row). We surface that as a generic failure so a malicious
  // client can't probe for IDs. The AFTER UPDATE trigger
  // nclex_programmes_reconcile_units_trg handles the unit-table
  // reconciliation (INSERT new tail / DELETE surplus tail) as part
  // of this transaction.
  const { data, error } = await supabase
    .from('nclex_programmes')
    .update({
      title: input.title.trim(),
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      delivery_mode: input.delivery_mode,
      unit_label: input.unit_label,
      length_units: input.length_units,
      price_minor_ghs: input.price_minor_ghs,
      price_minor_usd: input.price_minor_usd,
      show_price_publicly: input.show_price_publicly,
      updated_at: new Date().toISOString(),
    })
    .eq('programme_id', programme_id)
    .select('programme_id')
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Programme not found or not yours to edit.' };
  }

  revalidatePath('/tutor/programmes');
  revalidatePath(`/tutor/programme/${programme_id}/overview`);
  revalidatePath(`/tutor/programme/${programme_id}/curriculum`);
  return { ok: true };
}
