// mynclex/lib/bank/cat-pool/queries.ts
//
// Reads the reserved CAT pool for the admin management page (§20.4 / §20.5).
//
// The pool is three things at once, and every count on the page has to agree
// about that:
//   • standalone questions carrying `cat_pool` on their own row;
//   • case wrappers carrying it, whose children inherit it;
//   • trend wrappers carrying it, whose children inherit it.
//
// Reservation lives on the WRAPPER, never on a child (10b1) — so children are
// found by joining back to a reserved wrapper, exactly as readiness does. A
// child row's own `cat_pool` value is meaningless and is never read.

import type { SupabaseClient } from '@supabase/supabase-js';
import { bandForIrt } from '@/lib/bank/difficulty';
import type { PoolCounts } from './coverage';

/** One reserved question, flattened across the three sources. */
export type PoolItemRow = {
  itemId: string;
  questionType: string;
  source: 'standalone' | 'case' | 'trend';
  /** Wrapper id for inherited rows, else null. */
  wrapperId: string | null;
  difficulty: string | null;
  difficultyIrt: number | null;
  difficultySource: string | null;
  subcategory: string | null;
  isPublished: boolean;
  isBuilderVisible: boolean;
};

// The columns every read below shares. Kept in one place so the three queries
// cannot drift into selecting different shapes.
const ITEM_COLUMNS =
  'item_id, question_type, difficulty, difficulty_irt, difficulty_source, ' +
  'client_needs_subcategory, is_published, is_builder_visible, parent_case_id, trend_id';

type RawItem = {
  item_id: string;
  question_type: string;
  difficulty: string | null;
  difficulty_irt: number | null;
  difficulty_source: string | null;
  client_needs_subcategory: string | null;
  is_published: boolean;
  is_builder_visible: boolean;
  parent_case_id: string | null;
  trend_id: string | null;
};

const toRow = (
  r: RawItem,
  source: PoolItemRow['source'],
  wrapperId: string | null,
): PoolItemRow => ({
  itemId: r.item_id,
  questionType: r.question_type,
  source,
  wrapperId,
  difficulty: r.difficulty,
  difficultyIrt: r.difficulty_irt,
  difficultySource: r.difficulty_source,
  subcategory: r.client_needs_subcategory,
  isPublished: r.is_published,
  isBuilderVisible: r.is_builder_visible,
});

export type PoolSnapshot = {
  items: PoolItemRow[];
  counts: PoolCounts;
  /** Reserved wrappers, for the supply rows and the stock lens grouping. */
  caseWrapperIds: string[];
  trendWrapperIds: string[];
};

/**
 * Load the whole reserved pool. Four round-trips: the two wrapper tables, the
 * standalone rows, and the children of every reserved wrapper.
 *
 * The pool is bounded by design — the target is 2,400 standalone plus ~120
 * wrappers — so it is read whole and aggregated in memory rather than pushed
 * into eight separate `count` queries that could disagree with each other.
 */
export async function loadPoolSnapshot(supabase: SupabaseClient): Promise<PoolSnapshot> {
  const [caseWrappers, trendWrappers] = await Promise.all([
    supabase.from('nclex_case_studies').select('case_id').eq('cat_pool', true),
    supabase.from('nclex_trend_datasets').select('trend_id').eq('cat_pool', true),
  ]);

  const caseWrapperIds = (caseWrappers.data ?? []).map((r) => r.case_id as string);
  const trendWrapperIds = (trendWrappers.data ?? []).map((r) => r.trend_id as string);

  // Standalone: flagged on its own row AND not part of a wrapper. The second
  // half matters — a child row could carry a stale flag from before 10b1 fixed
  // reservation to the wrapper, and counting it here would double it.
  const standaloneQuery = supabase
    .from('nclex_bank_items')
    .select(ITEM_COLUMNS)
    .eq('cat_pool', true)
    .is('parent_case_id', null)
    .is('trend_id', null);

  const caseChildQuery = caseWrapperIds.length
    ? supabase.from('nclex_bank_items').select(ITEM_COLUMNS).in('parent_case_id', caseWrapperIds)
    : null;

  const trendChildQuery = trendWrapperIds.length
    ? supabase.from('nclex_bank_items').select(ITEM_COLUMNS).in('trend_id', trendWrapperIds)
    : null;

  const [standalone, caseChildren, trendChildren] = await Promise.all([
    standaloneQuery,
    caseChildQuery,
    trendChildQuery,
  ]);

  // The column list is a string, so the client cannot infer the row shape and
  // widens it to its error union — hence the cast through `unknown`.
  const rows = (data: unknown): RawItem[] => (data ?? []) as unknown as RawItem[];

  const items: PoolItemRow[] = [
    ...rows(standalone.data).map((r) => toRow(r, 'standalone', null)),
    ...rows(caseChildren?.data).map((r) => toRow(r, 'case', r.parent_case_id)),
    ...rows(trendChildren?.data).map((r) => toRow(r, 'trend', r.trend_id)),
  ];

  return {
    items,
    caseWrapperIds,
    trendWrapperIds,
    counts: aggregate(items, caseWrapperIds.length, trendWrapperIds.length),
  };
}

/**
 * Fold the flat rows into the counts the Coverage lens needs. Exported so the
 * aggregation can be exercised directly — it is the step where a miscount
 * would silently misreport the pool.
 */
export function aggregate(
  items: PoolItemRow[],
  caseWrapperCount: number,
  trendWrapperCount: number,
): PoolCounts {
  const bySetBand: Record<string, number> = {};
  const byCalibratedBand: Record<string, number> = {};
  const bySubcategory: Record<string, number> = {};

  let standalone = 0;
  let caseChildren = 0;
  let trendChildren = 0;

  for (const it of items) {
    if (it.source === 'standalone') standalone++;
    else if (it.source === 'case') caseChildren++;
    else trendChildren++;

    if (it.difficulty) {
      bySetBand[it.difficulty] = (bySetBand[it.difficulty] ?? 0) + 1;
    }

    // Only an EMPIRICAL number is one the engine trusts (§5.5). A curator seed
    // would just replay the set label and make the two views identical.
    if (it.difficultySource === 'EMPIRICAL' && typeof it.difficultyIrt === 'number') {
      const band = bandForIrt(it.difficultyIrt);
      byCalibratedBand[band] = (byCalibratedBand[band] ?? 0) + 1;
    }

    if (it.subcategory) {
      bySubcategory[it.subcategory] = (bySubcategory[it.subcategory] ?? 0) + 1;
    }
  }

  return {
    standalone,
    cases: caseWrapperCount,
    trends: trendWrapperCount,
    caseChildren,
    trendChildren,
    bySetBand,
    byCalibratedBand,
    bySubcategory,
  };
}
