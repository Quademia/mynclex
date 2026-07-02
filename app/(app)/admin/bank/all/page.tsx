// mynclex/app/(app)/admin/bank/all/page.tsx
//
// Admin Question Bank list. Reads nclex_bank_items, renders the
// authoring list with filters / composition counts / per-row actions.
//
//   - Modal-based editor for standalone rows (no `?edit=` focus mode).
//   - "+ New question" → type picker → matching editor in create mode.
//   - Wrapper-linked rows show with badges ("In case · {title}" /
//     "Trend · {title}") and link to the wrapper page with
//     ?focus=<item_id>; standalone modal never opens for them.
//   - Top section: filter bar, composition counts, nav links.
//   - No pagination yet. Hard-cap at 500 rows.

import Link from 'next/link';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import {
  BankListClient,
  type BankListRowSummary,
} from '@/lib/bank/bank-list-client';
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
  emptyDragDropInitial,
  dragDropRowToInitial,
  type DragDropDbRow,
  type DragDropEditorInitial,
} from '@/lib/bank/editors/drag-drop-row-mapper';
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
import { loadAuthorship } from '@/lib/audit/authorship';

export const dynamic = 'force-dynamic';

const BASE_URL = '/admin/bank/all';

interface FullBankRow extends McqDbRow {
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

export default async function AdminBankAllPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const filters = parseBankFilters(sp);
  const view = parseBankView(sp);
  const loadAll = bankViewLoadsAll(view);
  const hasAnyFilter = hasAnyBankFilter(filters);

  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  // ── Main row query ─────────────────────────────────────────
  let query = supabase
    .from('nclex_bank_items')
    .select(
      MCQ_ROW_COLUMNS +
      ', parent_case_id, trend_id, parent_note_id, updated_at, ' +
      'trend:nclex_trend_datasets(title), ' +
      'case:nclex_case_studies(title)',
    );

  // All the non-membership filters + scoped search (shared helper).
  query = applyBankFilters(query, filters);

  // Membership filter (OR across the chosen kinds) — applied to the main
  // query only. The composition-count queries below deliberately exclude
  // it so all four chips stay informative when a membership is picked.
  query = applyMembershipFilter(query, filters.membership);

  // Server-side pagination: by default load one page (BANK_PAGE_SIZE) via
  // .range(); a sort or group loads the whole matched set (≤ BANK_MAX_ROWS)
  // so the client can sort/group it correctly.
  const ordered = query.order('item_id', { ascending: true });
  const { data, error } = await (
    loadAll ? ordered.limit(BANK_MAX_ROWS) : ordered.range(0, view.limit - 1)
  ).returns<FullBankRow[]>();

  // Total rows matching the current filters — drives "Showing X of Y" +
  // whether a "Load more" is offered.
  let filteredCountQuery = supabase
    .from('nclex_bank_items')
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
  const mk = () => supabase.from('nclex_bank_items').select('*', { count: 'exact', head: true });
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

