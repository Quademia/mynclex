// mynclex/lib/practice/launchers/get-resumable-attempt.ts
//
// Server-side fetch for the Resume banner: the single most-recent
// unfinished attempt (any intent, any mode except CAT) for the
// signed-in student.
//
// Resume rules (attempt-creation §6.1.3, revised in slice 4.5a; clock
// behaviour updated 2026-07-25 for the engagement clock, BUILD_LIST #6):
//   • All non-CAT attempts are resumable. STUDY + EXAM, untimed +
//     timed all surface here. The only difference is whether the clock
//     waited for the student while they were away:
//       - STUDY timed (TIMED_FREE_NAV): the ENGAGEMENT clock froze on
//         absence, so they resume with the same time left — this is the
//         mode the engagement clock was built for.
//       - EXAM timed: the WALL clock kept running during the absence, so
//         they resume with less time (or, if it fully drained, page.tsx
//         fires lazy expire detection on next mount and finalises it).
//     Either way the banner shows the attempt while it's still IN_PROGRESS.
//   • CAT can't be resumed (adaptive selection state). CAT isn't
//     creatable in v1 anyway, but the mode filter is defensive for
//     Phase B.
//   • started_at IS NOT NULL — preflight confirmed, not just Builder
//     Start. Orphans (NULL started_at) get hard-deleted by slice 2.4
//     orphan sweep.
//   • Order by last_activity_at DESC — most recent on top.
//
// Returns null if no resumable attempt exists. Component renders
// nothing in that case.

import { createClient } from '@/lib/supabase/server';
import {
  MODES_STUDY,
  MODES_EXAM,
  type Intent,
  type ModeId,
} from '@/lib/practice/builder/filter-config';
import type { ResumableAttempt } from './types';

/**
 * @param sources Optional attempt-source allowlist. The Bank Dashboard
 *   passes the bank sources so its Resume banner cannot offer to
 *   continue a PROGRAMME_ASSIGNED quiz — that work belongs to the
 *   programme surfaces, and resuming it from the bank home would drop
 *   the student somewhere they didn't expect. Omitted = every source,
 *   which is the Builder's existing behaviour.
 */
export async function getResumableAttempt(
  sources?: string[],
): Promise<ResumableAttempt | null> {
  const supabase = await createClient();

  let query = supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, intent, mode, actual_question_count, last_activity_at, requested_question_count'
    )
    .eq('status', 'IN_PROGRESS')
    .neq('mode', 'CAT')
    .not('started_at', 'is', null);

  if (sources?.length) query = query.in('source', sources);

  const { data: attempt, error } = await query
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !attempt) return null;

  // Count answered questions (SUBMITTED or AUTO_SUBMITTED — not DRAFT
  // or SKIPPED). Drives the "X of Y done" line.
  const { count: doneCount } = await supabase
    .from('nclex_attempt_answers')
    .select('*', { count: 'exact', head: true })
    .eq('attempt_id', attempt.attempt_id)
    .in('submission_status', ['SUBMITTED', 'AUTO_SUBMITTED']);

  const intent = attempt.intent as Intent;
  const mode = attempt.mode as ModeId;
  const modeList = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
  const modeLabel = modeList.find((m) => m.id === mode)?.label ?? mode;

  return {
    attempt_id: attempt.attempt_id,
    intent,
    mode,
    total: attempt.actual_question_count,
    done: doneCount ?? 0,
    last_activity_at: attempt.last_activity_at,
    mode_label: modeLabel,
  };
}
