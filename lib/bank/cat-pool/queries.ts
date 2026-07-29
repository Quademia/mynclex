// mynclex/lib/bank/cat-pool/queries.ts
//
// Reads the reserved CAT pool for the admin management page (§20.4 / §20.5).
//
// The pool is three slices, and every count on the page has to agree:
//   • standalone questions carrying `cat_pool` on their own row;
//   • case wrappers carrying it, whose children carry a copy of it;
//   • trend-linked questions carrying it on their own row.
//
// A CASE is a selection unit, so its reservation lives on the wrapper and the
// children hold a materialised copy the database keeps in step (migration
// 20260822120000). The wrapper stays authoritative — release it and the
// children follow — but every read here can use the item's own column.
//
// A TREND DATASET is NOT a selection unit anywhere in the product: trend
// questions are picked individually, one per dataset per exam. So they are
// reserved individually too, and the dataset survives here only as the thing
// we count DISTINCT to measure scenario variety.

import type { SupabaseClient } from '@supabase/supabase-js';
import { bandForIrt } from '@/lib/bank/difficulty';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
import type { PoolCounts } from './coverage';
import type { CandidateQuestion, CandidateWrapper } from './candidates';

/** One reserved question, flattened across the three sources. */
export type PoolItemRow = {
  itemId: string;
  questionType: string;
  source: 'standalone' | 'case' | 'trend';
  /** Wrapper id for inherited rows, else null. */
  wrapperId: string | null;
  /** Plain-text stem, for the row preview and the search box. */
  stem: string;
  difficulty: string | null;
  difficultyIrt: number | null;
  difficultySource: string | null;
  subcategory: string | null;
  isPublished: boolean;
  isBuilderVisible: boolean;
  /** Also a member of a readiness pack — one question, two purposes (§20.5). */
  readinessTagged: boolean;
};

// The columns every read below shares. Kept in one place so the three queries
// cannot drift into selecting different shapes.
const ITEM_COLUMNS =
  'item_id, question_type, stem, difficulty, difficulty_irt, difficulty_source, ' +
  'client_needs_subcategory, is_published, is_builder_visible, parent_case_id, trend_id';

type RawItem = {
  item_id: string;
  question_type: string;
  stem: string | null;
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
  readiness: Set<string>,
): PoolItemRow => ({
  itemId: r.item_id,
  questionType: r.question_type,
  source,
  wrapperId,
  // Stems authored through the rich editor are stored as a Tiptap document,
  // so flatten once here — the preview and the search box then agree.
  stem: richTextToPlain(r.stem),
  difficulty: r.difficulty,
  difficultyIrt: r.difficulty_irt,
  difficultySource: r.difficulty_source,
  subcategory: r.client_needs_subcategory,
  isPublished: r.is_published,
  isBuilderVisible: r.is_builder_visible,
  readinessTagged: readiness.has(r.item_id),
});

// ── reading more than a thousand rows ────────────────────────────────
//
// PostgREST caps a select at 1,000 rows, and does it SILENTLY — no error, no
// flag, just a short array. Every number on this page is aggregated in memory
// from rows read here, so a truncated read does not fail: it quietly reports a
// smaller pool. That is exactly what happened when the Coverage lens was first
// looked at — a 2,833-question pool read as "1,000 / 2,880", and each slice
// was a fraction of its real size.
//
// Both reads below exceed the cap (the reserved pool, and the free candidate
// stock behind the drawer), so both page explicitly. The `.order()` matters:
// without a stable sort, two pages can overlap or skip rows.

const PAGE_ROWS = 1000;

// A runaway guard. 60 pages is 60,000 rows — far past anything this bank will
// hold — so hitting it means a query that never shortens, not a big pool.
const MAX_PAGES = 60;

type PagedResult = { data: unknown; error: unknown };

async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PagedResult>,
): Promise<T[]> {
  const out: T[] = [];

  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_ROWS;
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) break;

    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    // A short page is the last page.
    if (rows.length < PAGE_ROWS) break;
  }

  return out;
}

export type PoolSnapshot = {
  items: PoolItemRow[];
  counts: PoolCounts;
  /** Reserved case wrappers, for the supply rows and the stock lens grouping. */
  caseWrapperIds: string[];
  /** Wrapper id → title, for the stock pane's group headers. */
  wrapperTitles: Record<string, string>;
};

/**
 * Load the whole reserved pool.
 *
 * Every reserved question now carries `cat_pool` on its own row — case
 * children included, via the cascade trigger — so this is ONE read of
 * `nclex_bank_items` rather than a standalone read plus a child read per
 * wrapper table. The wrapper tables are still read, for their titles and for
 * the reserved-case count the Coverage lens shows.
 *
 * The pool is bounded by design (the target is ~2,880 questions) so it is read
 * whole and aggregated in memory rather than pushed into separate `count`
 * queries that could disagree with each other — but "whole" means paging past
 * the 1,000-row cap, not trusting one select to return everything.
 */
