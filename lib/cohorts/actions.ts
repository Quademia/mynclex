// mynclex/lib/cohorts/actions.ts
//
// Server actions for cohort surfaces (slice 9.2b).
// createCohortAction is the only public action in v1; edit/discard
// land with 9.2c.
//
// RLS enforces parent-programme ownership on INSERT, so the
// programme_id passed in is the security boundary — a tutor passing
// another tutor's programme_id will be rejected by the policy.

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
