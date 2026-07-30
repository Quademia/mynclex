// mynclex/lib/practice/report/queries.ts
//
// Loader + gate for the Session Report.
//
// Reads the attempt's OWN SNAPSHOT (nclex_attempt_items' *_snapshot columns),
// never the live bank row, so the report keeps saying what the student
// actually sat after a curator edits, re-classifies or retires a question.
//
// Three reads, joined in TS rather than by an embedded select: the two child
// tables are keyed by attempt_item_id and the join is a Map lookup, while an
// embed would put the row count at the mercy of PostgREST's nesting limits.
// A practice sitting is at most a few dozen questions, so this is cheap.

import { createClient } from '@/lib/supabase/server';
import { modeLabelFor, type Intent, type ModeId } from '@/lib/practice/builder/filter-config';
import { summariseRecent } from '@/lib/practice/launchers/summarise-recent';
import type { FilterPayload } from '@/lib/practice/builder/types';
import { countMindChanges } from './derive';
import type { ReportQuestion, SessionReportResult } from './types';

/** A Builder sitting cannot exceed the Builder's own maximum, which is far
 *  below PostgREST's silent 1,000-row cap. Stated explicitly so a future
 *  longer format can't quietly truncate the report. */
const MAX_QUESTIONS = 500;

/** Terminal statuses that have something to report. */
const REPORTABLE = new Set(['COMPLETED', 'TIMED_OUT']);

/** The attempt columns this loader reads. Declared because the select list is
 *  a runtime string, which widens supabase-js's row type to include its error
 *  shape — the same cast the History loader needs. */
interface AttemptRow {
  attempt_id: string;
  student_id: string;
  source: string;
  intent: string;
  mode: string;
  status: string;
  created_at: string;
  final_score: number | null;
  requested_question_count: number | null;
  actual_question_count: number | null;
  filters_json: unknown;
  engaged_seconds_used: number | null;
}

export async function getSessionReport(
  attemptId: string,
  userId: string,
): Promise<SessionReportResult> {
  const supabase = await createClient();

  const { data: attemptRow, error } = await supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, student_id, source, intent, mode, status, created_at, final_score, ' +
        'requested_question_count, actual_question_count, filters_json, engaged_seconds_used',
    )
    .eq('attempt_id', attemptId)
    .maybeSingle();

  if (error || !attemptRow) return { ok: false, reason: 'not_found', attemptId };
  const attempt = attemptRow as unknown as AttemptRow;

  // RLS already scopes reads to the owner; this is the belt to that braces —
  // the same defence-in-depth the rest of the bank surfaces use.
  if (attempt.student_id !== userId) return { ok: false, reason: 'not_found', attemptId };

  // This report is for Builder-built practice only. A pack and a CAT have
  // their own report pages, and sending them here would show them a debrief
  // written in the wrong vocabulary — a percentage on a CAT is forbidden
  // outright (§13.5). The page redirects rather than 404s.
  if (attempt.source !== 'CUSTOM_BUILT' || attempt.mode === 'CAT') {
    return {
      ok: false,
      reason: 'wrong_kind',
      attemptId,
      // Hand back the report it DOES have. Same routing rule as the History
      // row and the dashboard rail, which is why all three now read it from
      // one place conceptually: CAT first, because a CAT is stored as
      // CUSTOM_BUILT and checking source alone would misroute it.
      redirectTo:
        attempt.mode === 'CAT'
          ? `/student/bank/cat/result/${attemptId}`
          : attempt.source === 'READINESS_PACK'
            ? `/student/bank/packs/report/${attemptId}`
            : '/student/bank/history',
    };
  }

  if (attempt.status === 'ABANDONED') return { ok: false, reason: 'discarded', attemptId };
  if (!REPORTABLE.has(attempt.status as string)) {
    return { ok: false, reason: 'in_progress', attemptId };
  }

  const [{ data: items }, { data: answers }] = await Promise.all([
    supabase
      .from('nclex_attempt_items')
      .select(
        'attempt_item_id, position, item_id, question_type, classification_snapshot, ' +
          'stem_snapshot, marks_snapshot, correct_answer_snapshot_json',
      )
      .eq('attempt_id', attemptId)
      .order('position', { ascending: true })
      .limit(MAX_QUESTIONS),
    supabase
      .from('nclex_attempt_answers')
      .select(
        'attempt_item_id, submission_status, score_awarded, time_spent_sec, ' +
          'answer_changes_json, answer_json',
      )
      .eq('attempt_id', attemptId)
      .limit(MAX_QUESTIONS),
  ]);

  const answerFor = new Map<string, Record<string, unknown>>();
  for (const a of (answers ?? []) as unknown as Array<Record<string, unknown>>) {
    answerFor.set(a.attempt_item_id as string, a);
  }

  const questions: ReportQuestion[] = (
    (items ?? []) as unknown as Array<Record<string, unknown>>
  ).map(
    (it, idx) => {
      const a = answerFor.get(it.attempt_item_id as string);
      const classification = (it.classification_snapshot ?? {}) as Record<string, unknown>;
      return {
        // `position` is authoritative, but fall back to the read order rather
        // than emit a 0 — a report row numbered 0 reads like a bug.
        position: (it.position as number | null) ?? idx + 1,
        itemId: it.item_id as string,
        questionType: (it.question_type as string) ?? 'MCQ',
        classification,
        stem: (it.stem_snapshot as string | null) ?? null,
        marks: (it.marks_snapshot as number | null) ?? 0,
        scoreAwarded: a ? ((a.score_awarded as number | null) ?? null) : null,
        submissionStatus: a ? ((a.submission_status as string | null) ?? null) : null,
        timeSpentSec: a ? ((a.time_spent_sec as number | null) ?? null) : null,
        answerChanges: a ? countMindChanges(a.answer_changes_json) : 0,
        correct: it.correct_answer_snapshot_json ?? null,
        answer: a ? (a.answer_json ?? null) : null,
        difficultyIrt:
          typeof classification.difficulty_irt === 'number'
            ? classification.difficulty_irt
            : null,
      };
    },
  );

  const filters = (attempt.filters_json ?? {}) as FilterPayload;

  // ⚠ COUNT THE QUESTIONS WE ACTUALLY LOADED, not actual_question_count.
  //
  // Measured on dev: 7 of 69 practice attempts have actual_question_count
  // disagreeing with their real item rows, overstating by as much as 6. The
  // first report I opened proved it — the headline read "Unseen · 9 Q" while
  // the body underneath said "2 of 6" and "Review all 6 answers", because the
  // heading trusted the column and everything else counted the rows.
  //
  // The item rows are what the student was actually served and what carries
  // the snapshots, so they are the truth. A page contradicting itself in two
  // places is worse than a page that is merely wrong in one.
  const count = questions.length;

  return {
    ok: true,
    report: {
      attemptId: attempt.attempt_id as string,
      createdAt: attempt.created_at as string,
      modeLabel: modeLabelFor(attempt.intent as Intent, attempt.mode as ModeId),
      // The same summary the History row shows, from the same helper — two
      // surfaces naming one sitting must not name it differently.
      summary: summariseRecent(filters, count),
      filters,
      scoreFraction: (attempt.final_score as number | null) ?? null,
      questions,
      engagedSeconds: (attempt.engaged_seconds_used as number | null) ?? null,
    },
  };
}
