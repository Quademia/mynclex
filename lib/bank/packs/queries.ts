// mynclex/lib/bank/packs/queries.ts
//
// Read-side loaders for the readiness-pack authoring surfaces.
// Callers are BANK_CURATE-gated pages; RLS backs the same gate.

import type { SupabaseClient } from '@supabase/supabase-js';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { groupPackMembers, type WrapperMeta } from './grouping';
import type {
  PackDetail,
  PackMember,
  PackOverview,
  PackPickerData,
  PackRow,
  PickerCase,
  PickerQuestion,
  PickerTrend,
} from './types';

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
    question_type:            string;
    stem:                     string;
    difficulty:               string | null;
    client_needs_category:    string | null;
    client_needs_subcategory: string | null;
    is_published:             boolean;
    parent_case_id:           string | null;
    trend_id:                 string | null;
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
          'id, item_id, position, nclex_bank_items(question_type, stem, difficulty, client_needs_category, client_needs_subcategory, is_published, parent_case_id, trend_id)',
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
      subcategory: r.nclex_bank_items?.client_needs_subcategory ?? null,
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

/** Every pack's member subcategories in one read — feeds the list
 *  cards' blueprint-health hint (Slice ③). */
export async function loadPacksSubcats(
  supabase: SupabaseClient,
): Promise<Record<string, (string | null)[]>> {
  const { data, error } = await supabase
    .from('nclex_readiness_pack_items')
    .select('pack_id, nclex_bank_items(client_needs_subcategory)');
  if (error) throw new Error(`Could not load pack members: ${error.message}`);

  const out: Record<string, (string | null)[]> = {};
  for (const r of (data ?? []) as unknown as {
    pack_id: string;
    nclex_bank_items: { client_needs_subcategory: string | null } | null;
  }[]) {
    (out[r.pack_id] ??= []).push(r.nclex_bank_items?.client_needs_subcategory ?? null);
  }
  return out;
}

// ── Picker candidates (Slice ②b) ─────────────────────────────────────
// One-shot load when the slide-over opens; the client filters (search +
// facets) locally, prototype-style. Only PUBLISHED questions are
// offered (the publish gate wants every member published anyway, and
// the double-add badge needs a stable id). Scale note: mirrors the
// bank list's known limitation — fine to ~1000 published rows; past
// that the picker needs server-side search like the bank list will.

interface CandidateRow {
  item_id:                  string;
  stem:                     string;
  question_type:            string;
  difficulty:               string | null;
  client_needs_category:    string | null;
  client_needs_subcategory: string | null;
  nursing_subject:          string | null;
  body_system:              string | null;
  bloom_level:              string | null;
  trend_id?:                string | null;
}

