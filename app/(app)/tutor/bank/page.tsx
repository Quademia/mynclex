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
  // to the reader.
  let query = supabase
    .from('nclex_tutor_questions')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, client_needs_category, nursing_subject, body_system, tags, created_at',
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

  const [itemsRes, totalRes] = await Promise.all([
    query,
    supabase
      .from('nclex_tutor_questions')
      .select('*', { count: 'exact', head: true })
      .eq('tutor_id', user.id),
  ]);

  const rows: BankRow[] = itemsRes.data ?? [];
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
    />
  );
}
