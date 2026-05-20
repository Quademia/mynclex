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
};

/**
 * Resolves the Exit destination for any attempt. Source-aware.
 *
 *   • CUSTOM_BUILT       → /student/bank/practice
 *   • PROGRAMME_ASSIGNED → prefer a cohort URL when a cohort has this
 *     activity in its checklist (Permissive v1 — any cohort is
 *     reachable until enrolment ships). Otherwise the programme URL.
 *     Final fallback: /student/picker (a real route, not a 404).
 *   • READINESS_PACK / other → /student (root).
 */
export async function resolveAttemptExitHref(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  attempt: AttemptForExit,
): Promise<string> {
  if (attempt.source === 'CUSTOM_BUILT') {
    return '/student/bank/practice';
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
 * Source-aware label for back/exit buttons. Used by the preflight
 * "← Back" button. The popup uses its own slightly different copy
 * ("Exit to bank", "Exit to curriculum") tuned for that context.
 */
export function exitBackLabel(source: AttemptForExit['source']): string {
  switch (source) {
    case 'CUSTOM_BUILT':       return '← Back to Practice';
    case 'PROGRAMME_ASSIGNED': return '← Back to curriculum';
    case 'READINESS_PACK':     return '← Back';
  }
}

