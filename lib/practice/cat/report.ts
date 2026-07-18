// mynclex/lib/practice/cat/report.ts
//
// The read behind the CAT results page (§13). Server-only.
//
// Plan: bank-consumption-cat.html §13 (result presentation), §19.4 Slice 7.
//
// TWO VALUES ARE COMPUTED HERE, NOT STORED (§12.7.12):
//   • the readiness probability — derived from cat_final_theta + cat_final_se
//     via readinessProbability() from @/lib/cat, the SAME function the
//     stopping rule reads at a different threshold (§9.5). Deriving it means
//     the page and the engine can never disagree.
//   • the clinical-judgment read — derived from the stored case answers.
// Neither has a column. If either is ever persisted, this is the code that
// has to stop recomputing it, or the two will drift.
//
// The abandoned branch is deliberately a DIFFERENT return shape rather than
// a report full of nulls (§16.5): an abandoned CAT has no verdict, no
// ability estimate and no trajectory, and a caller that has to check
// `verdict !== null` before every read will eventually forget to.

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { readinessProbability, TIME_LIMIT_SECONDS } from '@/lib/cat';
import type { CatVerdict } from '@/lib/cat';
import {
  trajectoryPoints,
  categoryRows,
  clinicalJudgment,
  type CatReportItem,
  type TrajectoryPoint,
  type CategoryRow,
  type ClinicalJudgmentRead,
} from './report-derive';

/** One earlier CAT, for the compare-to-previous region (§13.2). */
export interface PriorCat {
  attemptId: string;
  endedAt: string | null;
  theta: number;
  verdict: CatVerdict;
  /** True for the sitting currently on screen. */
  isCurrent: boolean;
}

export interface CatReport {
  attemptId: string;
  endedAt: string | null;
  verdict: CatVerdict;
  finalTheta: number;
  finalSe: number;
  terminationReason: string | null;
  itemsAdministered: number;
  /** Derived on read — never stored. See the header note. */
  probability: number;
  /** The engine's time limit in hours, so page copy tracks the constant. */
  limitHours: number;
  trajectory: TrajectoryPoint[];
  categories: CategoryRow[];
  clinicalJudgment: ClinicalJudgmentRead | null;
  /** Chronological, current sitting last. Empty when this is the first CAT. */
  priorCats: PriorCat[];
}

/** An abandoned CAT — no verdict was ever produced (§16.5). */
export interface CatAbandonedReport {
  attemptId: string;
  endedAt: string | null;
  /** Questions seen before the student left, if any were recorded. */
  itemsSeen: number;
}

export type CatReportResult =
  | { ok: true; kind: 'report'; report: CatReport }
  | { ok: true; kind: 'abandoned'; report: CatAbandonedReport }
  | { ok: false; reason: 'not_found' | 'in_progress' };

interface ClassificationSnapshot {
  client_needs_category?: string | null;
}

