// mynclex/lib/bank/builder/get-filter-options.ts
//
// Server-side fetch of the dynamic content-filter axis options:
//   - tags      (array columns on nclex_bank_items + the two wrapper
//                tables, deduped, sorted)
//   - topics    (free-text column, deduped, sorted)
//   - subtopics (free-text column, deduped, sorted)
//
// CNC, Subcategory, Subject, Body System, Question Type, Difficulty
// are all hardcoded (lib/bank/classifications.ts) — they don't change
// without a deploy. These three are curator-driven and live in the
// data, so we read them on every page render.
//
// Called from app/(app)/student/bank/practice/page.tsx during SSR.
// Three cheap SELECTs + in-TS dedup; no PostgREST function needed.
//
// Scoping: only published, builder-visible rows. Mirrors the same
// filter the create-attempt path applies, so a tag/topic that's not
// reachable doesn't appear here.
//
// Wrapper tags: cases + trends carry their own tags, inherited by
// their questions in the eligibility pool (20260717/20260718120000) —
// so a wrapper-only tag must appear as a pickable option here or it
// would match in the pool but be unreachable from the picker. The
// student-side reads ride the read_published RLS policies.

import { createClient } from '@/lib/supabase/server';

export interface FilterOptions {
  tags: string[];
  topics: string[];
  subtopics: string[];
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const supabase = await createClient();

  // Question columns + the two wrappers' tags; dedup in TS so we don't
  // need a custom RPC. Currently <100 rows in dev, will be a few
  // thousand at scale — still cheap.
  const [
    { data, error },
    { data: caseRows },
    { data: trendRows },
  ] = await Promise.all([
    // `cat_pool` excluded to match `_nclex_eligible_unit_pool` (10b3). These
    // build the Builder's filter chips, so a reserved question left in here
    // would advertise an axis the pool can no longer serve — the student
    // picks the tag and gets "0 questions match".
    supabase
      .from('nclex_bank_items')
      .select('tags, topic, subtopic')
      .eq('is_published', true)
      .eq('is_builder_visible', true)
      .eq('cat_pool', false),
    supabase
      .from('nclex_case_studies')
      .select('tags')
      .eq('is_published', true)
      .eq('is_builder_visible', true)
      .eq('cat_pool', false),
    supabase
      .from('nclex_trend_datasets')
      .select('tags')
      .eq('is_published', true),
  ]);

  if (error || !data) {
    // Fail open — return empty arrays so the Builder still renders.
    // The page works without these axes; we just hide them.
    return { tags: [], topics: [], subtopics: [] };
  }

  const tagSet = new Set<string>();
  const topicSet = new Set<string>();
  const subtopicSet = new Set<string>();

  for (const row of data) {
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) {
        if (t && typeof t === 'string') tagSet.add(t);
      }
    }
    if (row.topic && typeof row.topic === 'string') topicSet.add(row.topic);
    if (row.subtopic && typeof row.subtopic === 'string') subtopicSet.add(row.subtopic);
  }

  // Wrapper tags (fail-open: a missing result just contributes nothing).
  for (const row of [...(caseRows ?? []), ...(trendRows ?? [])]) {
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) {
        if (t && typeof t === 'string') tagSet.add(t);
      }
    }
  }

  const sortAlpha = (a: string, b: string) => a.localeCompare(b);

  return {
    tags:      [...tagSet].sort(sortAlpha),
    topics:    [...topicSet].sort(sortAlpha),
    subtopics: [...subtopicSet].sort(sortAlpha),
  };
}
