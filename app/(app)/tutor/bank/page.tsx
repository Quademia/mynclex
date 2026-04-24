// mynclex/app/(app)/tutor/bank/page.tsx
//
// Tutor Question Bank — thin server wrapper around the shared
// <BankListView> component. Mirrors /admin/bank but reads from
// nclex_tutor_questions instead of nclex_bank_items, and mounts the
// <EditorShell> with surface='tutor' so writes go to the tutor table.
//
// Role gating lives in the parent /tutor/layout.tsx. This page trusts
// that gate — but the Server Actions (./admin/bank/actions.ts) re-check
// TUTOR independently, and RLS on nclex_tutor_questions enforces
// tutor_id = auth.uid() at the database layer regardless.
//
// Added in Slice 2.1 as the reusability proof for the bank authoring
// stack: the 8 per-type editors, the 8 parsers, form-shape.ts, and the
// shell + actions are all shared with /admin/bank.
//
// Bank-list polish slice (post-1.12c): case-children and trend-
// children both appear in the list now. See the admin twin for the
// full rationale; this file mirrors every change against the tutor
// tables.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
// Import EditorShell from the admin path — it's the shared shell for
// both surfaces. Cross-import is deliberate: the shell ships with
// actions.ts alongside it, and those actions are surface-aware via the
// FormData 'surface' field. See Slice 2.1 SESSIONS entry.
import { EditorShell } from '@/app/(app)/admin/bank/editor-shell';
import {
  BankListView,
  buildFilterQueryString,
  emptyInitial,
  rowToInitial,
  type BankCompositionCounts,
  type BankRow,
  type BankSearchParams,
  type FullBankRow,
} from '@/lib/bank/list-view';
import type { BankFilterValues } from '@/lib/bank/filters';
import type { BankFormInitial } from '@/lib/bank/form-shape';

export const dynamic = 'force-dynamic';

const BASE_URL = '/tutor/bank';

