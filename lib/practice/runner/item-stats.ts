// mynclex/lib/practice/runner/item-stats.ts
//
// "How did everyone else do on this question?" — the last figure on the
// review scoring strip, and the only one that needs anything beyond the
// page the student is already looking at.
//
// ⚠ NOT "cohort". The design prototype used that word and it is already
// taken: a cohort here is a group of students enrolled together in a
// programme run. Worse than a clash, it points at the wrong set — this
// is every student who has ever answered the question, not a class. See
// the migration header (20260903120000_item_response_stats.sql).
//
// The numbers are stored, not derived per request, because five surfaces
// will eventually want them and each would otherwise re-implement three
// rules — first-answer-only, bank/tutor kept apart, and the threshold.
// The threshold is a safety rule, not a preference: below it, a
// percentage on a rarely-answered question is the reader's own result
// handed back to them. One writer owning those rules beats five readers
// each re-deriving them.
//
// Nothing here applies the threshold — the SQL already did, and returned
// nothing for questions under it. That is deliberate: hidden numbers must
// not reach the browser at all, only be omitted from the render.

import type { SupabaseClient } from '@supabase/supabase-js';

/** One question's figures, as the gated RPC returns them. */
export interface ItemStats {
  /** Students who have answered it, each counted once. Always ≥ the
   *  threshold — the RPC drops the rest. */
  nStudents: number;
  nFull:     number;
  nPartial:  number;
  nZero:     number;
}

/** Keyed by attempt_item_id, so the runner can look up per question. */
export type ItemStatsByAttemptItem = Record<string, ItemStats>;

interface Row {
  attempt_item_id: string;
  n_students:      number;
  n_full:          number;
  n_partial:       number;
  n_zero:          number;
}

/**
 * Every question in one sitting that has enough answers to say anything.
 *
 * One call per page load, not one per question. Takes the ATTEMPT rather
 * than a list of item ids for the same reason the RPC does: a caller can
 * only ask about questions they were actually served.
 *
 * Never throws. This is a decoration on a review screen — if it fails,
 * the strip should lose one segment, not the page.
 */
export async function itemStatsForAttempt(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<ItemStatsByAttemptItem> {
  const { data, error } = await supabase.rpc('nclex_item_stats_for_attempt', {
    p_attempt_id: attemptId,
  });
  if (error || !data) return {};

  const out: ItemStatsByAttemptItem = {};
  for (const row of data as Row[]) {
    out[row.attempt_item_id] = {
      nStudents: Number(row.n_students),
      nFull:     Number(row.n_full),
      nPartial:  Number(row.n_partial),
      nZero:     Number(row.n_zero),
    };
  }
  return out;
}

/** What the strip renders, already rounded. */
export interface StatsDisplay {
  /** Share who earned full marks, whole percent. */
  fullPct:    number;
  /** Share who earned some but not all. Null when the question cannot
   *  have a partial score, where it would always be 0%. */
  partialPct: number | null;
  /** Share who earned nothing, whole percent. Tooltip only. */
  zeroPct:    number;
  nStudents:  number;
}

/**
 * Turn stored counts into the strip's figures.
 *
 * @param marksMax used ONLY to decide whether a partial share is
 *   meaningful. A single-mark question is all-or-nothing, so its partial
 *   share is structurally 0% — printing it on every multiple-choice
 *   question is noise, the same reason the strip drops other
 *   always-empty pieces.
 *
 * Percentages are rounded independently and so need not total 100. They
 * are three separate readings, not a pie: showing "41% correct" beside
 * "42% partial" invites no arithmetic, and forcing them to sum would
 * mean distorting at least one of them.
 */
export function statsDisplay(stats: ItemStats, marksMax: number): StatsDisplay | null {
  if (stats.nStudents <= 0) return null;
  const pct = (n: number) => Math.round((n / stats.nStudents) * 100);
  return {
    fullPct:    pct(stats.nFull),
    partialPct: marksMax > 1 ? pct(stats.nPartial) : null,
    zeroPct:    pct(stats.nZero),
    nStudents:  stats.nStudents,
  };
}
