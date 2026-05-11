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

export type EditProgrammeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function editProgrammeAction(
  programme_id: string,
  input: CreateProgrammeInput
): Promise<EditProgrammeResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // RLS on UPDATE filters by tutor_id = auth.uid(); a tutor editing a
  // row that isn't theirs gets 0 rows updated (no error from PostgREST,
  // just no row). We surface that as a generic failure so a malicious
  // client can't probe for IDs.
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
  return { ok: true };
}