export async function loadPackPicker(
  supabase: SupabaseClient,
  packId: string,
): Promise<PackPickerData> {
  const [packs, { data: linkRows, error: linkErr }] = await Promise.all([
    loadPacksOverview(supabase),
    supabase.from('nclex_readiness_pack_items').select('pack_id, item_id'),
  ]);
  if (linkErr) throw new Error(`Could not load pack memberships: ${linkErr.message}`);

  const thisPack = packs.find((p) => p.pack_id === packId);
  if (!thisPack) throw new Error('Pack not found.');
  const target = thisPack.n ?? 100;

  const numOf: Record<string, number> = {};
  for (const p of packs) numOf[p.pack_id] = p.num;

  /** item_id → 'this pack' | 'Pack N' */
  const memberOf: Record<string, string> = {};
  for (const l of (linkRows ?? []) as { pack_id: string; item_id: string }[]) {
    memberOf[l.item_id] =
      l.pack_id === packId ? 'this pack' : `Pack ${numOf[l.pack_id] ?? '?'}`;
  }

  const [
    { data: qRows, error: qErr },
    { data: caseRows, error: cErr },
    { data: trendRows, error: tErr },
  ] = await Promise.all([
    supabase
      .from('nclex_bank_items')
      .select(
        'item_id, stem, question_type, difficulty, client_needs_category, client_needs_subcategory, nursing_subject, body_system, bloom_level',
      )
      .eq('is_published', true)
      .is('parent_case_id', null)
      .is('trend_id', null)
      .order('item_id')
      .limit(1000),
    supabase
      .from('nclex_case_studies')
      .select('case_id, title')
      .eq('is_published', true)
      .order('case_id'),
    supabase
      .from('nclex_trend_datasets')
      .select('trend_id, title')
      .eq('is_published', true)
      .order('trend_id'),
  ]);
  if (qErr) throw new Error(`Could not load questions: ${qErr.message}`);
  if (cErr) throw new Error(`Could not load case studies: ${cErr.message}`);
  if (tErr) throw new Error(`Could not load trends: ${tErr.message}`);

  // Standalones already in THIS pack are on the members list — exclude;
  // other-pack members stay, badged + disabled (the double-add rule
  // made visible, not just enforced).
  const standalones: PickerQuestion[] = ((qRows ?? []) as CandidateRow[])
    .filter((r) => memberOf[r.item_id] !== 'this pack')
    .map((r) => ({
      itemId: r.item_id,
      stemLabel: richTextToPlainLabel(r.stem),
      questionType: r.question_type,
      difficulty: r.difficulty,
      category: r.client_needs_category,
      subcategory: r.client_needs_subcategory,
      subject: r.nursing_subject,
      bodySystem: r.body_system,
      bloom: r.bloom_level,
      inPack: memberOf[r.item_id] ?? null,
    }));

  // Case children (types + facet axes; ANY-child matching client-side).
  const caseIds = ((caseRows ?? []) as { case_id: string }[]).map((c) => c.case_id);
  const caseChildren: Record<
    string,
    { itemId: string; type: string; subcat: string | null; sys: string | null }[]
  > = {};
  if (caseIds.length > 0) {
    const { data: ciRows, error: ciErr } = await supabase
      .from('nclex_case_study_items')
      .select(
        'case_id, item_id, position, nclex_bank_items(question_type, client_needs_subcategory, body_system)',
      )
      .in('case_id', caseIds)
      .order('position');
    if (ciErr) throw new Error(`Could not load case members: ${ciErr.message}`);
    for (const r of (ciRows ?? []) as unknown as {
      case_id: string;
      item_id: string;
      nclex_bank_items: {
        question_type: string;
        client_needs_subcategory: string | null;
        body_system: string | null;
      } | null;
    }[]) {
      (caseChildren[r.case_id] ??= []).push({
        itemId: r.item_id,
        type: r.nclex_bank_items?.question_type ?? '?',
        subcat: r.nclex_bank_items?.client_needs_subcategory ?? null,
        sys: r.nclex_bank_items?.body_system ?? null,
      });
    }
  }

  const cases: PickerCase[] = ((caseRows ?? []) as { case_id: string; title: string }[])
    .map((c) => {
      const kids = caseChildren[c.case_id] ?? [];
      // A case is atomic — one badge for the unit; in THIS pack → excluded.
      const badges = kids.map((k) => memberOf[k.itemId]).filter(Boolean) as string[];
      return {
        caseId: c.case_id,
        title: c.title,
        childCount: kids.length,
        childTypes: kids.map((k) => k.type),
        childSubcats: [...new Set(kids.map((k) => k.subcat).filter(Boolean))] as string[],
        childSystems: [...new Set(kids.map((k) => k.sys).filter(Boolean))] as string[],
        inPack: badges[0] ?? null,
      };
    })
    .filter((c) => c.childCount > 0 && c.inPack !== 'this pack');

  // Trend children — per-question selection (§5 revision), so each
  // child carries its own badge, including 'this pack' for siblings
  // already placed here (partial membership shown honestly).
  const trendIds = ((trendRows ?? []) as { trend_id: string }[]).map((t) => t.trend_id);
  const trendChildren: Record<string, CandidateRow[]> = {};
  if (trendIds.length > 0) {
    const { data: tcRows, error: tcErr } = await supabase
      .from('nclex_bank_items')
      .select(
        'item_id, stem, question_type, difficulty, client_needs_subcategory, body_system, trend_id',
      )
      .in('trend_id', trendIds)
      .eq('is_published', true)
      .order('item_id');
    if (tcErr) throw new Error(`Could not load trend questions: ${tcErr.message}`);
    for (const r of (tcRows ?? []) as CandidateRow[]) {
      (trendChildren[r.trend_id as string] ??= []).push(r);
    }
  }

  const trends: PickerTrend[] = ((trendRows ?? []) as { trend_id: string; title: string }[])
    .map((t) => ({
      trendId: t.trend_id,
      title: t.title,
      children: (trendChildren[t.trend_id] ?? []).map((r) => ({
        itemId: r.item_id,
        stemLabel: richTextToPlainLabel(r.stem),
        questionType: r.question_type,
        difficulty: r.difficulty,
        subcategory: r.client_needs_subcategory,
        bodySystem: r.body_system,
        inPack: memberOf[r.item_id] ?? null,
      })),
    }))
    .filter((t) => t.children.length > 0);

  // Count via the link rows already in hand (this pack's members).
  const memberCount = ((linkRows ?? []) as { pack_id: string }[]).filter(
    (l) => l.pack_id === packId,
  ).length;

  return {
    target,
    remaining: Math.max(0, target - memberCount),
    standalones,
    cases,
    trends,
  };
}
