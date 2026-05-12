// mynclex/lib/practice/launchers/get-resumable-attempt.ts
//
// Server-side fetch for the Resume banner: the single most-recent
// unfinished attempt (any intent, any mode except CAT) for the
// signed-in student.
//
// Resume rules (attempt-creation §6.1.3, revised in slice 4.5a):
//   • All non-CAT attempts are resumable. STUDY + EXAM, untimed +
//     timed all surface here.
//   • Timed attempts: wall-clock continues during the student's
//     absence — page.tsx fires lazy expire detection on next mount
//     if the attempt is past its duration. The banner shows them
//     while they're still in flight.
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

export async function getResumableAttempt(): Promise<ResumableAttempt | null> {
  const supabase = await createClient();

  const { data: attempt, error } = await supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, intent, mode, actual_question_count, last_activity_at, requested_question_count'
    )
    .eq('status', 'IN_PROGRESS')
    .neq('mode', 'CAT')
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
