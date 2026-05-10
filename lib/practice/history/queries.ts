// mynclex/lib/practice/history/queries.ts
//
// Server-side fetcher for the History page. Returns every attempt the
// signed-in student has, newest first, capped at 50.
//
// Why no explicit student_id filter: RLS on nclex_attempts already
// scopes the query to auth.uid(). Matches get-recent-attempts.ts +
// get-resumable-attempt.ts.
//
// Why limit 50: BUILD_LIST 4.6a — MVP cap, no pagination. Pagination
// + filtering land with slice 7.1 polish.

import { createClient } from '@/lib/supabase/server';
import {
  MODES_STUDY,
  MODES_EXAM,
  type Intent,
  type ModeId,
} from '@/lib/practice/builder/filter-config';
import type { FilterPayload } from '@/lib/practice/builder/types';
import type { HistoryAttempt, AttemptStatus, AttemptSource } from './types';

export async function getHistoryAttempts(): Promise<HistoryAttempt[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, created_at, status, intent, mode, source, requested_question_count, final_score, filters_json'
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row): HistoryAttempt => {
    const intent = row.intent as Intent;
    const mode = row.mode as ModeId;
    const modeList = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
    const modeLabel = modeList.find((m) => m.id === mode)?.label ?? mode;
    return {
      attempt_id: row.attempt_id,
      created_at: row.created_at,
      status: row.status as AttemptStatus,
      source: row.source as AttemptSource,
      mode_label: modeLabel,
      requested_count: row.requested_question_count,
      final_score: row.final_score,
      filters_json: (row.filters_json ?? {}) as FilterPayload,
    };
  });
}
