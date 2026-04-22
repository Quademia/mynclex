// mynclex/lib/bank/list-view.tsx
//
// Shared list view for the bank authoring surface. Used by both
// /admin/bank (QAcademy-owned questions → nclex_bank_items) and
// /tutor/bank (tutor-private questions → nclex_tutor_questions).
//
// Extracted from app/(app)/admin/bank/page.tsx in Slice 2.1.
//
// The server page does its own role gate + data fetch, then hands the
// already-fetched rows + an optional pre-built <EditorShell> element
// to this component. Surface-specific state lives in the page:
//
//   - surface        → 'admin' | 'tutor' (for copy + analytics hooks)
//   - baseUrl        → '/admin/bank' | '/tutor/bank' (all link hrefs)
//   - editor         → a ReactNode rendered in focus mode
//
// Two rendering modes, driven purely by URL state:
//   - Browse mode (no ?edit / ?new): filter bar + full-width card list.
//   - Focus mode (?edit=ID or ?new=1): compact navigator + editor.
//
// Also exports:
//   - rowToInitial(row) → converts a DB row into BankFormInitial for
//     the editor shell. Works for both nclex_bank_items and
//     nclex_tutor_questions (shape is parallel per schema.sql).
//   - buildFilterQueryString(filters) → shared URL builder.
//   - types: BankRow, FullBankRow, BankSearchParams.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BankFilters, type BankFilterValues } from './filters';
import { BankNavigator, type BankNavRow } from './navigator';
import { emptyInitial, type BankFormInitial } from './form-shape';
import type { QuestionType } from './classifications';
import type { BankItemContent, BankItemCorrect, BankOption } from './types';

export type BankSurface = 'admin' | 'tutor';

