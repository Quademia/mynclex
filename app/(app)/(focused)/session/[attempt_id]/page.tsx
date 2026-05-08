// mynclex/app/(app)/(focused)/session/[attempt_id]/page.tsx
//
// Runner entry. Loads attempt + 4 snapshot tables + answers, enforces
// Pillar 2 (no answer-key leakage) at the server boundary via column-
// level projection, and routes into <Runner mode="live"> or
// <Runner mode="review"> based on attempt status.
//
// Why projection-at-the-server (vs RLS column-level):
//   RLS on nclex_attempt_items currently allows the owning student to
//   SELECT every column, key + rationale included. Review mode
//   legitimately needs those, so we don't tighten RLS. Instead we
//   narrow the projection here per status — sealed columns omitted
//   while live, included while review. The seal becomes explicit and
//   grep-able at the only place the runner crosses the server/client
//   boundary in 4.1.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  AttemptHeader,
  SealedItem,
  UnsealedItem,
  AnswerRow,
  CaseSnapshot,
  TrendSnapshot,
  RunnerData,
} from '@/lib/bank/runner';
import { Runner } from './runner';

export const dynamic = 'force-dynamic';

const SEALED_ITEM_COLUMNS = [
  'attempt_item_id',
  'position',
  'question_type',
  'stem_snapshot',
  'instruction_snapshot',
  'marks_snapshot',
  'classification_snapshot',
  'content_snapshot_json',
  'parent_case_id',
  'case_position',
  'cjmm_step',
  'trend_id',
  'shuffle_seed',
  'option_order_json',
].join(', ');

const UNSEALED_ITEM_COLUMNS =
  SEALED_ITEM_COLUMNS +
  ', correct_answer_snapshot_json, rationale_snapshot, rationale_img_snapshot';


interface PageProps {
  params: Promise<{ attempt_id: string }>;
}

export default async function SessionPage({ params }: PageProps) {
  const { attempt_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: attempt, error: aErr } = await supabase
    .from('nclex_attempts')
    .select('*')
    .eq('attempt_id', attempt_id)
    .maybeSingle();
  if (aErr || !attempt) notFound();

  // ABANDONED has no rows underneath (discard hard-deletes per slice 2.2b).
  // Bounce back to Practice rather than render a broken runner.
  if (attempt.status === 'ABANDONED') {
    redirect('/student/bank/practice');
  }

  const isLive = attempt.status === 'IN_PROGRESS';
  const itemColumns = isLive ? SEALED_ITEM_COLUMNS : UNSEALED_ITEM_COLUMNS;

  const [items, cases, trends, answers] = await Promise.all([
    supabase
      .from('nclex_attempt_items')
      .select(itemColumns)
      .eq('attempt_id', attempt_id)
      .order('position', { ascending: true }),
    supabase
      .from('nclex_attempt_case_snapshots')
      .select('case_id, title_snapshot, scenario_summary_snapshot, tabs_snapshot_json')
      .eq('attempt_id', attempt_id),
    supabase
      .from('nclex_attempt_trend_snapshots')
      .select(
        'trend_id, title_snapshot, scenario_snapshot, kind_snapshot, ' +
        'row_label_snapshot, timepoints_snapshot_json, rows_snapshot_json',
      )
      .eq('attempt_id', attempt_id),
    supabase
      .from('nclex_attempt_answers')
      .select(
        'attempt_item_id, answer_json, submission_status, is_correct, ' +
        'score_awarded, time_spent_sec, submitted_at',
      )
      .eq('attempt_id', attempt_id),
  ]);

  if (items.error || cases.error || trends.error || answers.error) {
    notFound();
  }

  // Multi-line / concatenated select strings defeat supabase-js's row-
  // shape inference (returns GenericStringError[]); cast through unknown.
  const data: RunnerData = isLive
    ? {
        mode:    'live',
        attempt: attempt as AttemptHeader,
        items:   (items.data   ?? []) as unknown as SealedItem[],
        cases:   (cases.data   ?? []) as unknown as CaseSnapshot[],
        trends:  (trends.data  ?? []) as unknown as TrendSnapshot[],
        answers: (answers.data ?? []) as unknown as AnswerRow[],
      }
    : {
        mode:    'review',
        attempt: attempt as AttemptHeader,
        items:   (items.data   ?? []) as unknown as UnsealedItem[],
        cases:   (cases.data   ?? []) as unknown as CaseSnapshot[],
        trends:  (trends.data  ?? []) as unknown as TrendSnapshot[],
        answers: (answers.data ?? []) as unknown as AnswerRow[],
      };

  return <Runner data={data} />;
}
