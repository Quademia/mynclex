// mynclex/app/(app)/admin/bank/page.tsx
//
// Admin Question Bank — driven entirely by URL state.
//
// Two modes:
//   - Browse mode  (no ?edit / ?new)  — filter bar + full-width list.
//   - Focus mode   (?edit=ID or ?new=1) — compact navigator + editor.
//
// Filters (type, category, difficulty, status, q) apply to BOTH modes.
// In focus mode the navigator reuses the filtered list, preserving the
// curator's narrowing context while they edit.
//
// Auth: gated on BANK_CURATE / SUPER_ADMIN. The page gate is a UX
// nicety — Server Actions in actions.ts re-check independently.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EditorShell } from './editor-shell';
import { BankFilters, type BankFilterValues } from './filters';
import { BankNavigator, type BankNavRow } from './navigator';
import { emptyInitial, type BankFormInitial } from '@/lib/bank/form-shape';
import type { QuestionType } from '@/lib/bank/classifications';
import type {
  BankItemContent,
  BankItemCorrect,
  BankOption,
} from '@/lib/bank/types';

export const dynamic = 'force-dynamic';

interface BankRow {
  item_id: string;
  question_type: string;
  difficulty: string | null;
  stem: string;
  is_published: boolean;
  is_free_sample: boolean;
  client_needs_category: string | null;
  nursing_subject: string | null;
  body_system: string | null;
  tags: string[] | null;
  created_at: string;
}

interface FullBankRow extends BankRow {
  rationale: string | null;
  rationale_img: string | null;
  content: BankItemContent;
  correct: BankItemCorrect;
  client_needs_subcategory: string | null;
  topic: string | null;
  subtopic: string | null;
  bloom_level: string | null;
  is_builder_visible: boolean;
  marks: number;
  shuffle_options: boolean;
  question_ref: string | null;
  batch_id: string | null;
}

interface BankSearchParams {
  edit?: string;
  new?: string;
  saved?: string;
  deleted?: string;
  type?: string;
  category?: string;
  difficulty?: string;
  status?: string;
  q?: string;
}

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

  // Build Supabase query with any active filters.
  let query = supabase
    .from('nclex_bank_items')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, client_needs_category, nursing_subject, body_system, tags, created_at',
    )
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
      .select('*', { count: 'exact', head: true }),
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
    } else {
      initial = rowToInitial(full);
    }
  }

  const savedFlash = params.saved === '1';
  const deletedFlash = params.deleted === '1';

  if (inFocusMode) {
    return renderFocusMode({
      rows,
      activeId: editId,
      initial,
      savedFlash,
      editLoadError,
      preservedFilterQuery,
    });
  }

  return renderBrowseMode({
    rows,
    total,
    filters,
    preservedFilterQuery,
    deletedFlash,
    queryError: queryError?.message ?? null,
  });
}

// ─────────────────────────────────────────────────────────────
// Browse mode — filter bar + full-width card list.
// ─────────────────────────────────────────────────────────────

