// mynclex/lib/bank/packs/queries.ts
//
// Read-side loaders for the readiness-pack authoring surfaces.
// Callers are BANK_CURATE-gated pages; RLS backs the same gate.

import type { SupabaseClient } from '@supabase/supabase-js';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { groupPackMembers, type WrapperMeta } from './grouping';
import type { PackDetail, PackMember, PackOverview, PackRow } from './types';

const PACK_COLUMNS =
  'pack_id, title, description, n, time_limit_sec, published, status';

/** All packs + live member counts — feeds the pill strip AND the list cards. */
export async function loadPacksOverview(
  supabase: SupabaseClient,
): Promise<PackOverview[]> {
  const [{ data: packRows, error }, { data: linkRows }] = await Promise.all([
    supabase.from('nclex_readiness_packs').select(PACK_COLUMNS).order('pack_id'),
    supabase.from('nclex_readiness_pack_items').select('pack_id'),
  ]);
  if (error) throw new Error(`Could not load packs: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of (linkRows ?? []) as { pack_id: string }[]) {
    counts[row.pack_id] = (counts[row.pack_id] ?? 0) + 1;
  }

  return ((packRows ?? []) as PackRow[]).map((p, i) => ({
    ...p,
    num: i + 1,
    count: counts[p.pack_id] ?? 0,
  }));
}

interface LinkJoinRow {
  id:       string;
  item_id:  string;
  position: number;
  nclex_bank_items: {
    question_type:         string;
    stem:                  string;
    difficulty:            string | null;
    client_needs_category: string | null;
    is_published:          boolean;
    parent_case_id:        string | null;
    trend_id:              string | null;
  } | null;
}

/** One pack + its members grouped into display units, in sat order. */
export async function loadPackDetail(
  supabase: SupabaseClient,
  packId: string,
): Promise<PackDetail | null> {
  const [{ data: packRow }, { data: linkRows, error: linkErr }] =
    await Promise.all([
      supabase
        .from('nclex_readiness_packs')
        .select(PACK_COLUMNS)
        .eq('pack_id', packId)
        .maybeSingle(),
      supabase
        .from('nclex_readiness_pack_items')
        .select(
          'id, item_id, position, nclex_bank_items(question_type, stem, difficulty, client_needs_category, is_published, parent_case_id, trend_id)',
        )
        .eq('pack_id', packId)
        .order('position'),
    ]);
  if (!packRow) return null;
  if (linkErr) throw new Error(`Could not load pack members: ${linkErr.message}`);

  const members: PackMember[] = ((linkRows ?? []) as unknown as LinkJoinRow[]).map(
    (r) => ({
      linkId: r.id,
      itemId: r.item_id,
      position: r.position,
      questionType: r.nclex_bank_items?.question_type ?? '?',
      stemLabel: richTextToPlainLabel(r.nclex_bank_items?.stem ?? ''),
      difficulty: r.nclex_bank_items?.difficulty ?? null,
      category: r.nclex_bank_items?.client_needs_category ?? null,
      isPublished: r.nclex_bank_items?.is_published ?? false,
      parentCaseId: r.nclex_bank_items?.parent_case_id ?? null,
      trendId: r.nclex_bank_items?.trend_id ?? null,
      cjmmStep: null,
    }),
  );

  // Wrapper meta + case-child CJMM steps.
  const caseIds = [...new Set(members.map((m) => m.parentCaseId).filter(Boolean))] as string[];
  const trendIds = [...new Set(members.map((m) => m.trendId).filter(Boolean))] as string[];

  const caseMeta: Record<string, WrapperMeta> = {};
  const trendMeta: Record<string, WrapperMeta> = {};

  if (caseIds.length > 0) {
    const [{ data: caseRows }, { data: cjmmRows }] = await Promise.all([
      supabase
        .from('nclex_case_studies')
        .select('case_id, title, is_published')
        .in('case_id', caseIds),
      supabase
        .from('nclex_case_study_items')
        .select('item_id, cjmm_step')
        .in('case_id', caseIds),
    ]);
    for (const c of (caseRows ?? []) as { case_id: string; title: string; is_published: boolean }[]) {
      caseMeta[c.case_id] = { title: c.title, isPublished: c.is_published };
    }
    const cjmmByItem: Record<string, string> = {};
    for (const r of (cjmmRows ?? []) as { item_id: string; cjmm_step: string }[]) {
      cjmmByItem[r.item_id] = r.cjmm_step;
    }
    for (const m of members) {
      if (m.parentCaseId) m.cjmmStep = cjmmByItem[m.itemId] ?? null;
    }
  }

  if (trendIds.length > 0) {
    const { data: trendRows } = await supabase
      .from('nclex_trend_datasets')
      .select('trend_id, title, is_published')
      .in('trend_id', trendIds);
    for (const t of (trendRows ?? []) as { trend_id: string; title: string; is_published: boolean }[]) {
      trendMeta[t.trend_id] = { title: t.title, isPublished: t.is_published };
    }
  }

  return {
    pack: packRow as PackRow,
    units: groupPackMembers(members, caseMeta, trendMeta),
    count: members.length,
  };
}