export interface BankRow {
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

export interface FullBankRow extends BankRow {
  instruction: string | null;
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

export interface BankSearchParams {
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

export interface BankListViewProps {
  surface: BankSurface;
  baseUrl: string;
  rows: BankRow[];
  total: number;
  filters: BankFilterValues;
  preservedFilterQuery: string;
  inFocusMode: boolean;
  activeId: string | null;
  editor: ReactNode;
  savedFlash: boolean;
  deletedFlash: boolean;
  editLoadError: string | null;
  queryError: string | null;
  titleLabel?: string;   // "Question Bank" (admin) or "My Questions" (tutor)
  backHref?: string;     // the chrome back-link destination
  backLabel?: string;    // the chrome back-link label
}

export function BankListView(props: BankListViewProps) {
  if (props.inFocusMode) {
    return renderFocusMode(props);
  }
  return renderBrowseMode(props);
}

// ─────────────────────────────────────────────────────────────
// Browse mode — filter bar + full-width card list.
// ─────────────────────────────────────────────────────────────

function renderBrowseMode(props: BankListViewProps) {
  const {
    baseUrl,
    rows,
    total,
    filters,
    preservedFilterQuery,
    deletedFlash,
    queryError,
    titleLabel = 'Question Bank',
    backHref,
    backLabel,
  } = props;

  const newHref = preservedFilterQuery
    ? `${baseUrl}?new=1&${preservedFilterQuery}`
    : `${baseUrl}?new=1`;

  return (
    <main className="dash-main">
      <section className="dash-card dash-card--wide">
        {backHref && (
          <div className="bank-header-row">
            <Link href={backHref} className="bank-back-link">
              ← {backLabel ?? 'Back'}
            </Link>
          </div>
        )}

        <div className="bank-browse-header">
          <div>
            <h1 className="dash-title">{titleLabel}</h1>
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

        <BankFilters values={filters} baseUrl={baseUrl} />

        {rows.length === 0 ? (
          <div className="dash-note">
            <strong>No questions match these filters.</strong>{' '}
            <Link href={baseUrl}>Reset</Link> to see everything.
          </div>
        ) : (
          <div className="bank-row-list">
            {rows.map((r) => (
              <BrowseRow
                key={r.item_id}
                row={r}
                baseUrl={baseUrl}
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
  baseUrl,
  preservedFilterQuery,
}: {
  row: BankRow;
  baseUrl: string;
  preservedFilterQuery: string;
}) {
  const editHref = preservedFilterQuery
    ? `${baseUrl}?edit=${row.item_id}&${preservedFilterQuery}`
    : `${baseUrl}?edit=${row.item_id}`;

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
// Focus mode — compact navigator + editor (passed in as a prop).
// ─────────────────────────────────────────────────────────────

function renderFocusMode(props: BankListViewProps) {
  const {
    baseUrl,
    rows,
    activeId,
    preservedFilterQuery,
    editLoadError,
    editor,
  } = props;

  const navRows: BankNavRow[] = rows.map((r) => ({
    item_id: r.item_id,
    question_type: r.question_type,
    difficulty: r.difficulty,
    stem: r.stem,
  }));

  return (
    <main className="dash-main">
      <section className="dash-card dash-card--wide">
        <div className="bank-focus">
          <BankNavigator
            rows={navRows}
            activeId={activeId}
            preservedFilterQuery={preservedFilterQuery}
            baseUrl={baseUrl}
          />

          <div className="bank-focus-main">
            {editLoadError && (
              <div className="dash-note bank-error">
                <strong>{editLoadError}</strong> It may have been deleted.{' '}
                <Link href={baseUrl}>Start fresh</Link>.
              </div>
            )}

            {editor}
          </div>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function buildFilterQueryString(filters: BankFilterValues): string {
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
//
// Works for both nclex_bank_items and nclex_tutor_questions — the
// columns referenced (item_id, question_type, stem, content, correct,
// classification fields, housekeeping flags) are identical between the
// two tables per schema.sql.
export function rowToInitial(row: FullBankRow): BankFormInitial {
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

  // Bow-tie fields
  let bowtie_left_label   = '';
  let bowtie_left_tokens: { id: string; text: string; feedback: string; correct: boolean }[] = [];
  let bowtie_centre_label = '';
  let bowtie_centre_tokens: { id: string; text: string; feedback: string; correct: boolean }[] = [];
  let bowtie_right_label  = '';
  let bowtie_right_tokens: { id: string; text: string; feedback: string; correct: boolean }[] = [];

  // Cloze fields — persisted cards always reload with in_stem=true
  // (the parser guarantees only active cards are saved).
  let cloze_blanks: {
    id: string;
    choices: { id: string; text: string; feedback: string }[];
    correct_id: string;
    in_stem: boolean;
  }[] = [];

  // Highlight fields — persisted chunks always reload with
  // in_passage=true. Decision is 'correct' if the chunk ID is in
  // correct_ids, otherwise 'wrong' — a saved HIGHLIGHT can never
  // have an 'undecided' chunk (the parser rejects that at save time).
  let highlight_chunks: {
    id: string;
    text: string;
    decision: 'correct' | 'wrong' | 'undecided';
    feedback: string;
    in_passage: boolean;
  }[] = [];

  // Drag-drop fields — defaults mirror emptyInitial(). Persisted rows
  // only store active slots (parser drops orphans), so reloading them
  // is a direct content.slots + correct.slots + correct.feedback merge.
  let dd_subtype: 'ORDERED' | 'SENTENCE' = 'ORDERED';
  let dd_slots: {
    id: string;
    target_text: string;
    assigned_token_id: string;
    feedback: string;
  }[] = [];
  let dd_tokens: { id: string; text: string }[] = [];

  if (qtype === 'BOWTIE') {
    const bc = row.content as {
      left?:   { label?: string; tokens?: { id: string; text: string }[] };
      centre?: { label?: string; tokens?: { id: string; text: string }[] };
      right?:  { label?: string; tokens?: { id: string; text: string }[] };
    };
    const bk = row.correct as {
      left?: string[];
      centre?: string;
      right?: string[];
      feedback?: Record<string, string>;
    };

    const fbMap = bk.feedback ?? {};
    const leftCorrect   = new Set(bk.left ?? []);
    const centreCorrect = bk.centre ?? '';
    const rightCorrect  = new Set(bk.right ?? []);

    bowtie_left_label = bc.left?.label ?? '';
    bowtie_left_tokens = (bc.left?.tokens ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      feedback: fbMap[t.id] ?? '',
      correct: leftCorrect.has(t.id),
    }));

    bowtie_centre_label = bc.centre?.label ?? '';
    bowtie_centre_tokens = (bc.centre?.tokens ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      feedback: fbMap[t.id] ?? '',
      correct: t.id === centreCorrect,
    }));

    bowtie_right_label = bc.right?.label ?? '';
    bowtie_right_tokens = (bc.right?.tokens ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      feedback: fbMap[t.id] ?? '',
      correct: rightCorrect.has(t.id),
    }));
  }

  if (qtype === 'CLOZE') {
    const cc = row.content as { blanks?: { id: string; choices: { id: string; text: string }[] }[] };
    const ck = row.correct as {
      answers?: Record<string, string>;
      feedback?: Record<string, Record<string, string>>;
    };
    const answers = ck.answers ?? {};
    const fbNested = ck.feedback ?? {};
    cloze_blanks = (cc.blanks ?? []).map((b) => {
      const fbForBlank = fbNested[b.id] ?? {};
      return {
        id: b.id,
        choices: b.choices.map((c) => ({
          id: c.id,
          text: c.text,
          feedback: fbForBlank[c.id] ?? '',
        })),
        correct_id: answers[b.id] ?? (b.choices[0]?.id ?? 'c1'),
        in_stem: true,
      };
    });
  }

  if (qtype === 'HIGHLIGHT') {
    const hc = row.content as { chunks?: { id: string; text: string }[] };
    const hk = row.correct as {
      correct_ids?: string[];
      feedback?: Record<string, string>;
    };
    const correctSet = new Set(hk.correct_ids ?? []);
    const fbMap = hk.feedback ?? {};
    highlight_chunks = (hc.chunks ?? []).map((ch) => ({
      id: ch.id,
      text: ch.text,
      decision: correctSet.has(ch.id) ? 'correct' : 'wrong',
      feedback: fbMap[ch.id] ?? '',
      in_passage: true,
    }));
  }

  if (qtype === 'DRAG_DROP') {
    const dc = row.content as {
      subtype?: 'ORDERED' | 'SENTENCE';
      slots?: { id: string; target_text?: string }[];
      tokens?: { id: string; text: string }[];
    };
    const dk = row.correct as {
      slots?: Record<string, string>;
      feedback?: Record<string, string>;
    };
    dd_subtype = dc.subtype === 'SENTENCE' ? 'SENTENCE' : 'ORDERED';
    dd_tokens = (dc.tokens ?? []).map((t) => ({ id: t.id, text: t.text }));
    const answers = dk.slots ?? {};
    const fbMap = dk.feedback ?? {};
    dd_slots = (dc.slots ?? []).map((s) => ({
      id: s.id,
      target_text: s.target_text ?? '',
      assigned_token_id: answers[s.id] ?? '',
      feedback: fbMap[s.id] ?? '',
    }));
  }

  return {
    item_id: row.item_id,
    instruction: row.instruction ?? '',
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
    bowtie_left_label,
    bowtie_left_tokens,
    bowtie_centre_label,
    bowtie_centre_tokens,
    bowtie_right_label,
    bowtie_right_tokens,
    cloze_blanks,
    highlight_chunks,
    dd_subtype,
    dd_slots,
    dd_tokens,
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

// Re-export emptyInitial for symmetry with rowToInitial so callers
// only need to import from list-view.
export { emptyInitial };
