// mynclex/lib/practice/cat/db.ts
//
// The CatDb adapter — the only place the CAT turn handler touches Supabase.
// Kept separate from turn.ts so the loop's decisions stay unit-testable
// against a fake (see turn.test.ts).
//
// Plan: bank-consumption-cat.html §10.6.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatDb } from './turn';
import type { CatExpireDb } from './expire';
import type { CatHistoryRow } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export function makeCatDb(supabase: Db): CatDb {
  return {
    /** The attempt's clock settings — the authority on this exam's time limit. */
    async loadAttempt(attemptId: string) {
      const { data, error } = await supabase
        .from('nclex_attempts')
        .select('duration_seconds, started_at')
        .eq('attempt_id', attemptId)
        .maybeSingle();

      if (error) throw new Error(`loadAttempt failed: ${error.message}`);
      if (!data) throw new Error('attempt not found');

      return {
        duration_seconds: data.duration_seconds,
        started_at: data.started_at,
      };
    },

    /**
     * Prior administered items with their scores, in position order.
     *
     * Excludes the newest row — that is the question being answered right
     * now, and turn.ts folds it in from the freshly-computed score rather
     * than from a stored one that does not exist yet.
     */
    async loadHistory(attemptId: string): Promise<CatHistoryRow[]> {
      const { data, error } = await supabase
        .from('nclex_attempt_items')
        .select(`
          attempt_item_id, position, item_id, question_type,
          cat_item_difficulty, cat_weight, marks_snapshot,
          nclex_attempt_answers ( score_awarded )
        `)
        .eq('attempt_id', attemptId)
        .order('position', { ascending: true });

      if (error) throw new Error(`loadHistory failed: ${error.message}`);

      const rows = (data ?? []) as any[];
      // Drop the newest — it is the current question.
      const prior = rows.slice(0, Math.max(rows.length - 1, 0));

      return prior.map((r) => ({
        attempt_item_id: r.attempt_item_id,
        position: r.position,
        item_id: r.item_id,
        question_type: r.question_type,
        cat_item_difficulty: r.cat_item_difficulty,
        cat_weight: r.cat_weight,
        marks_snapshot: r.marks_snapshot,
        // Supabase returns the embedded row as an array or object depending
        // on the relationship; normalise both.
        score_awarded:
          (Array.isArray(r.nclex_attempt_answers)
            ? r.nclex_attempt_answers[0]?.score_awarded
            : r.nclex_attempt_answers?.score_awarded) ?? null,
      }));
    },

    /** The current (highest-position) item: its answer key, marks, difficulty. */
    async loadCurrent(attemptId: string) {
      const { data, error } = await supabase
        .from('nclex_attempt_items')
        .select('attempt_item_id, question_type, marks_snapshot, correct_answer_snapshot_json, cat_item_difficulty, cat_weight')
        .eq('attempt_id', attemptId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`loadCurrent failed: ${error.message}`);
      if (!data) throw new Error('attempt has no administered item');

      return {
        attempt_item_id: data.attempt_item_id,
        correct: data.correct_answer_snapshot_json,
        question_type: data.question_type,
        marks_snapshot: data.marks_snapshot,
        cat_item_difficulty: data.cat_item_difficulty,
        cat_weight: data.cat_weight,
      };
    },

    /** Persist + select, in one transaction (§10.3). */
    async nextItem(args) {
      const { data, error } = await supabase.rpc('cat_next_item', {
        p_attempt_id: args.attemptId,
        p_last_answer_payload: args.answer as any,
        p_score_awarded: args.scoreAwarded,
        p_is_correct: args.isCorrect,
        p_theta_after: args.thetaAfter,
        p_se_after: args.seAfter,
        p_terminate_reason: args.terminateReason,
        p_terminate_verdict: args.terminateVerdict,
        p_expected_item_id: args.expectedItemId,
      });

      if (error) throw new Error(`cat_next_item failed: ${error.message}`);
      return (data ?? {}) as Record<string, unknown>;
    },
  };
}

/**
 * The expiry adapter — reuses the turn adapter's reads and swaps the write.
 *
 * Composed rather than duplicated so the two paths can never drift on HOW the
 * history is loaded: a difference there would mean a CAT that times out
 * between turns estimates ability from different evidence than one that times
 * out inside a turn, and the two would resolve to different verdicts.
 */
export function makeCatExpireDb(supabase: Db): CatExpireDb {
  const base = makeCatDb(supabase);
  return {
    loadAttempt: base.loadAttempt,
    loadHistory: base.loadHistory,

    async expire(args) {
      const { error } = await supabase.rpc('nclex_expire_cat_attempt', {
        p_attempt_id:         args.attemptId,
        p_theta:              args.theta,
        p_se:                 args.se,
        p_verdict:            args.verdict,
        p_items_administered: args.itemsAdministered,
      });

      if (error) throw new Error(`nclex_expire_cat_attempt failed: ${error.message}`);
    },
  };
}