function renderBrowseMode({
  rows,
  total,
  filters,
  preservedFilterQuery,
  deletedFlash,
  queryError,
}: {
  rows: BankRow[];
  total: number;
  filters: BankFilterValues;
  preservedFilterQuery: string;
  deletedFlash: boolean;
  queryError: string | null;
}) {
  const newHref = preservedFilterQuery
    ? `/admin/bank?new=1&${preservedFilterQuery}`
    : '/admin/bank?new=1';

  return (
    <main className="dash-main">
      <section className="dash-card dash-card--wide">
        <div className="bank-header-row">
          <Link href="/admin" className="bank-back-link">
            ← Admin
          </Link>
        </div>

        <div className="bank-browse-header">
          <div>
            <h1 className="dash-title">Question Bank</h1>
            <p className="dash-subtitle">
              {rows.length} of {total} question{total === 1 ? '' : 's'}
            </p>
          </div>
          <Link href={newHref} className="bank-btn bank-btn-primary">
            + New
          </Link>
        </div>

        {queryError && (
          <div className="dash-note bank-error">
            <strong>Could not load questions.</strong> {queryError}
          </div>
        )}

        {deletedFlash && (
          <div className="dash-note">
            <strong>Deleted.</strong> The question has been removed.
          </div>
        )}

        <BankFilters values={filters} />

        {rows.length === 0 ? (
          <div className="dash-note">
            <strong>No questions match these filters.</strong>{' '}
            <Link href="/admin/bank">Reset</Link> to see everything.
          </div>
        ) : (
          <div className="bank-row-list">
            {rows.map((r) => (
              <BrowseRow
                key={r.item_id}
                row={r}
                preservedFilterQuery={preservedFilterQuery}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function BrowseRow({
  row,
  preservedFilterQuery,
}: {
  row: BankRow;
  preservedFilterQuery: string;
}) {
  const editHref = preservedFilterQuery
    ? `/admin/bank?edit=${row.item_id}&${preservedFilterQuery}`
    : `/admin/bank?edit=${row.item_id}`;

  const metaParts: string[] = [];
  if (row.client_needs_category) metaParts.push(row.client_needs_category);
  if (row.body_system) metaParts.push(row.body_system);
  if (row.nursing_subject) metaParts.push(row.nursing_subject);

  return (
    <article className="bank-row-card">
      <div className="bank-row-header">
        <span className="bank-row-id">{row.item_id}</span>
        <span className="bank-badge bank-badge-type">{row.question_type}</span>
        {row.difficulty && (
          <span className="bank-row-diff">{row.difficulty}</span>
        )}
        {row.is_published ? (
          <span className="bank-badge bank-badge-published">Published</span>
        ) : (
          <span className="bank-badge bank-badge-draft">Draft</span>
        )}
        {row.is_free_sample && (
          <span className="bank-badge bank-badge-free">Free</span>
        )}
      </div>
      <div className="bank-row-stem">{row.stem}</div>
      {metaParts.length > 0 && (
        <div className="bank-row-meta">{metaParts.join(' · ')}</div>
      )}
      {row.tags && row.tags.length > 0 && (
        <div className="bank-row-tags">
          {row.tags.map((t) => (
            <span key={t} className="bank-row-tag">{t}</span>
          ))}
        </div>
      )}
      <div className="bank-row-actions">
        <Link href={editHref} className="bank-btn bank-btn-ghost bank-btn-sm">
          Edit
        </Link>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────
// Focus mode — compact navigator + editor form.
// ─────────────────────────────────────────────────────────────

function renderFocusMode({
  rows,
  activeId,
  initial,
  savedFlash,
  editLoadError,
  preservedFilterQuery,
}: {
  rows: BankRow[];
  activeId: string | null;
  initial: BankFormInitial;
  savedFlash: boolean;
  editLoadError: string | null;
  preservedFilterQuery: string;
}) {
  const navRows: BankNavRow[] = rows.map((r) => ({
    item_id: r.item_id,
    question_type: r.question_type,
    difficulty: r.difficulty,
    stem: r.stem,
  }));

  const cancelHref = preservedFilterQuery
    ? `/admin/bank?${preservedFilterQuery}`
    : '/admin/bank';

  return (
    <main className="dash-main">
      <section className="dash-card dash-card--wide">
        <div className="bank-focus">
          <BankNavigator
            rows={navRows}
            activeId={activeId}
            preservedFilterQuery={preservedFilterQuery}
          />

          <div className="bank-focus-main">
            {editLoadError && (
              <div className="dash-note bank-error">
                <strong>{editLoadError}</strong> It may have been deleted.{' '}
                <Link href="/admin/bank">Start fresh</Link>.
              </div>
            )}

            <EditorShell
              initial={initial}
              savedFlash={savedFlash}
              cancelHref={cancelHref}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildFilterQueryString(filters: BankFilterValues): string {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.category) params.set('category', filters.category);
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.status) params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  return params.toString();
}

// Map a DB row into the form's initial-values shape.
// Pulls option list + correct-ids out of the polymorphic JSONB.
function rowToInitial(row: FullBankRow): BankFormInitial {
  const qtype = row.question_type as QuestionType;

  const rawOptions: BankOption[] = Array.isArray((row.content as { options?: BankOption[] })?.options)
    ? ((row.content as { options: BankOption[] }).options ?? [])
    : [];
  const feedbackMap: Record<string, string> = (row.correct as { feedback?: Record<string, string> })?.feedback ?? {};

  const options = rawOptions.map((o) => ({
    id: o.id,
    text: o.text,
    feedback: feedbackMap[o.id] ?? '',
  }));

  let correct_ids: string[] = [];
  if (qtype === 'MCQ' || qtype === 'TF') {
    const ans = (row.correct as { answer?: string })?.answer;
    if (ans) correct_ids = [ans];
  } else {
    correct_ids = (row.correct as { answers?: string[] })?.answers ?? [];
  }

  const select_count = qtype === 'SELECT_N'
    ? Number((row.content as { select_count?: number })?.select_count ?? correct_ids.length ?? 2)
    : 2;

  // Matrix fields
  let matrix_row_label = '';
  let matrix_rows: { id: string; text: string; feedback: string }[] = [];
  let matrix_columns: { id: string; text: string }[] = [];
  let matrix_correct: Record<string, string> = {};

  if (qtype === 'MATRIX') {
    const mc = row.content as { row_label?: string; rows?: { id: string; text: string }[]; columns?: { id: string; text: string }[] };
    const mk = row.correct as { cells?: Record<string, string>; feedback?: Record<string, string> };

    matrix_row_label = mc.row_label ?? '';
    const fbMap = mk.feedback ?? {};
    matrix_rows = (mc.rows ?? []).map((r) => ({
      id: r.id,
      text: r.text,
      feedback: fbMap[r.id] ?? '',
    }));
    matrix_columns = (mc.columns ?? []).map((c) => ({ id: c.id, text: c.text }));
    matrix_correct = { ...(mk.cells ?? {}) };
  }

  return {
    item_id: row.item_id,
    question_type: qtype,
    stem: row.stem,
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    options,
    correct_ids,
    select_count,
    matrix_row_label,
    matrix_rows,
    matrix_columns,
    matrix_correct,
    client_needs_category: row.client_needs_category ?? '',
    client_needs_subcategory: row.client_needs_subcategory ?? '',
    nursing_subject: row.nursing_subject ?? '',
    body_system: row.body_system ?? '',
    topic: row.topic ?? '',
    subtopic: row.subtopic ?? '',
    difficulty: row.difficulty ?? '',
    bloom_level: row.bloom_level ?? '',
    tags: (row.tags ?? []).join(', '),
    is_published: !!row.is_published,
    is_free_sample: !!row.is_free_sample,
    is_builder_visible: row.is_builder_visible !== false,
    marks: Number(row.marks) || 1,
    shuffle_options: row.shuffle_options !== false,
    question_ref: row.question_ref ?? '',
    batch_id: row.batch_id ?? '',
  };
}
