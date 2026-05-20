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
  PerItemUnseal,
  RunnerData,
} from '@/lib/practice/runner';
import { Runner } from './runner';
import { expireAttemptAction } from './actions';
import { resolveAttemptExitHref } from '@/lib/practice/runner/resolve-exit-href';

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

  let { data: attempt, error: aErr } = await supabase
    .from('nclex_attempts')
    .select('*')
    .eq('attempt_id', attempt_id)
    .maybeSingle();
  if (aErr || !attempt) notFound();

  // Lazy expire detection (slice 4.5a — runner.html §8.6 + attempt-creation
  // §6.1.3). When a timed EXAM has already passed `started_at +
  // duration_seconds`, the row may still be IN_PROGRESS because the cron
  // sweep hasn't fired yet (slice 2.4 will add it). Detect on page load
  // and finalise inline: expireAttemptAction iterates DRAFT rows, scores
  // each in TS via scoreAttempt, AUTO_SUBMITs them, then flips status to
  // TIMED_OUT. The page re-fetches with the flipped status and renders
  // review naturally — no special "exam ended" view (per the revised
  // §6.1.3 rule).
  //
  // Untimed attempts (duration_seconds NULL) skip this — they only end
  // via deliberate Finish or orphan cleanup.
  if (
    attempt.status === 'IN_PROGRESS' &&
    attempt.duration_seconds !== null &&
    attempt.started_at !== null
  ) {
    const startedAtMs = Date.parse(attempt.started_at);
    const expiryMs    = startedAtMs + attempt.duration_seconds * 1000;
    if (Date.now() >= expiryMs) {
      const r = await expireAttemptAction(attempt_id);
      if (!r.ok) notFound();

      const refetch = await supabase
        .from('nclex_attempts')
        .select('*')
        .eq('attempt_id', attempt_id)
        .maybeSingle();
      if (refetch.error || !refetch.data) notFound();
      attempt = refetch.data;
    }
  }

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

  // Resume support (slice 4.6a fix). For UL students returning to an
  // in-progress attempt, items the student already submitted need their
  // unseal data restored so per-Q feedback re-renders. The main items
  // query is sealed by Pillar 2; we fetch the unseal columns here in a
  // narrow follow-up scoped to ONLY items whose answer row is finalised
  // (SUBMITTED / AUTO_SUBMITTED / SKIPPED — never DRAFT). Pillar 2 holds:
  // not-yet-answered items never enter this set.
  let seededUnseal: Record<string, PerItemUnseal> = {};
  if (isLive) {
    const finalisedIds = ((answers.data ?? []) as unknown as AnswerRow[])
      .filter((a) => a.submission_status !== 'DRAFT')
      .map((a) => a.attempt_item_id);

    if (finalisedIds.length > 0) {
      const { data: unsealRows, error: unsealErr } = await supabase
        .from('nclex_attempt_items')
        .select(
          'attempt_item_id, correct_answer_snapshot_json, rationale_snapshot, rationale_img_snapshot, marks_snapshot',
        )
        .eq('attempt_id', attempt_id)
        .in('attempt_item_id', finalisedIds);

      if (unsealErr) notFound();
      for (const r of (unsealRows ?? []) as unknown as Array<{
        attempt_item_id:              string;
        correct_answer_snapshot_json: PerItemUnseal['correct'];
        rationale_snapshot:           string | null;
        rationale_img_snapshot:       string | null;
        marks_snapshot:               number;
      }>) {
        seededUnseal[r.attempt_item_id] = {
          correct:      r.correct_answer_snapshot_json,
          rationale:    r.rationale_snapshot,
          rationaleImg: r.rationale_img_snapshot,
          marksMax:     r.marks_snapshot,
        };
      }
    }
  }

  // Slice 3a — exit URL for the topbar ← Exit button. Server-side so
  // the click is a sync push (no spinner). Same resolver the results
  // popup calls on-demand.
  const exitHref = await resolveAttemptExitHref(supabase, {
    source:                attempt.source,
    programme_activity_id: attempt.programme_activity_id,
  });

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
        seededUnseal,
        exitHref,
      }
    : {
        mode:    'review',
        attempt: attempt as AttemptHeader,
        items:   (items.data   ?? []) as unknown as UnsealedItem[],
        cases:   (cases.data   ?? []) as unknown as CaseSnapshot[],
        trends:  (trends.data  ?? []) as unknown as TrendSnapshot[],
        answers: (answers.data ?? []) as unknown as AnswerRow[],
        exitHref,
      };

  return <Runner data={data} />;
}
