// mynclex/lib/programmes/actions.ts
//
// Server actions for the programme tutor surfaces.
// Slice 9.1b — createProgrammeAction (INSERT into nclex_programmes).
//
// RLS allows the INSERT only when tutor_id = auth.uid(); we set
// tutor_id from the current session here, so the policy check is the
// belt-and-braces authorisation.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type CreateProgrammeInput = {
  title: string;
  tagline: string | null;
  description: string | null;
  length_weeks: number;
  start_date: string;            // YYYY-MM-DD
  end_date: string;              // YYYY-MM-DD
  cohort_size: number | null;
  price_minor_ghs: number;
  price_minor_usd: number;
  show_price_publicly: boolean;
};

export type CreateProgrammeResult =
  | { ok: true; programme_id: string }
  | { ok: false; error: string };

export async function createProgrammeAction(
  input: CreateProgrammeInput
): Promise<CreateProgrammeResult> {
  // Server-side validation. The modal mirrors these rules client-side
  // for UX, but this is the security boundary — never trust the form.
  const trimmedTitle = input.title?.trim() ?? '';
  if (trimmedTitle.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }
  if (
    !Number.isInteger(input.length_weeks) ||
    input.length_weeks < 1 ||
    input.length_weeks > 52
  ) {
    return { ok: false, error: 'Length must be between 1 and 52 weeks.' };
  }
  if (!input.start_date || !input.end_date) {
    return { ok: false, error: 'Start and end dates are required.' };
  }
  if (input.end_date < input.start_date) {
    return { ok: false, error: 'End date cannot be before start date.' };
  }
  if (
    !Number.isInteger(input.price_minor_ghs) ||
    input.price_minor_ghs < 0 ||
    !Number.isInteger(input.price_minor_usd) ||
    input.price_minor_usd < 0
  ) {
    return { ok: false, error: 'Prices must be non-negative numbers.' };
  }
  if (
    input.cohort_size != null &&
    (!Number.isInteger(input.cohort_size) || input.cohort_size < 1)
  ) {
    return { ok: false, error: 'Cohort size must be a positive number or blank.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_programmes')
    .insert({
      tutor_id: user.id,
      title: trimmedTitle,
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      length_weeks: input.length_weeks,
      start_date: input.start_date,
      end_date: input.end_date,
      cohort_size: input.cohort_size,
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
// editProgrammeAction (slice 9.1c)
// =====================================================================

export type EditProgrammeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function editProgrammeAction(
  programme_id: string,
  input: CreateProgrammeInput
): Promise<EditProgrammeResult> {
  // Same validation as create — never trust the form.
  const trimmedTitle = input.title?.trim() ?? '';
  if (trimmedTitle.length === 0) {
    return { ok: false, error: 'Title is required.' };
  }
  if (
    !Number.isInteger(input.length_weeks) ||
    input.length_weeks < 1 ||
    input.length_weeks > 52
  ) {
    return { ok: false, error: 'Length must be between 1 and 52 weeks.' };
  }
  if (!input.start_date || !input.end_date) {
    return { ok: false, error: 'Start and end dates are required.' };
  }
  if (input.end_date < input.start_date) {
    return { ok: false, error: 'End date cannot be before start date.' };
  }
  if (
    !Number.isInteger(input.price_minor_ghs) ||
    input.price_minor_ghs < 0 ||
    !Number.isInteger(input.price_minor_usd) ||
    input.price_minor_usd < 0
  ) {
    return { ok: false, error: 'Prices must be non-negative numbers.' };
  }
  if (
    input.cohort_size != null &&
    (!Number.isInteger(input.cohort_size) || input.cohort_size < 1)
  ) {
    return { ok: false, error: 'Cohort size must be a positive number or blank.' };
  }

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
      title: trimmedTitle,
      tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null,
      length_weeks: input.length_weeks,
      start_date: input.start_date,
      end_date: input.end_date,
      cohort_size: input.cohort_size,
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
