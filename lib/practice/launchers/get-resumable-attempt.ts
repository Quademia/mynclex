// mynclex/lib/bank/entry-helpers/get-resumable-attempt.ts
//
// Server-side fetch for the Resume banner: the single most-recent
// unfinished STUDY attempt for the signed-in student.
//
// Resume rules (planning §15 + attempt-creation §10.2):
//   • Only STUDY attempts are resumable. Timed EXAM attempts auto-
//     terminate on timeout; CAT attempts can't be resumed.
//   • started_at IS NOT NULL — the student confirmed the preflight,
//     not just clicked Start in the builder. (Orphans with NULL
//     started_at are auto-cleaned by the orphan sweep — slice 2.4.)
//   • status = 'IN_PROGRESS' — terminated attempts (COMPLETED,
//     TIMED_OUT, ABANDONED) don't surface here.
//   • Order by last_activity_at DESC — most recent on top.
//
// Returns null if no resumable attempt exists. Component renders
// nothing in that case.

import { createClient } from '@/lib/supabase/server';
import {
  MODES_STUDY,
  type Intent,
  type ModeId,
} from '@/lib/practice/builder/filter-config';
import type { ResumableAttempt } from './types';

export async function getResumableAttempt(): Promise<ResumableAttempt | null> {
  const supabase = await createClient();

  const { data: attempt, error } = await supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, intent, mode, actual_question_count, last_activity_at, requested_question_count'
    )
    .eq('status', 'IN_PROGRESS')
    .eq('intent', 'STUDY')
    .not('started_at', 'is', null)
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

  // Resolve the mode label. Resume banner only shows STUDY attempts so
  // MODES_STUDY is the right lookup.
  const modeLabel = MODES_STUDY.find((m) => m.id === attempt.mode)?.label
    ?? attempt.mode;

  return {
    attempt_id: attempt.attempt_id,
    intent: attempt.intent as Intent,
    mode: attempt.mode as ModeId,
    total: attempt.actual_question_count,
    done: doneCount ?? 0,
    last_activity_at: attempt.last_activity_at,
    mode_label: modeLabel,
  };
}