export async function loadPoolSnapshot(supabase: SupabaseClient): Promise<PoolSnapshot> {
  const [reservedRows, caseWrappers, readinessRows] = await Promise.all([
    fetchAllRows<RawItem>((from, to) =>
      supabase
        .from('nclex_bank_items')
        .select(ITEM_COLUMNS)
        .eq('cat_pool', true)
        .order('item_id')
        .range(from, to),
    ),
    supabase.from('nclex_case_studies').select('case_id, title').eq('cat_pool', true),
    // Readiness membership is a link table, not a column — an item is
    // readiness-reserved if it appears here at all (§20.5 mutual exclusivity).
    fetchAllRows<{ item_id: string }>((from, to) =>
      supabase.from('nclex_readiness_pack_items').select('item_id').order('item_id').range(from, to),
    ),
  ]);

  const caseWrapperIds = (caseWrappers.data ?? []).map((r) => r.case_id as string);

  const wrapperTitles: Record<string, string> = {};
  for (const r of caseWrappers.data ?? []) {
    wrapperTitles[r.case_id as string] = (r.title as string) ?? '';
  }

  const readinessIds = new Set(readinessRows.map((r) => r.item_id));

  // Trend titles come from the datasets the reserved questions actually point
  // at, not from a reserved-dataset list — there is no such thing any more.
  const trendIds = [
    ...new Set(reservedRows.map((r) => r.trend_id).filter((id): id is string => !!id)),
  ];
  if (trendIds.length) {
    const { data: datasets } = await supabase
      .from('nclex_trend_datasets')
      .select('trend_id, title')
      .in('trend_id', trendIds);
    for (const r of datasets ?? []) {
      wrapperTitles[r.trend_id as string] = (r.title as string) ?? '';
    }
  }

  const rows = reservedRows;

  // A row's slice is decided by its own links, in this order: a case child is
  // a case child even if it also carries a trend_id (it cannot, but the order
  // makes the precedence explicit rather than incidental).
  const items: PoolItemRow[] = rows.map((r) =>
    r.parent_case_id
      ? toRow(r, 'case', r.parent_case_id, readinessIds)
      : r.trend_id
        ? toRow(r, 'trend', r.trend_id, readinessIds)
        : toRow(r, 'standalone', null, readinessIds),
  );

  return {
    items,
    caseWrapperIds,
    wrapperTitles,
    counts: aggregate(items, caseWrapperIds.length),
  };
}

// ── the reserve drawer's candidate stock (10b2-d) ────────────────────

/** Stems are previews here, not content — truncated to keep the payload sane. */
const STEM_PREVIEW = 180;

const preview = (raw: string | null): string => {
  const flat = richTextToPlain(raw).replace(/\s+/g, ' ').trim();
  return flat.length > STEM_PREVIEW ? `${flat.slice(0, STEM_PREVIEW)}…` : flat;
};

export type ReserveCandidates = {
  /** Free standalone questions — no case, no dataset. */
  questions: CandidateQuestion[];
  /** Free case wrappers, reserved whole. */
  cases: CandidateWrapper[];
  /**
   * Free TREND QUESTIONS, not datasets. Each is ticked on its own, exactly
   * like a standalone; the dataset shows on the row only as context.
   */
  trendQuestions: CandidateQuestion[];
};

/**
 * Everything that could be reserved: published, practice-eligible, not
 * already in the pool.
 *
 * The whole candidate set is loaded rather than a page of it, because the
 * drawer filters across six facets client-side — filtering a server-side page
 * would silently search only that page, which is the exact dishonesty the
 * stock pane's "N of M" counter exists to avoid. Stems are truncated to a
 * preview to keep that affordable, and this only runs when the drawer is open.
 */
