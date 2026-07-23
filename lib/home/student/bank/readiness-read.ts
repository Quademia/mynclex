// mynclex/lib/home/student/bank/readiness-read.ts
//
// The two reads behind the readiness panel's richer signals: the
// latest readiness pack's peer distribution, and the latest CAT's
// ability trace.
//
// Both deliberately go through the SAME derivations as the pages they
// preview — the peer RPC the pack report calls, and trajectoryPoints()
// from the CAT report — rather than re-deriving anything. A dashboard
// preview that disagreed with the page it links to would be worse than
// no preview.
//
// Both are best-effort: a failure returns null/empty and the signal
// card falls back to its plain state. The panel must not be able to
// take the dashboard down.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { trajectoryPoints, type CatReportItem, type TrajectoryPoint } from '@/lib/practice/cat/report-derive';
import type { PeerStats } from '@/lib/payments/readiness-report';

type SbClient = Awaited<ReturnType<typeof createClient>>;

/** Peer distribution for a pack sitting — the pack report's own RPC. */
export async function peerStatsFor(
  supabase: SbClient,
  attemptId: string | null,
): Promise<PeerStats | null> {
  if (!attemptId) return null;
  const { data } = await supabase.rpc('nclex_readiness_pack_peer_stats', {
    p_attempt_id: attemptId,
  });
  if (!data || typeof data !== 'object') return null;
  const p = data as {
    n?: number;
    unlocked?: boolean;
    your_percentile?: number | null;
    your_bucket?: number | null;
    buckets?: { lo: number; hi: number; count: number }[];
  };
  return {
    n: p.n ?? 0,
    unlocked: p.unlocked === true,
    yourPercentile: p.your_percentile ?? null,
    yourBucket: p.your_bucket ?? null,
    buckets: p.buckets ?? [],
  };
}

/**
 * The latest CAT's trajectory. Reads only the columns the trace needs,
 * then hands them to the report's own trajectoryPoints() — which owns
 * the one-question shift (the engine stores the estimate BEFORE each
 * question; the graph plots the estimate AFTER each answer). Getting
 * that shift wrong draws a plausible graph that lags by one question
 * and nothing else would catch it, which is exactly why this must not
 * be reimplemented here.
 */
export async function catTrajectoryFor(
  supabase: SbClient,
  attemptId: string | null,
  finalTheta: number | null,
  finalSe: number | null,
): Promise<TrajectoryPoint[]> {
  if (!attemptId || finalTheta === null || finalSe === null) return [];

  const { data } = await supabase
    .from('nclex_attempt_items')
    .select(
      'position, cat_theta_before, cat_se_before, parent_case_id, nclex_attempt_answers(is_correct, score_awarded, submission_status)',
    )
    .eq('attempt_id', attemptId)
    .order('position', { ascending: true });

  if (!data || data.length === 0) return [];

  const items: CatReportItem[] = data.map((row) => {
    const answers = row.nclex_attempt_answers as unknown;
    const answer = (Array.isArray(answers) ? answers[0] : answers) as
      | { is_correct?: boolean | null; score_awarded?: number | null; submission_status?: string }
      | null
      | undefined;
    return {
      position: row.position,
      questionType: '',
      category: null,
      thetaBefore: row.cat_theta_before === null ? null : Number(row.cat_theta_before),
      seBefore: row.cat_se_before === null ? null : Number(row.cat_se_before),
      isCorrect: answer?.is_correct === true,
      scoreAwarded: Number(answer?.score_awarded ?? 0),
      marks: 1,
      isCaseChild: row.parent_case_id !== null,
      answered:
        answer?.submission_status === 'SUBMITTED' ||
        answer?.submission_status === 'AUTO_SUBMITTED',
    };
  });

  return trajectoryPoints(items, finalTheta, finalSe);
}
