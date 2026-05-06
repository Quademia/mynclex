// mynclex/lib/bank/builder/get-filter-options.ts
//
// Server-side fetch of the dynamic content-filter axis options:
//   - tags      (array column on nclex_bank_items, deduped, sorted)
//   - topics    (free-text column, deduped, sorted)
//   - subtopics (free-text column, deduped, sorted)
//
// CNC, Subcategory, Subject, Body System, Question Type, Difficulty
// are all hardcoded (lib/bank/classifications.ts) — they don't change
// without a deploy. These three are curator-driven and live in the
// data, so we read them on every page render.
//
// Called from app/(app)/student/bank/practice/page.tsx during SSR.
// One DB query + cheap in-TS dedup; no PostgREST function needed.
//
// Scoping: only published, builder-visible rows. Mirrors the same
// filter the create-attempt path applies, so a tag/topic that's not
// reachable doesn't appear here.

import { createClient } from '@/lib/supabase/server';

export interface FilterOptions {
  tags: string[];
  topics: string[];
  subtopics: string[];
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const supabase = await createClient();

  // Single SELECT pulling the three columns; dedup in TS so we don't
  // need a custom RPC. Currently <100 rows in dev, will be a few
  // thousand at scale — still cheap.
  const { data, error } = await supabase
    .from('nclex_bank_items')
    .select('tags, topic, subtopic')
    .eq('is_published', true)
    .eq('is_builder_visible', true);

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

  const sortAlpha = (a: string, b: string) => a.localeCompare(b);

  return {
    tags:      [...tagSet].sort(sortAlpha),
    topics:    [...topicSet].sort(sortAlpha),
    subtopics: [...subtopicSet].sort(sortAlpha),
  };
}
