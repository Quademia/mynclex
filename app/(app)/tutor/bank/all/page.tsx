// mynclex/app/(app)/tutor/bank/all/page.tsx
//
// Tutor twin of /admin/bank/all. Same component tree, different
// table (nclex_tutor_questions) and surface ('tutor'). Auth is gated
// by /tutor/layout.tsx via requireTutor() above this page; the
// server actions re-check independently and RLS enforces
// tutor_id = auth.uid() at the DB layer regardless.

import Link from 'next/link';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  BankListClient,
  type BankListRowSummary,
} from '@/lib/bank/bank-list-client';
import { loadAuthorship } from '@/lib/audit/authorship';
import {
  parseBankFilters,
  parseBankView,
  bankViewLoadsAll,
  applyBankFilters,
  applyMembershipFilter,
  hasAnyBankFilter,
  BANK_MAX_ROWS,
} from '@/lib/bank/bank-list-query';
import { BankBand, type BankBandCounts } from '@/lib/bank/bank-band';
import {
  emptyMcqInitial,
  mcqRowToInitial,
  MCQ_ROW_COLUMNS,
  type McqDbRow,
  type McqEditorInitial,
} from '@/lib/bank/editors/mcq-row-mapper';
import {
  emptyTfInitial,
  tfRowToInitial,
  type TfEditorInitial,
} from '@/lib/bank/editors/tf-row-mapper';
import {
  emptySataInitial,
  sataRowToInitial,
  type SataDbRow,
  type SataEditorInitial,
} from '@/lib/bank/editors/sata-row-mapper';
import {
  emptySelectNInitial,
  selectNRowToInitial,
  type SelectNDbRow,
  type SelectNEditorInitial,
} from '@/lib/bank/editors/select-n-row-mapper';
import {
  emptyMatrixInitial,
  matrixRowToInitial,
  type MatrixDbRow,
  type MatrixEditorInitial,
} from '@/lib/bank/editors/matrix-row-mapper';
import {
  emptyMatrixMrInitial,
  matrixMrRowToInitial,
  type MatrixMrDbRow,
  type MatrixMrEditorInitial,
} from '@/lib/bank/editors/matrix-mr-row-mapper';
import {
  emptyBowtieInitial,
  bowtieRowToInitial,
  type BowtieDbRow,
  type BowtieEditorInitial,
} from '@/lib/bank/editors/bowtie-row-mapper';
import {
  emptyClozeInitial,
  clozeRowToInitial,
  type ClozeDbRow,
  type ClozeEditorInitial,
} from '@/lib/bank/editors/cloze-row-mapper';
import {
  emptyHighlightInitial,
  highlightRowToInitial,
  type HighlightDbRow,
  type HighlightEditorInitial,
} from '@/lib/bank/editors/highlight-row-mapper';
import {
  emptyDragClozeInitial,
  dragClozeRowToInitial,
  type DragClozeDbRow,
  type DragClozeEditorInitial,
} from '@/lib/bank/editors/drag-cloze-row-mapper';
import {
  emptyDragOrderInitial,
  dragOrderRowToInitial,
  type DragOrderDbRow,
  type DragOrderEditorInitial,
} from '@/lib/bank/editors/drag-order-row-mapper';
import type { QuestionType } from '@/lib/bank/classifications';

export const dynamic = 'force-dynamic';

const BASE_URL = '/tutor/bank/all';

interface FullTutorBankRow extends McqDbRow {
  parent_case_id: string | null;
  trend_id:       string | null;
  parent_note_id: string | null;
  updated_at:     string;
  case:  { title: string } | null;
  trend: { title: string } | null;
}

interface PageProps {
  searchParams?: Promise<Record<string, string | undefined>>;
}

