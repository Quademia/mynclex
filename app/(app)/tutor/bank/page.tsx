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
    q: (params.q ?? '').trim(),
  };
  const preservedFilterQuery = buildFilterQueryString(filters);

  // RLS on nclex_tutor_questions enforces tutor_id = auth.uid(), but
  // the explicit .eq() is belt-and-braces and makes the scope obvious
  // to the reader. parent_case_id IS NULL excludes case-linked child
  // questions (Slice 1.11b) from the standalone browse pool.
  // Slice 1.12b — FK-join to nclex_tutor_trend_datasets for the
  // trend-linked badge. Same pattern as the admin twin; tutor
  // side points at the tutor-private datasets table.
  let query = supabase
    .from('nclex_tutor_questions')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, client_needs_category, nursing_subject, body_system, tags, created_at, trend_id, trend:nclex_tutor_trend_datasets(title)',
    )
    .eq('tutor_id', user.id)
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
      .from('nclex_tutor_questions')
      .select('*', { count: 'exact', head: true })
      .eq('tutor_id', user.id)
      .is('parent_case_id', null),
  ]);

  // Supabase FK-join shape — same as the admin twin.
  type RawRow = Omit<BankRow, 'trend_title'> & {
    trend: { title: string } | null;
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
    trend_title:            r.trend?.title ?? null,
  }));
  const queryError = itemsRes.error;
  const total = totalRes.count ?? rows.length;

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
    } else if (full.parent_case_id) {
      // Case-linked child question: route to the case editor instead
      // of opening the standalone form. Slice 1.11b non-negotiable.
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
