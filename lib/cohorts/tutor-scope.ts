// mynclex/lib/cohorts/tutor-scope.ts
//
// Cohort ownership, for scoping tutor-side cohort reads and gates.
//
// ⚠ WHY THIS EXISTS — read before deleting a cohort ownership probe
// because "RLS already covers it".
//
// Two things make cohorts easy to get wrong:
//
// 1. **Ownership is not stored on the cohort.** There is no
//    `tutor_id` column — it lives on the parent programme. So the
//    filter has to travel through an `!inner` embed, not a column
//    comparison.
//
// 2. **RLS will not narrow it for you.** nclex_cohorts carries
//    `_self_select` (I tutor the parent programme) OR
//    `_student_select` (nclex_has_active_cohort_enrolment) OR
//    `_admin_all`, and Postgres ORs permissive policies together. So
//    an unfiltered lookup resolves happily for a cohort the caller is
//    merely ENROLLED on.
//
// The same is true of every cohort-child table —
// nclex_cohort_checklist_items and nclex_cohort_live_sessions each
// carry a student SELECT policy of their own.
//
// ⭐ WHAT THIS ACTUALLY COST (dev, 2026-08-25). The writes were never
// exposed — every write policy is owner-only, and a cross-tutor write
// was refused every time. What leaked was the TRUTH OF THE ANSWER: an
// UPDATE that matches zero rows raises nothing in Postgres, so a
// server action that checks only `error` reports success having saved
// nothing. `applyChecklistChange` (behind all four setActivity*
// actions) had no ownership gate at all: 45 checklist rows readable,
// UPDATE affected 0, no error, `ok: true`. Same shape as `deleteUnit`
// and `clearLiveSessionScheduleAction`.
//
// ⭐ The rule, third time of asking: RLS is the floor, not the filter
// — and a write that RLS refuses is only half-safe. The other half is
// whether the screen tells the truth about it.
//
// ⓘ This module is deliberately NOT `'use server'`. Actions import it;
// if it lived in an actions file, exporting it would publish it as a
// callable server action.

import type { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The cohort's programme id, but ONLY if `tutorId` owns that
 * programme — otherwise null. Callers turn null into their own
 * "not found or not yours" refusal.
 */
export async function ownedCohortProgrammeId(
  supabase: ServerClient,
  cohortId: string,
  tutorId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('nclex_cohorts')
    .select('programme_id, nclex_programmes!inner(tutor_id)')
    .eq('cohort_id', cohortId)
    .eq('nclex_programmes.tutor_id', tutorId)
    .maybeSingle();
  return (data as { programme_id: string } | null)?.programme_id ?? null;
}
