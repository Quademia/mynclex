// mynclex/lib/practice/runner/resolve-exit-href.ts
//
// Shared resolver: where does "Exit" send the student for a given
// attempt? Used by:
//   • app/(app)/(focused)/session/[attempt_id]/page.tsx — server-side
//     on every load, so the runner topbar's ← Exit button has a real
//     destination ready for a synchronous click.
//   • lib/practice/runner/results-actions.ts (getResultsContext) — the
//     popup's Exit button reuses the same logic on-demand.
//
// Plain module (no 'use server') so it can export a helper, not a
// server action.

import type { SupabaseClient } from '@supabase/supabase-js';

export type AttemptForExit = {
  source:                'CUSTOM_BUILT' | 'READINESS_PACK' | 'PROGRAMME_ASSIGNED';
  programme_activity_id: string | null;
  /** Attempt mode. Only CAT changes the answer, but it is REQUIRED rather
   *  than optional on purpose: every caller must state it, so a new call
   *  site can't silently inherit the Builder destination for a CAT. */
  mode:                  string | null;
  /** The attempt's `filters_json`. Required for the same reason `mode` is:
   *  a Case Study bank run is ALSO stored as CUSTOM_BUILT, and the only
   *  thing distinguishing it is the `case_bank` marker in here. Callers
   *  must state it so a new call site cannot silently send a case run back
   *  to the practice Builder. */
  filters_json:          unknown;
};

/** True when this attempt was launched from the Case Study bank. */
function isCaseBankRun(filters: unknown): boolean {
  return (
    !!filters &&
    typeof filters === 'object' &&
    Object.prototype.hasOwnProperty.call(filters, 'case_bank')
  );
}

/**
 * Resolves the Exit destination for any attempt. Mode first, then source.
 *
 *   • mode CAT           → /student/bank/cat
 *   • case-bank run      → /student/bank/cases
 *   • CUSTOM_BUILT       → /student/bank/practice
 *   • PROGRAMME_ASSIGNED → prefer a cohort URL when a cohort has this
 *     activity in its checklist (Permissive v1 — any cohort is
 *     reachable until enrolment ships). Otherwise the programme URL.
 *     Final fallback: /student/picker (a real route, not a 404).
 *   • READINESS_PACK     → /student/bank/packs (where they began the sitting).
 *   • other              → /student (root).
 */
export async function resolveAttemptExitHref(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  attempt: AttemptForExit,
): Promise<string> {
  // CAT is checked before source because a CAT is STORED as CUSTOM_BUILT
  // (there is no 'CAT' source value), so the source branch below would
  // otherwise claim it and send a student exiting an adaptive exam to the
  // practice Builder — a surface they did not come from and cannot start
  // another CAT from. This one resolver feeds five exits: the runner
  // topbar, the preflight Back, two runner pushes, and the results popup.
  if (attempt.mode === 'CAT') {
    return '/student/bank/cat';
  }

  // Checked before source for exactly the reason CAT is: a Case Study bank
  // run is stored as CUSTOM_BUILT too (it is a student-built run, just
  // built by picking cases rather than filters), so the branch below would
  // claim it and exit to the practice Builder — again a surface they did
  // not come from and cannot pick another case in.
  if (isCaseBankRun(attempt.filters_json)) {
    return '/student/bank/cases';
  }

  if (attempt.source === 'CUSTOM_BUILT') {
    return '/student/bank/practice';
  }

  if (attempt.source === 'READINESS_PACK') {
    return '/student/bank/packs';
  }

  if (attempt.source === 'PROGRAMME_ASSIGNED' && attempt.programme_activity_id) {
    const activityId = attempt.programme_activity_id;

    // Cohort first — Permissive v1.
    const { data: cohortRow } = await supabase
      .from('nclex_cohort_checklist_items')
      .select('cohort_id')
      .eq('template_activity_id', activityId)
      .limit(1)
      .maybeSingle();
    if (cohortRow?.cohort_id) {
      return `/student/cohort/${cohortRow.cohort_id}/curriculum`;
    }

    // Self-paced — walk activity → block → unit → programme.
    const { data: activity } = await supabase
      .from('nclex_programme_activities')
      .select('block_id')
      .eq('activity_id', activityId)
      .maybeSingle();
    if (activity?.block_id) {
      const { data: block } = await supabase
        .from('nclex_programme_blocks')
        .select('unit_id')
        .eq('block_id', activity.block_id)
        .maybeSingle();
      if (block?.unit_id) {
        const { data: unit } = await supabase
          .from('nclex_programme_units')
          .select('programme_id')
          .eq('unit_id', block.unit_id)
          .maybeSingle();
        if (unit?.programme_id) {
          return `/student/programme/${unit.programme_id}/curriculum`;
        }
      }
    }

    return '/student/picker';
  }

  return '/student';
}


/**
 * Label for back/exit buttons. Used by the preflight "← Back" button.
 * The popup uses its own slightly different copy ("Exit to bank",
 * "Exit to curriculum") tuned for that context.
 *
 * Takes `mode` for the same reason the resolver does — a CAT reads as
 * CUSTOM_BUILT, and the label has to name where the href actually goes.
 */
export function exitBackLabel(
  source:  AttemptForExit['source'],
  mode:    string | null,
  filters?: unknown,
): string {
  if (mode === 'CAT') return '← Back to CAT home';
  // Same ordering as the resolver — a case run reads as CUSTOM_BUILT, and
  // the label has to name where the href actually goes.
  if (isCaseBankRun(filters)) return '← Back to Case Studies';
  switch (source) {
    case 'CUSTOM_BUILT':       return '← Back to Practice';
    case 'PROGRAMME_ASSIGNED': return '← Back to curriculum';
    case 'READINESS_PACK':     return '← Back';
  }
}

