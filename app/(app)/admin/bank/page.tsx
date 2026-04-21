// mynclex/app/(app)/admin/bank/page.tsx
//
// Admin Question Bank — split-panel layout.
//
// Left:  list of every bank item (read access scoped by RLS).
// Right: authoring form (create by default; edit when ?edit=ID is set).
//
// Auth: gated on BANK_CURATE / SUPER_ADMIN. The page gate is a UX
// nicety — Server Actions in actions.ts re-check independently.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BankForm } from './form';
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
  tags: string[] | null;
  created_at: string;
}

interface FullBankRow extends BankRow {
  rationale: string | null;
  rationale_img: string | null;
  content: BankItemContent;
  correct: BankItemCorrect;
  client_needs_subcategory: string | null;
  nursing_subject: string | null;
  body_system: string | null;
  topic: string | null;
  subtopic: string | null;
  bloom_level: string | null;
  is_builder_visible: boolean;
  marks: number;
  shuffle_options: boolean;
  question_ref: string | null;
  batch_id: string | null;
}

export default async function AdminBankPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; saved?: string; deleted?: string }>;
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
  const savedFlash = params.saved === '1';

  const { data: items, error } = await supabase
    .from('nclex_bank_items')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, client_needs_category, tags, created_at',
    )
    .order('item_id', { ascending: true })
    .limit(500);

  const rows: BankRow[] = items ?? [];
  const total = rows.length;
  const published = rows.filter((r) => r.is_published).length;
  const drafts = total - published;

  // If editing, load that single row in full.
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

  return (
    <main className="dash-main">
      <section className="dash-card dash-card--wide">
        <div className="dash-header">
          <div className="bank-header-row">
            <Link href="/admin" className="bank-back-link">
              ← Admin
            </Link>
          </div>
          <h1 className="dash-title">Question Bank</h1>
          <p className="dash-subtitle">
            {total} question{total === 1 ? '' : 's'} · {published} published ·{' '}
            {drafts} draft{drafts === 1 ? '' : 's'}
          </p>
        </div>

        {error && (
          <div className="dash-note bank-error">
            <strong>Could not load questions.</strong> {error.message}
          </div>
        )}

        {params.deleted === '1' && (
          <div className="dash-note">
            <strong>Deleted.</strong> The question has been removed.
          </div>
        )}

        {editLoadError && (
          <div className="dash-note bank-error">
            <strong>{editLoadError}</strong> It may have been deleted.{' '}
            <Link href="/admin/bank">Start fresh</Link>.
          </div>
        )}

        <div className="bank-split">
          {/* LEFT: list */}
          <div className="bank-split-list">
            {rows.length === 0 ? (
              <div className="dash-note">
                <strong>No questions yet.</strong> Use the form on the right to
                add the first one.
              </div>
            ) : (
              <div className="bank-list">
                {rows.map((r) => {
                  const isActive = r.item_id === editId;
                  return (
                    <Link
                      key={r.item_id}
                      href={`/admin/bank?edit=${r.item_id}`}
                      className={`bank-list-item${isActive ? ' bank-list-item--active' : ''}`}
                    >
                      <div className="bank-list-item-top">
                        <span className="bank-list-id">{r.item_id}</span>
                        <span className="bank-badge bank-badge-type">
                          {r.question_type}
                        </span>
                        {r.is_published ? (
                          <span className="bank-badge bank-badge-published">
                            Published
                          </span>
                        ) : (
                          <span className="bank-badge bank-badge-draft">Draft</span>
                        )}
                      </div>
                      <div className="bank-list-stem">{r.stem}</div>
                      <div className="bank-list-meta">
                        {r.client_needs_category ?? '—'}
                        {r.difficulty ? ` · ${r.difficulty}` : ''}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: form */}
          <div className="bank-split-form">
            <BankForm initial={initial} savedFlash={savedFlash} />
          </div>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Map a DB row into the form's initial-values shape.
// Pulls option list + correct-ids out of the polymorphic JSONB.
// ─────────────────────────────────────────────────────────────

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

  return {
    item_id: row.item_id,
    question_type: qtype,
    stem: row.stem,
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    options,
    correct_ids,
    select_count,
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