export default async function TutorBankAllPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const filters = parseBankFilters(sp);
  const view = parseBankView(sp);
  const loadAll = bankViewLoadsAll(view);
  const hasAnyFilter = hasAnyBankFilter(filters);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // ── Main row query ─────────────────────────────────────────
  // RLS on nclex_tutor_questions filters to tutor_id = auth.uid().
  let query = supabase
    .from('nclex_tutor_questions')
    .select(
      MCQ_ROW_COLUMNS +
      ', parent_case_id, trend_id, parent_note_id, updated_at, ' +
      'trend:nclex_tutor_trend_datasets(title), ' +
      'case:nclex_tutor_case_studies(title)',
    );

  // All the non-membership filters + scoped search (shared helper).
  query = applyBankFilters(query, filters);

  // Membership filter (OR across the chosen kinds) — main query only.
  query = applyMembershipFilter(query, filters.membership);

  // Server-side pagination: default loads one page (BANK_PAGE_SIZE) via
  // .range(); a sort or group loads the whole matched set (≤ BANK_MAX_ROWS)
  // so the client can sort/group it correctly.
  const ordered = query.order('item_id', { ascending: true });
  const { data, error } = await (
    loadAll ? ordered.limit(BANK_MAX_ROWS) : ordered.range(0, view.limit - 1)
  ).returns<FullTutorBankRow[]>();

  // Total rows matching the current filters — drives "Showing X of Y" + Load more.
  let filteredCountQuery = supabase
    .from('nclex_tutor_questions')
    .select('*', { count: 'exact', head: true });
  filteredCountQuery = applyBankFilters(filteredCountQuery, filters);
  filteredCountQuery = applyMembershipFilter(filteredCountQuery, filters.membership);
  const { count: filteredCount } = await filteredCountQuery;
  const filteredTotal = filteredCount ?? 0;

  // ── Band counts (whole-bank; the cards describe the population they
  //    filter into, so they ignore the active filters — the "Showing X of
  //    Y" line carries the filtered count). Eight parallel head-counts.
  //    Composition buckets are mutually exclusive: note-born = has a
  //    parent note AND no case/trend; standalone = none of the three.
  const mk = () => supabase.from('nclex_tutor_questions').select('*', { count: 'exact', head: true });
  const [
    cTotal, cStandalone, cCase, cTrend, cNote, cPublished, cDrafts, cFree,
  ] = await Promise.all([
    mk(),
    mk().is('parent_case_id', null).is('trend_id', null).is('parent_note_id', null),
    mk().not('parent_case_id', 'is', null),
    mk().not('trend_id', 'is', null),
    mk().not('parent_note_id', 'is', null).is('parent_case_id', null).is('trend_id', null),
    mk().eq('is_published', true),
    mk().eq('is_published', false),
    mk().eq('is_free_sample', true),
  ]);

  const bandCounts: BankBandCounts = {
    total:       cTotal.count     ?? 0,
    composition: {
      standalone: cStandalone.count ?? 0,
      case:       cCase.count       ?? 0,
      trend:      cTrend.count      ?? 0,
      note:       cNote.count       ?? 0,
    },
    published: cPublished.count ?? 0,
    drafts:    cDrafts.count    ?? 0,
    free:      cFree.count      ?? 0,
  };

  // ── Row mapping + per-type initials ────────────────────────
  const fullRows = data ?? [];

  // Resolve the source-note titles for the "Note · {title}" origin badge
  // on questions born inside a library note (parent_note_id).
  const noteIds = Array.from(
    new Set(fullRows.map((r) => r.parent_note_id).filter((x): x is string => Boolean(x))),
  );
  const noteTitleById: Record<string, string> = {};
  if (noteIds.length > 0) {
    const { data: noteRows } = await supabase
      .from('nclex_tutor_library_notes')
      .select('note_id, title')
      .in('note_id', noteIds);
    for (const n of (noteRows ?? []) as { note_id: string; title: string }[]) {
      noteTitleById[n.note_id] = n.title;
    }
  }

  const summaryRows: BankListRowSummary[] = fullRows.map((r) => ({
    item_id:        r.item_id,
    question_type:  r.question_type as QuestionType,
    stem:           richTextToPlainLabel(r.stem),
    instruction:    r.instruction ? richTextToPlain(r.instruction) : null,
    difficulty:     r.difficulty,
    is_published:   r.is_published,
    is_free_sample: r.is_free_sample,
    marks:          r.marks ?? 1,
    category:       r.client_needs_category ?? null,
    subcategory:    r.client_needs_subcategory ?? null,
    subject:        r.nursing_subject ?? null,
    bodySystem:     r.body_system ?? null,
    updated_at:     r.updated_at,
    parent_case_id: r.parent_case_id,
    case_title:     r.case?.title ?? null,
    trend_id:       r.trend_id,
    trend_title:    r.trend?.title ?? null,
    parent_note_id: r.parent_note_id ?? null,
    note_title:     r.parent_note_id ? (noteTitleById[r.parent_note_id] ?? null) : null,
  }));

  const mcqInitialsById:       Record<string, McqEditorInitial>       = {};
  const tfInitialsById:        Record<string, TfEditorInitial>        = {};
  const sataInitialsById:      Record<string, SataEditorInitial>      = {};
  const selectNInitialsById:   Record<string, SelectNEditorInitial>   = {};
  const matrixInitialsById:    Record<string, MatrixEditorInitial>    = {};
  const matrixMrInitialsById:  Record<string, MatrixMrEditorInitial>  = {};
  const bowtieInitialsById:    Record<string, BowtieEditorInitial>    = {};
  const clozeInitialsById:     Record<string, ClozeEditorInitial>     = {};
  const highlightInitialsById: Record<string, HighlightEditorInitial> = {};
  const dragClozeInitialsById: Record<string, DragClozeEditorInitial> = {};
  const dragOrderInitialsById: Record<string, DragOrderEditorInitial> = {};
  for (const row of fullRows) {
    if (row.question_type === 'MCQ') {
      mcqInitialsById[row.item_id] = mcqRowToInitial(row, 'tutor');
    } else if (row.question_type === 'TF') {
      tfInitialsById[row.item_id] = tfRowToInitial(row, 'tutor');
    } else if (row.question_type === 'SATA') {
      sataInitialsById[row.item_id] = sataRowToInitial(row as unknown as SataDbRow, 'tutor');
    } else if (row.question_type === 'SELECT_N') {
      selectNInitialsById[row.item_id] = selectNRowToInitial(row as unknown as SelectNDbRow, 'tutor');
    } else if (row.question_type === 'MATRIX') {
      matrixInitialsById[row.item_id] = matrixRowToInitial(row as unknown as MatrixDbRow, 'tutor');
    } else if (row.question_type === 'MATRIX_MR') {
      matrixMrInitialsById[row.item_id] = matrixMrRowToInitial(row as unknown as MatrixMrDbRow, 'tutor');
    } else if (row.question_type === 'BOWTIE') {
      bowtieInitialsById[row.item_id] = bowtieRowToInitial(row as unknown as BowtieDbRow, 'tutor');
    } else if (row.question_type === 'CLOZE') {
      clozeInitialsById[row.item_id] = clozeRowToInitial(row as unknown as ClozeDbRow, 'tutor');
    } else if (row.question_type === 'HIGHLIGHT') {
      highlightInitialsById[row.item_id] = highlightRowToInitial(row as unknown as HighlightDbRow, 'tutor');
    } else if (row.question_type === 'DRAG_CLOZE') {
      dragClozeInitialsById[row.item_id] = dragClozeRowToInitial(row as unknown as DragClozeDbRow, 'tutor');
    } else if (row.question_type === 'DRAG_ORDER') {
      dragOrderInitialsById[row.item_id] = dragOrderRowToInitial(row as unknown as DragOrderDbRow, 'tutor');
    }
  }

  // Authorship facts per question (each row's own tutor_question history).
  const authorship = await loadAuthorship(
    supabase, 'tutor', 'tutor_question', summaryRows.map((r) => r.item_id),
  );

  // Distinct tags for the Tag filter (the tutor's own questions; RLS-scoped).
  const { data: tagRows } = await supabase.from('nclex_tutor_questions').select('tags');
  const tagOptions = Array.from(
    new Set((tagRows ?? []).flatMap((r) => (r.tags as string[] | null) ?? [])),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="bl-page-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip tutor"><span className="dot" />Tutor bank</span>
              Authoring
            </div>
            <h1 className="bl-page-title">My Bank</h1>
            <p className="bl-page-sub">
              Every standalone and wrapper-linked question in your private bank.
              Filter, scan status, and jump straight into an editor.
            </p>
          </div>
          <div className="bl-head-actions">
            <Link href="/tutor" className="bl-btn">← Tutor</Link>
            <Link href="/tutor/bank/cases" className="bl-btn">Case Studies →</Link>
            <Link href="/tutor/bank/trends" className="bl-btn">Trend datasets →</Link>
          </div>
        </header>

        <BankBand counts={bandCounts} filters={filters} baseUrl={BASE_URL} />

        {error && (
          <p className="auth-sandbox-error">
            Could not load your bank: {error.message}
          </p>
        )}

        <BankListClient
          surface="tutor"
          rows={summaryRows}
          authorshipById={authorship}
          hasAnyFilter={hasAnyFilter}
          baseUrl={BASE_URL}
          filters={filters}
          tagOptions={tagOptions}
          view={view}
          filteredTotal={filteredTotal}
          mcqInitialsById={mcqInitialsById}
          emptyMcqInitial={emptyMcqInitial('tutor')}
          tfInitialsById={tfInitialsById}
          emptyTfInitial={emptyTfInitial('tutor')}
          sataInitialsById={sataInitialsById}
          emptySataInitial={emptySataInitial('tutor')}
          selectNInitialsById={selectNInitialsById}
          emptySelectNInitial={emptySelectNInitial('tutor')}
          matrixInitialsById={matrixInitialsById}
          emptyMatrixInitial={emptyMatrixInitial('tutor')}
          matrixMrInitialsById={matrixMrInitialsById}
          emptyMatrixMrInitial={emptyMatrixMrInitial('tutor')}
          bowtieInitialsById={bowtieInitialsById}
          emptyBowtieInitial={emptyBowtieInitial('tutor')}
          clozeInitialsById={clozeInitialsById}
          emptyClozeInitial={emptyClozeInitial('tutor')}
          highlightInitialsById={highlightInitialsById}
          emptyHighlightInitial={emptyHighlightInitial('tutor')}
          dragClozeInitialsById={dragClozeInitialsById}
          emptyDragClozeInitial={emptyDragClozeInitial('tutor')}
          dragOrderInitialsById={dragOrderInitialsById}
          emptyDragOrderInitial={emptyDragOrderInitial('tutor')}
        />
      </div>
    </main>
  );
}