export async function loadReserveCandidates(
  supabase: SupabaseClient,
): Promise<ReserveCandidates> {
  // One read covers both question tabs: free standalone rows and free trend
  // questions differ only by whether `trend_id` is set, and both are ticked
  // individually. The placeability CHECK binds on both, so rows missing a
  // difficulty band, a calibrated number or a subcategory are excluded here
  // rather than offered and then rejected on save.
  //
  // `difficulty_irt` is the column CAT actually selects on. It is seeded from
  // the band by a database trigger (20260824120000), so screening on the band
  // alone would normally give the same answer — but it did not before that
  // trigger existed: the 622-item gap-fill run set bands and no numbers, and
  // this query would have cheerfully offered every one of them as CAT stock
  // the engine could never serve.
  type RawCandidate = {
    item_id: string;
    question_type: string;
    stem: string | null;
    difficulty: string | null;
    client_needs_subcategory: string | null;
    body_system: string | null;
    nursing_subject: string | null;
    bloom_level: string | null;
    trend_id: string | null;
  };

  const [raw, cases, readinessRows] = await Promise.all([
    fetchAllRows<RawCandidate>((from, to) =>
      supabase
        .from('nclex_bank_items')
        .select(
          'item_id, question_type, stem, difficulty, client_needs_subcategory, body_system, nursing_subject, bloom_level, trend_id',
        )
        .eq('is_published', true)
        .eq('cat_pool', false)
        .is('parent_case_id', null)
        .not('difficulty', 'is', null)
        .not('difficulty_irt', 'is', null)
        .not('client_needs_subcategory', 'is', null)
        .order('item_id')
        .range(from, to),
    ),
    supabase
      .from('nclex_case_studies')
      .select('case_id, title')
      .eq('cat_pool', false)
      .eq('is_published', true),
    fetchAllRows<{ item_id: string }>((from, to) =>
      supabase.from('nclex_readiness_pack_items').select('item_id').order('item_id').range(from, to),
    ),
  ]);

  const readinessIds = new Set(readinessRows.map((r) => r.item_id));

  // Dataset titles, so a trend question can say which scenario it belongs to.
  const trendIds = [...new Set(raw.map((r) => r.trend_id).filter((id): id is string => !!id))];
  const trendTitles: Record<string, string> = {};
  if (trendIds.length) {
    const { data: datasets } = await supabase
      .from('nclex_trend_datasets')
      .select('trend_id, title')
      .in('trend_id', trendIds);
    for (const d of datasets ?? []) {
      trendTitles[d.trend_id as string] = (d.title as string) ?? '';
    }
  }

  const toCandidate = (r: RawCandidate): CandidateQuestion => ({
    itemId: r.item_id,
    questionType: r.question_type,
    stem: preview(r.stem),
    difficulty: r.difficulty,
    subcategory: r.client_needs_subcategory,
    bodySystem: r.body_system,
    nursingSubject: r.nursing_subject,
    bloomLevel: r.bloom_level,
    readinessTagged: readinessIds.has(r.item_id),
    trendId: r.trend_id,
    trendTitle: r.trend_id ? (trendTitles[r.trend_id] ?? null) : null,
  });

  // A case's children decide its preview line and whether it is blocked —
  // reservation is on the wrapper, so one readiness-tagged child blocks it all.
  const caseIds = (cases.data ?? []).map((r) => r.case_id as string);

  type Kid = { item_id: string; parent_case_id?: string; difficulty: string | null };

  // Six children per case, so this passes 1,000 rows at ~167 free cases —
  // reachable, and it would silently under-report the later cases' child
  // counts rather than fail. Paged for the same reason as the reads above.
  const caseKids = caseIds.length
    ? await fetchAllRows<Kid>((from, to) =>
        supabase
          .from('nclex_bank_items')
          .select('item_id, parent_case_id, difficulty')
          .in('parent_case_id', caseIds)
          .eq('is_published', true)
          .order('item_id')
          .range(from, to),
      )
    : [];

  const caseRoll = new Map<
    string,
    { n: number; bands: Set<string>; blocked: boolean; unplaceable: number }
  >();
  for (const k of caseKids) {
    if (!k.parent_case_id) continue;
    const e = caseRoll.get(k.parent_case_id) ?? {
      n: 0,
      bands: new Set<string>(),
      blocked: false,
      unplaceable: 0,
    };
    e.n++;
    if (k.difficulty) e.bands.add(k.difficulty);
    // A child with no band leaves the whole case unpickable — CAT requires an
    // IRT number on all six before it will schedule the block.
    else e.unplaceable++;
    if (readinessIds.has(k.item_id)) e.blocked = true;
    caseRoll.set(k.parent_case_id, e);
  }

  return {
    questions: raw.filter((r) => !r.trend_id).map(toCandidate),
    trendQuestions: raw.filter((r) => !!r.trend_id).map(toCandidate),
    cases: (cases.data ?? []).map((r) => {
      const id = r.case_id as string;
      const e = caseRoll.get(id);
      return {
        wrapperId: id,
        kind: 'case' as const,
        title: (r.title as string) ?? '',
        childCount: e?.n ?? 0,
        bands: [...(e?.bands ?? [])],
        readinessTagged: e?.blocked ?? false,
        unplaceableChildren: e?.unplaceable ?? 0,
      };
    }),
  };
}

/**
 * Fold the flat rows into the counts the Coverage lens needs. Exported so the
 * aggregation can be exercised directly — it is the step where a miscount
 * would silently misreport the pool.
 */
export function aggregate(items: PoolItemRow[], caseWrapperCount: number): PoolCounts {
  const bySetBand: Record<string, number> = {};
  const byCalibratedBand: Record<string, number> = {};
  const bySubcategory: Record<string, number> = {};

  let standalone = 0;
  let caseChildren = 0;
  let trendQuestions = 0;
  // Counted DISTINCT: the trend target is a variety goal, so ten reserved
  // questions from one dataset are one scenario, not ten.
  const datasets = new Set<string>();

  for (const it of items) {
    if (it.source === 'standalone') standalone++;
    else if (it.source === 'case') caseChildren++;
    else {
      trendQuestions++;
      if (it.wrapperId) datasets.add(it.wrapperId);
    }

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
    caseChildren,
    trendQuestions,
    trendDatasets: datasets.size,
    bySetBand,
    byCalibratedBand,
    bySubcategory,
  };
}