  const summaryRows: BankListRowSummary[] = fullRows.map((r) => ({
    item_id:        r.item_id,
    question_type:  r.question_type as QuestionType,
    stem:           richTextToPlain(r.stem),
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
    // No admin library yet — origin badge stays unresolved (hidden).
    parent_note_id: r.parent_note_id ?? null,
    note_title:     null,
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
  const dragDropInitialsById:  Record<string, DragDropEditorInitial>  = {};
  const dragClozeInitialsById: Record<string, DragClozeEditorInitial> = {};
  const dragOrderInitialsById: Record<string, DragOrderEditorInitial> = {};
  for (const row of fullRows) {
    if (row.question_type === 'MCQ') {
      mcqInitialsById[row.item_id] = mcqRowToInitial(row, 'admin');
    } else if (row.question_type === 'TF') {
      tfInitialsById[row.item_id] = tfRowToInitial(row, 'admin');
    } else if (row.question_type === 'SATA') {
      sataInitialsById[row.item_id] = sataRowToInitial(row as unknown as SataDbRow, 'admin');
    } else if (row.question_type === 'SELECT_N') {
      selectNInitialsById[row.item_id] = selectNRowToInitial(row as unknown as SelectNDbRow, 'admin');
    } else if (row.question_type === 'MATRIX') {
      matrixInitialsById[row.item_id] = matrixRowToInitial(row as unknown as MatrixDbRow, 'admin');
    } else if (row.question_type === 'MATRIX_MR') {
      matrixMrInitialsById[row.item_id] = matrixMrRowToInitial(row as unknown as MatrixMrDbRow, 'admin');
    } else if (row.question_type === 'BOWTIE') {
      bowtieInitialsById[row.item_id] = bowtieRowToInitial(row as unknown as BowtieDbRow, 'admin');
    } else if (row.question_type === 'CLOZE') {
      clozeInitialsById[row.item_id] = clozeRowToInitial(row as unknown as ClozeDbRow, 'admin');
    } else if (row.question_type === 'HIGHLIGHT') {
      highlightInitialsById[row.item_id] = highlightRowToInitial(row as unknown as HighlightDbRow, 'admin');
    } else if (row.question_type === 'DRAG_DROP') {
      dragDropInitialsById[row.item_id] = dragDropRowToInitial(row as unknown as DragDropDbRow, 'admin');
    } else if (row.question_type === 'DRAG_CLOZE') {
      dragClozeInitialsById[row.item_id] = dragClozeRowToInitial(row as unknown as DragClozeDbRow, 'admin');
    } else if (row.question_type === 'DRAG_ORDER') {
      dragOrderInitialsById[row.item_id] = dragOrderRowToInitial(row as unknown as DragOrderDbRow, 'admin');
    }
  }

  // Authorship facts per question (each row's own bank_item history).
  const authorship = await loadAuthorship(
    supabase, 'admin', 'bank_item', summaryRows.map((r) => r.item_id),
  );

  // Distinct tags for the Tag filter (all questions, not just this page).
  const { data: tagRows } = await supabase.from('nclex_bank_items').select('tags');
  const tagOptions = Array.from(
    new Set((tagRows ?? []).flatMap((r) => (r.tags as string[] | null) ?? [])),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        {/* Back-link row — mirrors legacy. */}
        <header className="bl-page-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip admin"><span className="dot" />Admin bank</span>
              Authoring
            </div>
            <h1 className="bl-page-title">Question Bank</h1>
            <p className="bl-page-sub">
              Every standalone and wrapper-linked question in the shared bank.
              Filter, scan status, and jump straight into an editor.
            </p>
          </div>
          <div className="bl-head-actions">
            <Link href="/admin/dashboard" className="bl-btn">← Admin</Link>
            <Link href="/admin/bank/cases" className="bl-btn">Case Studies →</Link>
            <Link href="/admin/bank/trends" className="bl-btn">Trend datasets →</Link>
          </div>
        </header>

        <BankBand counts={bandCounts} filters={filters} baseUrl={BASE_URL} />

        {error && (
          <p className="auth-sandbox-error">
            Could not load the bank: {error.message}
          </p>
        )}

        <BankListClient
          surface="admin"
          rows={summaryRows}
          authorshipById={authorship}
          hasAnyFilter={hasAnyFilter}
          baseUrl={BASE_URL}
          filters={filters}
          tagOptions={tagOptions}
          view={view}
          filteredTotal={filteredTotal}
          mcqInitialsById={mcqInitialsById}
          emptyMcqInitial={emptyMcqInitial('admin')}
          tfInitialsById={tfInitialsById}
          emptyTfInitial={emptyTfInitial('admin')}
          sataInitialsById={sataInitialsById}
          emptySataInitial={emptySataInitial('admin')}
          selectNInitialsById={selectNInitialsById}
          emptySelectNInitial={emptySelectNInitial('admin')}
          matrixInitialsById={matrixInitialsById}
          emptyMatrixInitial={emptyMatrixInitial('admin')}
          matrixMrInitialsById={matrixMrInitialsById}
          emptyMatrixMrInitial={emptyMatrixMrInitial('admin')}
          bowtieInitialsById={bowtieInitialsById}
          emptyBowtieInitial={emptyBowtieInitial('admin')}
          clozeInitialsById={clozeInitialsById}
          emptyClozeInitial={emptyClozeInitial('admin')}
          highlightInitialsById={highlightInitialsById}
          emptyHighlightInitial={emptyHighlightInitial('admin')}
          dragDropInitialsById={dragDropInitialsById}
          emptyDragDropInitial={emptyDragDropInitial('admin')}
          dragClozeInitialsById={dragClozeInitialsById}
          emptyDragClozeInitial={emptyDragClozeInitial('admin')}
          dragOrderInitialsById={dragOrderInitialsById}
          emptyDragOrderInitial={emptyDragOrderInitial('admin')}
        />
      </div>
    </main>
  );
}
