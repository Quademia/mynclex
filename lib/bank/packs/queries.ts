// mynclex/lib/bank/packs/queries.ts
//
// Read-side loaders for the readiness-pack authoring surfaces.
// Callers are BANK_CURATE-gated pages; RLS backs the same gate.

import type { SupabaseClient } from '@supabase/supabase-js';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import type { Authorship } from '@/lib/audit/authorship';
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
  ReservedRow,
  ReservedStock,
} from './types';

const PACK_COLUMNS =
  'pack_id, title, description, n, time_limit_sec, published, status';

/** "Pack N" from the id suffix (NCLEX_PACK_00004 → 4) — STABLE across
 *  deletions, unlike row order (a delete must never renumber the
 *  survivors; settled 2026-07-08). */
export function packNumFromId(packId: string): number {
  const m = /_(\d+)$/.exec(packId);
  return m ? parseInt(m[1], 10) : 0;
}

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

  return ((packRows ?? []) as PackRow[]).map((p) => ({
    ...p,
    num: packNumFromId(p.pack_id),
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

/**
 * Header authorship facts for one pack — "created by" from the pack
 * row's audit entry, "last edited by" from the newest event across the
 * WHOLE pack story (settings edits AND membership adds/moves/removals),
 * so the header agrees with the History drawer's top entry (Option B,
 * settled 2026-07-08). Caller is the BANK_CURATE-gated detail page;
 * the log's RLS backs the same gate.
 */
export async function loadPackAuthorship(
  supabase: SupabaseClient,
  packId: string,
): Promise<Authorship> {
  const [{ data: packEvents }, { data: newestMember }] = await Promise.all([
    supabase
      .from('nclex_audit_log')
      .select('action, changed_by_name, changed_at')
      .eq('entity_type', 'readiness_pack')
      .eq('entity_id', packId)
      .order('changed_at', { ascending: true }),
    supabase
      .from('nclex_audit_log')
      .select('action, changed_by_name, changed_at')
      .eq('entity_type', 'readiness_pack_item')
      .like('entity_id', `${packId}:%`)
      .order('changed_at', { ascending: false })
      .limit(1),
  ]);

  type Ev = { action: string; changed_by_name: string | null; changed_at: string };
  const pack = (packEvents ?? []) as Ev[];
  const member = ((newestMember ?? []) as Ev[])[0] ?? null;

  const created = pack.find((e) => e.action === 'created') ?? null;
  const newestPack = pack.length > 0 ? pack[pack.length - 1] : null;
  const newest =
    newestPack && member
      ? (member.changed_at > newestPack.changed_at ? member : newestPack)
      : (member ?? newestPack);

  return {
    createdByName:    created?.changed_by_name ?? null,
    createdAt:        created?.changed_at ?? null,
    lastEditedByName: newest?.changed_by_name ?? null,
    lastEditedAt:     newest?.changed_at ?? null,
    // Any event beyond the pack's own creation row counts as an edit —
    // adding a question IS editing the pack.
    hasEdits:         pack.length > 1 || member !== null,
    hasAny:           pack.length > 0 || member !== null,
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

// ── Reserved-stock lens (Slice ③) ────────────────────────────────────
// The "how far to 500" bookkeeping view. Union of three sources so it
// can't drift: readiness-TAGGED questions (own tag), children of
// readiness-tagged CASES (wrapper-tag inheritance), and every pack
// MEMBER (the link table is authoritative for assignment). The picker
// stamps tag+flags on add, so in practice members are tagged — the
// union is the no-drift backstop.

const RESERVED_TAG = 'readiness';

interface ReservedItemRow {
  item_id:                  string;
  stem:                     string;
  question_type:            string;
  difficulty:               string | null;
  client_needs_subcategory: string | null;
  is_published:             boolean;
  is_builder_visible:       boolean;
  parent_case_id:           string | null;
  trend_id:                 string | null;
}

const RESERVED_ITEM_COLUMNS =
  'item_id, stem, question_type, difficulty, client_needs_subcategory, is_published, is_builder_visible, parent_case_id, trend_id';

export async function loadReservedStock(
  supabase: SupabaseClient,
): Promise<ReservedStock> {
  const [packs, { data: linkRows, error: linkErr }] = await Promise.all([
    loadPacksOverview(supabase),
    supabase.from('nclex_readiness_pack_items').select('pack_id, item_id'),
  ]);
  if (linkErr) throw new Error(`Could not load pack memberships: ${linkErr.message}`);

  const numOf: Record<string, number> = {};
  for (const p of packs) numOf[p.pack_id] = p.num;
  const packNumByItem: Record<string, number> = {};
  for (const l of (linkRows ?? []) as { pack_id: string; item_id: string }[]) {
    packNumByItem[l.item_id] = numOf[l.pack_id] ?? 0;
  }

  // Source 1+2 seeds: tagged questions + tagged cases (children inherit).
  const [{ data: taggedItems, error: tiErr }, { data: taggedCases, error: tcErr }] =
    await Promise.all([
      supabase
        .from('nclex_bank_items')
        .select(RESERVED_ITEM_COLUMNS)
        .contains('tags', [RESERVED_TAG]),
      supabase
        .from('nclex_case_studies')
        .select('case_id, is_builder_visible')
        .contains('tags', [RESERVED_TAG]),
    ]);
  if (tiErr) throw new Error(`Could not load reserved questions: ${tiErr.message}`);
  if (tcErr) throw new Error(`Could not load reserved cases: ${tcErr.message}`);

  const byId: Record<string, ReservedItemRow> = {};
  for (const r of (taggedItems ?? []) as ReservedItemRow[]) byId[r.item_id] = r;

  // Children of the tagged cases.
  const taggedCaseIds = ((taggedCases ?? []) as { case_id: string }[]).map((c) => c.case_id);
  if (taggedCaseIds.length > 0) {
    const { data: caseChildRows, error } = await supabase
      .from('nclex_bank_items')
      .select(RESERVED_ITEM_COLUMNS)
      .in('parent_case_id', taggedCaseIds);
    if (error) throw new Error(`Could not load case questions: ${error.message}`);
    for (const r of (caseChildRows ?? []) as ReservedItemRow[]) byId[r.item_id] = r;
  }

  // Source 3 backstop: pack members not caught by a tag.
  const missingMemberIds = Object.keys(packNumByItem).filter((id) => !byId[id]);
  if (missingMemberIds.length > 0) {
    const { data: memberRows, error } = await supabase
      .from('nclex_bank_items')
      .select(RESERVED_ITEM_COLUMNS)
      .in('item_id', missingMemberIds);
    if (error) throw new Error(`Could not load pack members: ${error.message}`);
    for (const r of (memberRows ?? []) as ReservedItemRow[]) byId[r.item_id] = r;
  }

  // Case children's effective builder-visibility = the CASE row's flag
  // (per-entity rule). Fetch flags for every parent case we touch.
  const parentCaseIds = [
    ...new Set(
      Object.values(byId)
        .map((r) => r.parent_case_id)
        .filter(Boolean),
    ),
  ] as string[];
  const caseVisible: Record<string, boolean> = {};
  for (const c of (taggedCases ?? []) as { case_id: string; is_builder_visible: boolean }[]) {
    caseVisible[c.case_id] = c.is_builder_visible;
  }
  const unknownCaseIds = parentCaseIds.filter((id) => !(id in caseVisible));
  if (unknownCaseIds.length > 0) {
    const { data: caseRows, error } = await supabase
      .from('nclex_case_studies')
      .select('case_id, is_builder_visible')
      .in('case_id', unknownCaseIds);
    if (error) throw new Error(`Could not load case flags: ${error.message}`);
    for (const c of (caseRows ?? []) as { case_id: string; is_builder_visible: boolean }[]) {
      caseVisible[c.case_id] = c.is_builder_visible;
    }
  }

  const rows: ReservedRow[] = Object.values(byId)
    .map((r) => ({
      itemId: r.item_id,
      questionType: r.question_type,
      stemLabel: richTextToPlainLabel(r.stem),
      difficulty: r.difficulty,
      subcategory: r.client_needs_subcategory,
      isPublished: r.is_published,
      isBuilderVisible: r.parent_case_id
        ? (caseVisible[r.parent_case_id] ?? true)
        : r.is_builder_visible,
      source: (r.parent_case_id ? 'case' : r.trend_id ? 'trend' : 'standalone') as
        | 'standalone'
        | 'case'
        | 'trend',
      wrapperId: r.parent_case_id ?? r.trend_id ?? null,
      packNum: packNumByItem[r.item_id] ?? null,
    }))
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

  return {
    rows,
    target: packs.reduce((a, p) => a + (p.n ?? 100), 0),
    packNums: packs.map((p) => p.num),
  };
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
