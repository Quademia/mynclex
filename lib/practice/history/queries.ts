// mynclex/lib/practice/history/queries.ts
//
// Server-side fetcher for the bank History page — the directory of every
// sitting a student has done. PROGRAMME_ASSIGNED attempts are excluded;
// they live on the dedicated programme-side surfaces added in progress
// engine Slice 4 (/student/programme/[id]/history + the cohort variant).
//
// Why no explicit student_id filter: RLS on nclex_attempts already scopes
// every read to auth.uid(). Matches get-recent-attempts.ts +
// get-resumable-attempt.ts.
//
// PAGED, NOT CAPPED. The previous version took the newest 50 and stopped,
// with nothing on screen to say so — a student with 71 sittings simply
// could not reach 21 of them. Paging is server-side (and so is filtering,
// necessarily: you cannot filter client-side a list you only partly
// hold) and driven by the URL.

import { createClient } from '@/lib/supabase/server';
import {
  MODES_STUDY,
  MODES_EXAM,
  type Intent,
  type ModeId,
} from '@/lib/practice/builder/filter-config';
import type { FilterPayload } from '@/lib/practice/builder/types';
import { sanitiseSearchTerm } from './derive';
import type {
  AnswerStats,
  AttemptSource,
  AttemptStatus,
  HistoryAttempt,
  HistoryPage,
  HistoryQuery,
  HistoryRow,
} from './types';

export const HISTORY_PAGE_SIZE = 20;

const ATTEMPT_COLUMNS =
  'attempt_id, created_at, last_activity_at, status, intent, mode, source, ' +
  'requested_question_count, actual_question_count, final_score, filters_json, ' +
  'cat_verdict, cat_termination_reason, cat_items_administered';

/**
 * ⚠ PostgREST silently caps a response at 1,000 rows. That cap has bitten
 * this codebase once already — a 2,833-question pool was read, and
 * displayed, as "1,000". It survived tsc, the tests and hand-written SQL
 * checks, because none of those go through the client's row limit.
 *
 * So the answer rows are fetched in chunks small enough that the cap
 * cannot be reached: 5 attempts per request, and the longest sitting in
 * the product is a CAT at ~100 questions, giving ~500 rows worst case.
 * If sittings ever get longer than 200 questions this needs revisiting —
 * hence the assertion below rather than a silent trim.
 */
const STATS_CHUNK = 5;
const STATS_ROW_CEILING = 1000;

/** The content axes a search looks through — everything that describes
 *  WHAT the sitting was about. Order is irrelevant; it becomes an OR. */
const SEARCHABLE_AXES = [
  'nursing_subject',
  'client_needs_category',
  'client_needs_subcategory',
  'body_system',
  'topic',
  'subtopic',
  'tags',
] as const;


function modeLabel(intent: Intent, mode: ModeId): string {
  const list = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
  // Falls back to the raw id, matching the launcher reads. A stored row on
  // an (intent, mode) tuple no longer offered still renders something
  // rather than blank — see filter-config's warning about retired tuples.
  return list.find((m) => m.id === mode)?.label ?? mode;
}

function toAttempt(row: Record<string, unknown>): HistoryAttempt {
  const intent = row.intent as Intent;
  const mode = row.mode as ModeId;
  return {
    attempt_id: row.attempt_id as string,
    created_at: row.created_at as string,
    last_activity_at: (row.last_activity_at as string | null) ?? null,
    status: row.status as AttemptStatus,
    source: row.source as AttemptSource,
    mode_label: modeLabel(intent, mode),
    requested_count: row.requested_question_count as number,
    actual_count: (row.actual_question_count as number | null) ?? null,
    final_score: (row.final_score as number | null) ?? null,
    filters_json: (row.filters_json ?? {}) as FilterPayload,
    mode,
    cat_verdict: row.cat_verdict as HistoryAttempt['cat_verdict'],
    cat_termination_reason: (row.cat_termination_reason as string | null) ?? null,
    cat_items_administered: (row.cat_items_administered as number | null) ?? null,
  };
}

/**
 * Answered / served / engaged-time per attempt.
 *
 * `served` comes from the ATTEMPT row (actual_question_count), not from
 * counting answer rows — an unfinished sitting only has rows for the
 * questions reached, so counting them would report "4 of 4 answered" on a
 * sitting of 20. The answer rows are read only for what they alone know:
 * how many were really submitted, and how long they took.
 */
