// mynclex/lib/bank/entry-helpers/get-recent-attempts.ts
//
// Server-side fetch for the Recent Quizzes shortcut row: up to 3 of
// the most recent FINISHED attempts the student has completed.
//
// Why "finished" only:
//   • IN_PROGRESS attempts surface as the Resume banner — different
//     UX, different placement.
//   • ABANDONED attempts represent "the student gave up on this
//     config" — surfacing it as a one-tap restore would be hostile.
//     (Per planning §17 the chip is meant to be a "let me re-run
//     that exact thing" shortcut, not a "let me try the failed thing
//     again" prompt.)
//   • COMPLETED + TIMED_OUT both count: even a timed-out attempt
//     represents a config the student WANTED to do; let them re-run.
//
// Returns 0–3 rows, newest first. Empty array → row hidden.

import { createClient } from '@/lib/supabase/server';
import {
  MODES_STUDY,
  MODES_EXAM,
  type Intent,
  type ModeId,
} from '@/lib/bank/builder/filter-config';
import type { FilterPayload } from '@/lib/bank/builder/types';
import type { RecentAttempt } from './types';
import { summariseRecent } from './summarise-recent';

export async function getRecentAttempts(): Promise<RecentAttempt[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, created_at, intent, mode, requested_question_count, filters_json'
    )
    .in('status', ['COMPLETED', 'TIMED_OUT'])
    .order('created_at', { ascending: false })
    .limit(3);

  if (error || !data) return [];

  return data.map((row): RecentAttempt => {
    const intent = row.intent as Intent;
    const mode = row.mode as ModeId;
    const filters = (row.filters_json ?? {}) as FilterPayload;
    const modeList = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
    const modeLabel = modeList.find((m) => m.id === mode)?.label ?? mode;
    return {
      attempt_id: row.attempt_id,
      created_at: row.created_at,
      intent,
      mode,
      requested_count: row.requested_question_count,
      filters_json: filters,
      summary: summariseRecent(filters, row.requested_question_count),
      mode_label: modeLabel,
    };
  });
}
