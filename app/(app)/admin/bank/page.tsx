// mynclex/app/(app)/admin/bank/page.tsx
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

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EditorShell } from './editor-shell';
import {
  BankListView,
  buildFilterQueryString,
  emptyInitial,
  rowToInitial,
  type BankRow,
  type BankSearchParams,
  type FullBankRow,
} from '@/lib/bank/list-view';
import type { BankFilterValues } from '@/lib/bank/filters';
import type { BankFormInitial } from '@/lib/bank/form-shape';

export const dynamic = 'force-dynamic';

const BASE_URL = '/admin/bank';

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
    redirect('/admin');
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
    q: (params.q ?? '').trim(),
  };
  const preservedFilterQuery = buildFilterQueryString(filters);

  // Build Supabase query with any active filters. parent_case_id IS
  // NULL excludes case-linked child questions (Slice 1.11b) from the
  // standalone browse pool — they're editable only via the case
  // editor so listing them here would dead-end the curator's edit
  // click.
  let query = supabase
    .from('nclex_bank_items')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, client_needs_category, nursing_subject, body_system, tags, created_at',
    )
    .is('parent_case_id', null)
    .order('item_id', { ascending: true })
    .limit(500);

  if (filters.type) query = query.eq('question_type', filters.type);
  if (filters.category) query = query.eq('client_needs_category', filters.category);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.status === 'published') query = query.eq('is_published', true);
  if (filters.status === 'draft') query = query.eq('is_published', false);
  if (filters.q) query = query.ilike('stem', `%${filters.q}%`);

  const [itemsRes, totalRes] = await Promise.all([
    query,
    supabase
      .from('nclex_bank_items')
      .select('*', { count: 'exact', head: true })
      .is('parent_case_id', null),
  ]);

  const rows: BankRow[] = itemsRes.data ?? [];
  const queryError = itemsRes.error;
  const total = totalRes.count ?? rows.length;

  // Load single full row when editing.
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
    } else if (full.parent_case_id) {
      // Case-linked child question: route to the case editor instead
      // of opening the standalone form. Slice 1.11b non-negotiable.
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
      backHref="/admin"
      backLabel="Admin"
      headerExtra={
        <>
          <Link href="/admin/bank/cases" className="bank-btn cs-bank-nav-link">
            Case Studies →
          </Link>
          <Link href="/admin/trends" className="bank-btn cs-bank-nav-link">
            Trend datasets →
          </Link>
        </>
      }
    />
  );
}