export async function getCatReport(
  attemptId: string,
  userId: string,
): Promise<CatReportResult> {
  const supabase = await createClient();

  // Ownership is enforced by RLS, but the explicit student_id filter keeps
  // a policy change from silently widening this read.
  const { data: attempt } = await supabase
    .from('nclex_attempts')
    .select(
      'attempt_id, student_id, mode, status, ended_at, cat_verdict, cat_final_theta, cat_final_se, cat_termination_reason, cat_items_administered',
    )
    .eq('attempt_id', attemptId)
    .eq('student_id', userId)
    .maybeSingle();

  if (!attempt || attempt.mode !== 'CAT') return { ok: false, reason: 'not_found' };
  if (attempt.status === 'IN_PROGRESS') return { ok: false, reason: 'in_progress' };

  // No verdict means the exam never reached a result state — abandoned, or
  // ended some other way that produced no measurement. Either way there is
  // nothing to report, and saying so plainly beats rendering empty regions.
  const hasVerdict =
    attempt.cat_verdict !== null &&
    attempt.cat_final_theta !== null &&
    attempt.cat_final_se !== null;

  if (!hasVerdict || attempt.status === 'ABANDONED') {
    const { count } = await supabase
      .from('nclex_attempt_items')
      .select('attempt_item_id', { count: 'exact', head: true })
      .eq('attempt_id', attemptId);

    return {
      ok: true,
      kind: 'abandoned',
      report: {
        attemptId: attempt.attempt_id,
        endedAt: attempt.ended_at,
        itemsSeen: count ?? 0,
      },
    };
  }

  const [{ data: itemRows }, { data: answerRows }, { data: priorRows }] = await Promise.all([
    supabase
      .from('nclex_attempt_items')
      .select(
        'attempt_item_id, position, question_type, marks_snapshot, classification_snapshot, selection_unit_type, parent_case_id, cat_theta_before, cat_se_before',
      )
      .eq('attempt_id', attemptId)
      .order('position'),
    supabase
      .from('nclex_attempt_answers')
      .select('attempt_item_id, is_correct, score_awarded, submission_status')
      .eq('attempt_id', attemptId),
    // Every other CAT of this student's that reached a verdict — the
    // compare-to-previous region. Ordered oldest first so the chart reads
    // left to right in time.
    supabase
      .from('nclex_attempts')
      .select('attempt_id, ended_at, cat_verdict, cat_final_theta')
      .eq('student_id', userId)
      .eq('mode', 'CAT')
      .not('cat_verdict', 'is', null)
      .order('ended_at', { ascending: true }),
  ]);

  const answerByItem = new Map(
    (answerRows ?? []).map((a) => [a.attempt_item_id, a]),
  );

  const items: CatReportItem[] = (itemRows ?? []).map((row) => {
    const answer = answerByItem.get(row.attempt_item_id);
    const classification = (row.classification_snapshot ?? {}) as ClassificationSnapshot;

    return {
      position: row.position,
      questionType: row.question_type,
      category: classification.client_needs_category ?? null,
      thetaBefore: row.cat_theta_before === null ? null : Number(row.cat_theta_before),
      seBefore: row.cat_se_before === null ? null : Number(row.cat_se_before),
      isCorrect: answer?.is_correct === true,
      scoreAwarded: Number(answer?.score_awarded ?? 0),
      marks: Number(row.marks_snapshot ?? 0),
      isCaseChild: row.selection_unit_type === 'CASE' || row.parent_case_id !== null,
      answered: answer !== undefined && answer.submission_status !== 'SKIPPED',
    };
  });

  const finalTheta = Number(attempt.cat_final_theta);
  const finalSe = Number(attempt.cat_final_se);

  const distinctCases = new Set(
    (itemRows ?? []).map((r) => r.parent_case_id).filter((id): id is string => id !== null),
  );

  const priorCats: PriorCat[] = (priorRows ?? [])
    .filter((r) => r.cat_final_theta !== null)
    .map((r) => ({
      attemptId: r.attempt_id,
      endedAt: r.ended_at,
      theta: Number(r.cat_final_theta),
      verdict: r.cat_verdict as CatVerdict,
      isCurrent: r.attempt_id === attemptId,
    }));

  return {
    ok: true,
    kind: 'report',
    report: {
      attemptId: attempt.attempt_id,
      endedAt: attempt.ended_at,
      verdict: attempt.cat_verdict as CatVerdict,
      finalTheta,
      finalSe,
      terminationReason: attempt.cat_termination_reason,
      itemsAdministered: attempt.cat_items_administered ?? items.length,
      probability: readinessProbability(finalTheta, finalSe),
      limitHours: TIME_LIMIT_SECONDS / 3600,
      trajectory: trajectoryPoints(items, finalTheta, finalSe),
      categories: categoryRows(items),
      clinicalJudgment: clinicalJudgment(items, distinctCases.size),
      // A lone entry means this sitting is the only one — the region reads
      // as "your first CAT" rather than a one-point chart.
      priorCats: priorCats.length > 1 ? priorCats : [],
    },
  };
}
