// mynclex/app/(app)/admin/bank/all/page.tsx
//
// Admin Question Bank — thin server wrapper around the shared
// <BankListView> component.
//
// This page owns three surface-specific responsibilities:
//   1. The role gate (BANK_CURATE / SUPER_ADMIN — redirects to /admin
//      on failure).
//   2. The data fetch (nclex_bank_items, filtered + paginated).
//   3. Mounting the <EditorShell> with surface='admin' when in focus
//      mode.
//
// Everything else (browse layout, focus layout, filter bar, navigator,
// row card, URL builders, row → form-initial mapping) lives in
// mynclex/lib/bank/list-view.tsx and is shared with /tutor/bank.
//
// Surface-specific writes still happen in ./actions — the surface
// is carried through FormData on submit.
//
// Bank-list polish slice (post-1.12c): case-children and trend-
// children both appear in the list now (case exclusion removed).
// Per-row wrapper badges link to the appropriate wrapper editor;
// the ?edit= handler redirects wrapper-linked rows server-side so
// the standalone editor never opens on a wrapper child.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EditorShell } from '../editor-shell';
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

const BASE_URL = '/admin/bank/all';

export default async function AdminBankPage({
  searchParams,
}: {
  searchParams: Promise<BankSearchParams>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const permissions = (permsRes.data ?? []).map((p) => p.permission as string);

  const canCurate =
    roles.includes('SUPER_ADMIN') || permissions.includes('BANK_CURATE');

  if (!canCurate) {
    redirect('/admin/dashboard');
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
  // Case exclusion removed — case-children now render in the list,
  // protected by the ?edit= redirect below. Trend join was added in
  // 1.12b; case join is new this slice.
  //
  // FK-join aliases (`case:...` / `trend:...`) work because the
  // parent_case_id_fkey and trend_id_fkey constraints follow the
  // Supabase-default naming, so no `!constraint_name` hint is
  // needed (verified against dev pg_catalog).
  let query = supabase
    .from('nclex_bank_items')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, ' +
      'client_needs_category, nursing_subject, body_system, tags, created_at, ' +
      'parent_case_id, trend_id, ' +
      'trend:nclex_trend_datasets(title), ' +
      'case:nclex_case_studies(title)',
    )
    .order('item_id', { ascending: true })
    .limit(500);

  // Non-membership filters. Applied to the main row query AND the
  // four filtered-count queries below (via the helper).
  if (filters.type) query = query.eq('question_type', filters.type);
  if (filters.category) query = query.eq('client_needs_category', filters.category);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.status === 'published') query = query.eq('is_published', true);
  if (filters.status === 'draft') query = query.eq('is_published', false);
  if (filters.q) query = query.ilike('stem', `%${filters.q}%`);

  // Membership filter — applied to the main row query only. The
  // four filtered counts deliberately exclude this so the
  // composition row stays informative when a membership is picked.
  if (filters.membership === 'standalone') {
    query = query.is('parent_case_id', null).is('trend_id', null);
  } else if (filters.membership === 'case') {
    query = query.not('parent_case_id', 'is', null);
  } else if (filters.membership === 'trend') {
    query = query.not('trend_id', 'is', null);
  }

  // ── Composition counts (8 cheap COUNT queries) ─────────────────
  // Helper: build a count query with the non-membership filters
  // applied and an optional membership predicate. Surface-level
  // totals pass `withFilters=false`; filtered counts pass `true`.
  type MembershipBucket = 'total' | 'standalone' | 'case' | 'trend';

  function countQuery(bucket: MembershipBucket, withFilters: boolean) {
    let q = supabase
      .from('nclex_bank_items')
      .select('*', { count: 'exact', head: true });

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

  // ── Row mapping ─────────────────────────────────────────────────
  // Supabase's FK-join row shape: `case: {title} | null` and
  // `trend: {title} | null`. Fall back to the raw ID if the join
  // returns null (race condition / dataset deleted mid-query) so
  // the curator still sees the membership; a missing title is a
  // "dataset unknown" state, not an "unlinked question" state.
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
  // Check trend_id FIRST, then parent_case_id. A row shouldn't
  // carry both in practice — ON DELETE SET NULL on parent_case_id
  // and ON DELETE RESTRICT on trend_id means a trend-linked row
  // that was once also a case-child (now orphaned) still redirects
  // correctly; flag in SESSIONS.
  let initial: BankFormInitial = emptyInitial();
  let editLoadError: string | null = null;
  if (editId) {
    const { data: full, error: fullErr } = await supabase
      .from('nclex_bank_items')
      .select('*')
      .eq('item_id', editId)
      .maybeSingle<FullBankRow>();
    if (fullErr || !full) {
      editLoadError = `Could not load ${editId}.`;
    } else if (full.trend_id) {
      // Trend-linked child: open the trend editor focused on this
      // question. Slice added this slice (post-1.12c polish).
      redirect(`/admin/bank/trends/${full.trend_id}?focus=${editId}`);
    } else if (full.parent_case_id) {
      // Case-linked child question: route to the case editor
      // instead of the standalone form. Slice 1.11b non-negotiable.
      redirect(`/admin/bank/cases/${full.parent_case_id}?focus=${editId}`);
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
      surface="admin"
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
          surface="admin"
          initial={initial}
          savedFlash={savedFlash}
          cancelHref={cancelHref}
        />
      }
      savedFlash={savedFlash}
      deletedFlash={deletedFlash}
      editLoadError={editLoadError}
      queryError={queryError?.message ?? null}
      titleLabel="Question Bank"
      backHref="/admin/dashboard"
      backLabel="Admin"
      headerExtra={
        <>
          <Link href="/admin/bank/cases" className="bank-btn cs-bank-nav-link">
            Case Studies →
          </Link>
          <Link href="/admin/bank/trends" className="bank-btn cs-bank-nav-link">
            Trend datasets →
          </Link>
        </>
      }
    />
  );
}