async function getAnswerStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attempts: HistoryAttempt[],
): Promise<Map<string, AnswerStats>> {
  const out = new Map<string, AnswerStats>();
  if (attempts.length === 0) return out;

  const servedFor = new Map(
    attempts.map((a) => [a.attempt_id, a.actual_count ?? a.requested_count ?? 0]),
  );
  // ⚠ `actual_question_count` is not reliable: on dev it disagrees with the
  // real item rows on 7 of 69 practice attempts, overstating by up to 6.
  // For a FINISHED sitting the answer rows ARE the served questions —
  // verified across the corpus, 26 of 26 completed and 7 of 7 timed-out
  // attempts have exactly one answer row per item. So a terminal row counts
  // what it fetched and only an unfinished one falls back to the column
  // (where answers legitimately cover just the questions reached).
  const finished = new Set(
    attempts
      .filter((a) => a.status === 'COMPLETED' || a.status === 'TIMED_OUT')
      .map((a) => a.attempt_id),
  );
  const rowsSeen = new Map<string, number>();
  const ids = attempts.map((a) => a.attempt_id);

  for (let i = 0; i < ids.length; i += STATS_CHUNK) {
    const slice = ids.slice(i, i + STATS_CHUNK);
    const { data, error } = await supabase
      .from('nclex_attempt_answers')
      .select('attempt_id, submission_status, time_spent_sec')
      .in('attempt_id', slice)
      .limit(STATS_ROW_CEILING);

    if (error || !data) continue;

    if (data.length >= STATS_ROW_CEILING) {
      // Truncated — better a missing column than a wrong number.
      console.warn(
        `[history] answer-stats chunk hit the ${STATS_ROW_CEILING}-row ceiling; ` +
          'counts for this page would be understated. Lower STATS_CHUNK.',
      );
      continue;
    }

    for (const r of data as Array<Record<string, unknown>>) {
      const id = r.attempt_id as string;
      rowsSeen.set(id, (rowsSeen.get(id) ?? 0) + 1);
      const prev =
        out.get(id) ??
        { answered: 0, served: servedFor.get(id) ?? 0, engagedSeconds: null };

      const status = r.submission_status as string;
      // DRAFT is not an answer — visiting a question writes one. SKIPPED
      // is an explicit non-answer.
      const answered =
        status === 'SUBMITTED' || status === 'AUTO_SUBMITTED'
          ? prev.answered + 1
          : prev.answered;

      const secs = r.time_spent_sec as number | null;
      const engagedSeconds =
        secs == null
          ? prev.engagedSeconds
          : (prev.engagedSeconds ?? 0) + secs;

      out.set(id, { answered, served: prev.served, engagedSeconds });
    }
  }

  // Replace `served` with the counted rows on finished sittings, now that
  // every chunk has been read.
  for (const [id, stats] of out) {
    if (finished.has(id)) {
      out.set(id, { ...stats, served: rowsSeen.get(id) ?? stats.served });
    }
  }

  return out;
}

/**
 * One page of the directory, plus the true totals.
 *
 * Two counts are returned because an empty page has two very different
 * causes: a student who has never sat anything, and a filter that matches
 * nothing. Telling them apart needs the unfiltered total.
 */