export default async function TutorBankPage({
  searchParams,
}: {
  searchParams: Promise<BankSearchParams>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // (app) layout + tutor layout already gate. Defensive fallback.
  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;
  const editId = params.edit ?? null;
  const newMode = params.new === '1';
  const inFocusMode = editId !== null || newMode;

  const filters: BankFilterValues = {
    type: params.type ?? '',
    category: params.category ?? '',
    difficulty: params.difficulty ?? '',
    status: params.status ?? '',
    membership: params.membership ?? '',
    q: (params.q ?? '').trim(),
  };
  const preservedFilterQuery = buildFilterQueryString(filters);

  // ── Main query ──────────────────────────────────────────────────
  // RLS on nclex_tutor_questions enforces tutor_id = auth.uid(), but
  // the explicit .eq() is belt-and-braces and makes the scope obvious
  // to the reader. Case exclusion removed; case-children now appear
  // in the list, protected by the ?edit= redirect below.
  let query = supabase
    .from('nclex_tutor_questions')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, ' +
      'client_needs_category, nursing_subject, body_system, tags, created_at, ' +
      'parent_case_id, trend_id, ' +
      'trend:nclex_tutor_trend_datasets(title), ' +
      'case:nclex_tutor_case_studies(title)',
    )
    .eq('tutor_id', user.id)
    .order('item_id', { ascending: true })
    .limit(500);

  if (filters.type) query = query.eq('question_type', filters.type);
  if (filters.category) query = query.eq('client_needs_category', filters.category);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.status === 'published') query = query.eq('is_published', true);
  if (filters.status === 'draft') query = query.eq('is_published', false);
  if (filters.q) query = query.ilike('stem', `%${filters.q}%`);

  if (filters.membership === 'standalone') {
    query = query.is('parent_case_id', null).is('trend_id', null);
  } else if (filters.membership === 'case') {
    query = query.not('parent_case_id', 'is', null);
  } else if (filters.membership === 'trend') {
    query = query.not('trend_id', 'is', null);
  }

  // ── Composition counts ─────────────────────────────────────────
  // Mirror of the admin helper; scoped to this tutor's rows.
  type MembershipBucket = 'total' | 'standalone' | 'case' | 'trend';

  function countQuery(bucket: MembershipBucket, withFilters: boolean) {
    let q = supabase
      .from('nclex_tutor_questions')
      .select('*', { count: 'exact', head: true })
      .eq('tutor_id', user!.id);

    if (bucket === 'standalone') {
      q = q.is('parent_case_id', null).is('trend_id', null);
    } else if (bucket === 'case') {
      q = q.not('parent_case_id', 'is', null);
    } else if (bucket === 'trend') {
      q = q.not('trend_id', 'is', null);
    }

    if (withFilters) {
      if (filters.type) q = q.eq('question_type', filters.type);
      if (filters.category) q = q.eq('client_needs_category', filters.category);
      if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
      if (filters.status === 'published') q = q.eq('is_published', true);
      if (filters.status === 'draft') q = q.eq('is_published', false);
      if (filters.q) q = q.ilike('stem', `%${filters.q}%`);
    }
    return q;
  }

  const [
    itemsRes,
    totalTotal,
    totalStandalone,
    totalCase,
    totalTrend,
    filteredTotal,
    filteredStandalone,
    filteredCase,
    filteredTrend,
  ] = await Promise.all([
    query,
    countQuery('total',      false),
    countQuery('standalone', false),
    countQuery('case',       false),
    countQuery('trend',      false),
    countQuery('total',      true),
    countQuery('standalone', true),
    countQuery('case',       true),
    countQuery('trend',      true),
  ]);

  const counts: BankCompositionCounts = {
    total:       { filtered: filteredTotal.count      ?? 0, total: totalTotal.count      ?? 0 },
    standalone:  { filtered: filteredStandalone.count ?? 0, total: totalStandalone.count ?? 0 },
    caseLinked:  { filtered: filteredCase.count       ?? 0, total: totalCase.count       ?? 0 },
    trendLinked: { filtered: filteredTrend.count      ?? 0, total: totalTrend.count      ?? 0 },
  };

  // ── Row mapping (FK-join fallback as admin twin) ───────────────
  type RawRow = Omit<BankRow, 'trend_title' | 'case_title'> & {
    trend: { title: string } | null;
    case:  { title: string } | null;
  };
  const rawRows = (itemsRes.data ?? []) as unknown as RawRow[];
  const rows: BankRow[] = rawRows.map((r) => ({
    item_id:                r.item_id,
    question_type:          r.question_type,
    difficulty:             r.difficulty,
    stem:                   r.stem,
    is_published:           r.is_published,
    is_free_sample:         r.is_free_sample,
    client_needs_category:  r.client_needs_category,
    nursing_subject:        r.nursing_subject,
    body_system:            r.body_system,
    tags:                   r.tags,
    created_at:             r.created_at,
    parent_case_id:         r.parent_case_id,
    trend_id:               r.trend_id,
    trend_title:
      r.trend?.title ??
      (r.trend_id ? r.trend_id : null),
    case_title:
      r.case?.title ??
      (r.parent_case_id ? r.parent_case_id : null),
  }));
  const queryError = itemsRes.error;
  const total = counts.total.filtered;

  // ── Focus-mode load + wrapper redirects ────────────────────────
  let initial: BankFormInitial = emptyInitial();
  let editLoadError: string | null = null;
  if (editId) {
    const { data: full, error: fullErr } = await supabase
      .from('nclex_tutor_questions')
      .select('*')
      .eq('item_id', editId)
      .eq('tutor_id', user.id)
      .maybeSingle<FullBankRow>();
    if (fullErr || !full) {
      editLoadError = `Could not load ${editId}.`;
    } else if (full.trend_id) {
      redirect(`/tutor/trends/${full.trend_id}?focus=${editId}`);
    } else if (full.parent_case_id) {
      redirect(`/tutor/bank/cases/${full.parent_case_id}?focus=${editId}`);
    } else {
      initial = rowToInitial(full);
    }
  }

  const savedFlash = params.saved === '1';
  const deletedFlash = params.deleted === '1';

  const cancelHref = preservedFilterQuery
    ? `${BASE_URL}?${preservedFilterQuery}`
    : BASE_URL;

  return (
    <BankListView
      surface="tutor"
      baseUrl={BASE_URL}
      rows={rows}
      total={total}
      counts={counts}
      filters={filters}
      preservedFilterQuery={preservedFilterQuery}
      inFocusMode={inFocusMode}
      activeId={editId}
      editor={
        <EditorShell
          surface="tutor"
          initial={initial}
          savedFlash={savedFlash}
          cancelHref={cancelHref}
        />
      }
      savedFlash={savedFlash}
      deletedFlash={deletedFlash}
      editLoadError={editLoadError}
      queryError={queryError?.message ?? null}
      titleLabel="My Questions"
      backHref="/tutor"
      backLabel="Tutor"
      headerExtra={
        <>
          <Link href="/tutor/bank/cases" className="bank-btn cs-bank-nav-link">
            Case Studies →
          </Link>
          <Link href="/tutor/trends" className="bank-btn cs-bank-nav-link">
            Trend datasets →
          </Link>
        </>
      }
    />
  );
}