export async function getHistoryPage(query: HistoryQuery): Promise<HistoryPage> {
  const supabase = await createClient();
  const page = Math.max(1, query.page);
  const from = (page - 1) * HISTORY_PAGE_SIZE;

  let rowQuery = supabase
    .from('nclex_attempts')
    .select(ATTEMPT_COLUMNS, { count: 'exact' })
    .neq('source', 'PROGRAMME_ASSIGNED');

  // A CAT is stored as CUSTOM_BUILT with mode 'CAT', so "practice" has to
  // exclude it explicitly or every CAT shows up under both filters.
  if (query.type === 'practice') {
    rowQuery = rowQuery.eq('source', 'CUSTOM_BUILT').neq('mode', 'CAT');
  } else if (query.type === 'pack') {
    rowQuery = rowQuery.eq('source', 'READINESS_PACK');
  } else if (query.type === 'cat') {
    rowQuery = rowQuery.eq('mode', 'CAT');
  }

  if (query.state === 'open') {
    rowQuery = rowQuery.eq('status', 'IN_PROGRESS');
  } else if (query.state === 'done') {
    rowQuery = rowQuery.in('status', ['COMPLETED', 'TIMED_OUT']);
  } else if (query.state === 'discarded') {
    rowQuery = rowQuery.eq('status', 'ABANDONED');
  }

  // Search runs over every CONTENT axis in the saved filter payload, not
  // just the subject.
  //
  // ⚠ Measured on dev before writing this: `nursing_subject` appears in
  // ZERO stored payloads. Real sittings were built from tags,
  // client-needs category, topic and body system instead — so a
  // subject-only search would have been correct code that could never
  // match anything, and would have looked like a working feature.
  //
  // `->>` renders each array as text, so a substring match needs no RPC.
  // The pool and mode axes are deliberately excluded: they are not
  // content, and "unseen" or "timed" as search terms would match huge
  // swathes of the list for no useful reason. Packs and CATs store no
  // filters at all, so they never match a content search — the type
  // chips are how you find those.
  const q = sanitiseSearchTerm(query.q);
  // A term made entirely of stripped punctuation leaves nothing to match
  // on; searching for `**` would silently return the whole list.
  if (q) {
    const needle = `*${q}*`;
    // ANDed with the chip filters above — PostgREST combines a top-level
    // or=() with the other predicates, so a type chip still narrows it.
    rowQuery = rowQuery.or(
      SEARCHABLE_AXES.map((axis) => `filters_json->>${axis}.ilike.${needle}`).join(','),
    );
  }

  const { data, error, count } = await rowQuery
    .order('created_at', { ascending: false })
    .range(from, from + HISTORY_PAGE_SIZE - 1);

  // Cast via unknown: the column list is a runtime string, so supabase-js
  // widens the row type to include its error shape.
  const attempts =
    error || !data
      ? []
      : (data as unknown as Array<Record<string, unknown>>).map(toAttempt);

  const stats = await getAnswerStats(supabase, attempts);

  const rows: HistoryRow[] = attempts.map((attempt) => ({
    attempt,
    stats: stats.get(attempt.attempt_id) ?? null,
  }));

  // Cheap (head-only) and only needed to phrase the empty state.
  const { count: unfiltered } = await supabase
    .from('nclex_attempts')
    .select('attempt_id', { count: 'exact', head: true })
    .neq('source', 'PROGRAMME_ASSIGNED');

  return {
    rows,
    total: count ?? 0,
    page,
    pageSize: HISTORY_PAGE_SIZE,
    totalUnfiltered: unfiltered ?? 0,
  };
}

/**
 * The flat newest-first feed, unpaged and unfiltered.
 *
 * Kept for the dashboard, which reads it for the three-row Recent
 * activity rail — NOT for any total (it derives those from dedicated
 * count queries, precisely because this function's limit is not a total).
 * The History page itself no longer uses it; it needs paging, filters and
 * per-row answer counts, which this deliberately doesn't carry.
 */
export async function getHistoryAttempts(limit = 50): Promise<HistoryAttempt[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_attempts')
    .select(ATTEMPT_COLUMNS)
    .neq('source', 'PROGRAMME_ASSIGNED')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as Array<Record<string, unknown>>).map(toAttempt);
}

/**
 * Parses the URL's search params into a query. Anything unrecognised
 * falls back to the default rather than erroring — a hand-edited or stale
 * bookmarked URL should still render the list.
 */
export function parseHistoryQuery(
  params: Record<string, string | string[] | undefined>,
): HistoryQuery {
  const one = (k: string): string =>
    (Array.isArray(params[k]) ? params[k]?.[0] : params[k]) ?? '';

  const type = one('type');
  const state = one('state');
  const pageNum = Number.parseInt(one('page'), 10);

  return {
    type:
      type === 'practice' || type === 'pack' || type === 'cat' ? type : 'all',
    state:
      state === 'open' || state === 'done' || state === 'discarded'
        ? state
        : 'all',
    q: one('q').slice(0, 60),
    page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
  };
}
