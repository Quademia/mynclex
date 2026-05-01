// mynclex/app/(app)/admin/bank/all-v2/page.tsx
//
// Admin Question Bank list — v2. Lives alongside the legacy
// /admin/bank/all (which keeps working unchanged) until slice 14
// swaps them.
//
// Differences vs legacy:
//   - Modal-based editor (no `?edit=` focus mode) for standalone rows.
//   - "+ New question" → type picker → matching editor in create mode.
//   - Wrapper-linked rows show with badges ("In case · {title}" /
//     "Trend · {title}") and link to the wrapper page with
//     ?focus=<item_id>; standalone modal never opens for them.
//   - Top section ports the legacy filter bar, composition counts,
//     and nav links — mirrors the legacy page's UX 1:1.
//   - No pagination yet. Hard-cap at 500 rows like legacy.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import {
  BankListV2Client,
  type BankListV2RowSummary,
} from '@/lib/authoring/bank-list-v2-client';
import {
  BankFiltersV2,
  type BankFilterValuesV2,
} from '@/lib/authoring/bank-filters-v2';
import {
  BankCountsV2,
  type BankCompositionCountsV2,
} from '@/lib/authoring/bank-counts-v2';
import {
  emptyMcqInitial,
  mcqRowToInitial,
  MCQ_ROW_COLUMNS,
  type McqDbRow,
  type McqEditorInitial,
} from '@/lib/authoring/editors/mcq-row-mapper';
import {
  emptyTfInitial,
  tfRowToInitial,
  type TfEditorInitial,
} from '@/lib/authoring/editors/tf-row-mapper';
import {
  emptySataInitial,
  sataRowToInitial,
  type SataDbRow,
  type SataEditorInitial,
} from '@/lib/authoring/editors/sata-row-mapper';
import {
  emptySelectNInitial,
  selectNRowToInitial,
  type SelectNDbRow,
  type SelectNEditorInitial,
} from '@/lib/authoring/editors/select-n-row-mapper';
import {
  emptyMatrixInitial,
  matrixRowToInitial,
  type MatrixDbRow,
  type MatrixEditorInitial,
} from '@/lib/authoring/editors/matrix-row-mapper';
import {
  emptyBowtieInitial,
  bowtieRowToInitial,
  type BowtieDbRow,
  type BowtieEditorInitial,
} from '@/lib/authoring/editors/bowtie-row-mapper';
import {
  emptyClozeInitial,
  clozeRowToInitial,
  type ClozeDbRow,
  type ClozeEditorInitial,
} from '@/lib/authoring/editors/cloze-row-mapper';
import {
  emptyHighlightInitial,
  highlightRowToInitial,
  type HighlightDbRow,
  type HighlightEditorInitial,
} from '@/lib/authoring/editors/highlight-row-mapper';
import {
  emptyDragDropInitial,
  dragDropRowToInitial,
  type DragDropDbRow,
  type DragDropEditorInitial,
} from '@/lib/authoring/editors/drag-drop-row-mapper';
import type { QuestionType } from '@/lib/authoring/classifications';

export const dynamic = 'force-dynamic';

const BASE_URL = '/admin/bank/all-v2';

interface FullBankRow extends McqDbRow {
  parent_case_id: string | null;
  trend_id:       string | null;
  case:  { title: string } | null;
  trend: { title: string } | null;
}

interface PageProps {
  searchParams?: Promise<{
    type?:       string;
    category?:   string;
    difficulty?: string;
    status?:     string;
    membership?: string;
    q?:          string;
  }>;
}

export default async function AdminBankAllV2Page({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const filters: BankFilterValuesV2 = {
    type:       sp.type       ?? '',
    category:   sp.category   ?? '',
    difficulty: sp.difficulty ?? '',
    status:     sp.status     ?? '',
    membership: sp.membership ?? '',
    q:          sp.q          ?? '',
  };
  const hasAnyFilter =
    filters.type !== '' ||
    filters.category !== '' ||
    filters.difficulty !== '' ||
    filters.status !== '' ||
    filters.membership !== '' ||
    filters.q !== '';

  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  // ── Main row query ─────────────────────────────────────────
  let query = supabase
    .from('nclex_bank_items')
    .select(
      MCQ_ROW_COLUMNS +
      ', parent_case_id, trend_id, ' +
      'trend:nclex_trend_datasets(title), ' +
      'case:nclex_case_studies(title)',
    )
    .order('item_id', { ascending: true })
    .limit(500);

  // Non-membership filters.
  if (filters.type)       query = query.eq('question_type', filters.type);
  if (filters.category)   query = query.eq('client_needs_category', filters.category);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.status === 'published') query = query.eq('is_published', true);
  if (filters.status === 'draft')     query = query.eq('is_published', false);
  if (filters.q) query = query.ilike('stem', `%${filters.q}%`);

  // Membership filter — applied to the main query only. The four
  // composition-count queries below deliberately exclude this so all
  // four chips stay informative when a membership is picked.
  if (filters.membership === 'standalone') {
    query = query.is('parent_case_id', null).is('trend_id', null);
  } else if (filters.membership === 'case') {
    query = query.not('parent_case_id', 'is', null);
  } else if (filters.membership === 'trend') {
    query = query.not('trend_id', 'is', null);
  }

  const { data, error } = await query.returns<FullBankRow[]>();

  // ── Composition counts (4 buckets × 2: total + filtered) ──
  type MembershipBucket = 'total' | 'standalone' | 'case' | 'trend';
  const buildCountQuery = (
    bucket: MembershipBucket,
    applyNonMembership: boolean,
  ) => {
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
    if (applyNonMembership) {
      if (filters.type)       q = q.eq('question_type', filters.type);
      if (filters.category)   q = q.eq('client_needs_category', filters.category);
      if (filters.difficulty) q = q.eq('difficulty', filters.difficulty);
      if (filters.status === 'published') q = q.eq('is_published', true);
      if (filters.status === 'draft')     q = q.eq('is_published', false);
      if (filters.q) q = q.ilike('stem', `%${filters.q}%`);
    }
    return q;
  };

  const [
    totalAll, totalStandalone, totalCase, totalTrend,
    filteredAll, filteredStandalone, filteredCase, filteredTrend,
  ] = await Promise.all([
    buildCountQuery('total',      false),
    buildCountQuery('standalone', false),
    buildCountQuery('case',       false),
    buildCountQuery('trend',      false),
    buildCountQuery('total',      true),
    buildCountQuery('standalone', true),
    buildCountQuery('case',       true),
    buildCountQuery('trend',      true),
  ]);

  const counts: BankCompositionCountsV2 = {
    total:       { filtered: filteredAll.count        ?? 0, total: totalAll.count        ?? 0 },
    standalone:  { filtered: filteredStandalone.count ?? 0, total: totalStandalone.count ?? 0 },
    caseLinked:  { filtered: filteredCase.count       ?? 0, total: totalCase.count       ?? 0 },
    trendLinked: { filtered: filteredTrend.count      ?? 0, total: totalTrend.count      ?? 0 },
  };

  // ── Row mapping + per-type initials ────────────────────────
  const fullRows = data ?? [];

  const summaryRows: BankListV2RowSummary[] = fullRows.map((r) => ({
    item_id:        r.item_id,
    question_type:  r.question_type as QuestionType,
    stem:           r.stem ?? '',
    difficulty:     r.difficulty,
    is_published:   r.is_published,
    is_free_sample: r.is_free_sample,
    parent_case_id: r.parent_case_id,
    case_title:     r.case?.title ?? null,
    trend_id:       r.trend_id,
    trend_title:    r.trend?.title ?? null,
  }));

  const mcqInitialsById:       Record<string, McqEditorInitial>       = {};
  const tfInitialsById:        Record<string, TfEditorInitial>        = {};
  const sataInitialsById:      Record<string, SataEditorInitial>      = {};
  const selectNInitialsById:   Record<string, SelectNEditorInitial>   = {};
  const matrixInitialsById:    Record<string, MatrixEditorInitial>    = {};
  const bowtieInitialsById:    Record<string, BowtieEditorInitial>    = {};
  const clozeInitialsById:     Record<string, ClozeEditorInitial>     = {};
  const highlightInitialsById: Record<string, HighlightEditorInitial> = {};
  const dragDropInitialsById:  Record<string, DragDropEditorInitial>  = {};
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
    } else if (row.question_type === 'BOWTIE') {
      bowtieInitialsById[row.item_id] = bowtieRowToInitial(row as unknown as BowtieDbRow, 'admin');
    } else if (row.question_type === 'CLOZE') {
      clozeInitialsById[row.item_id] = clozeRowToInitial(row as unknown as ClozeDbRow, 'admin');
    } else if (row.question_type === 'HIGHLIGHT') {
      highlightInitialsById[row.item_id] = highlightRowToInitial(row as unknown as HighlightDbRow, 'admin');
    } else if (row.question_type === 'DRAG_DROP') {
      dragDropInitialsById[row.item_id] = dragDropRowToInitial(row as unknown as DragDropDbRow, 'admin');
    }
  }

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        {/* Back-link row — mirrors legacy. */}
        <div className="bank-header-row">
          <Link href="/admin/dashboard" className="bank-back-link">
            ← Admin
          </Link>
        </div>

        <header className="auth-list-page-header">
          <div>
            <h1 className="auth-list-page-title">Question Bank (v2)</h1>
          </div>
          <div className="auth-list-toolbar">
            <Link href="/admin/bank/cases-v2" className="auth-cs-btn subtle">
              Case Studies →
            </Link>
            <Link href="/admin/bank/trends-v2" className="auth-cs-btn subtle">
              Trend datasets →
            </Link>
          </div>
        </header>

        <BankCountsV2 counts={counts} />

        {error && (
          <p className="auth-sandbox-error">
            Could not load the bank: {error.message}
          </p>
        )}

        <BankFiltersV2 values={filters} baseUrl={BASE_URL} />

        <BankListV2Client
          surface="admin"
          rows={summaryRows}
          hasAnyFilter={hasAnyFilter}
          baseUrl={BASE_URL}
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
          bowtieInitialsById={bowtieInitialsById}
          emptyBowtieInitial={emptyBowtieInitial('admin')}
          clozeInitialsById={clozeInitialsById}
          emptyClozeInitial={emptyClozeInitial('admin')}
          highlightInitialsById={highlightInitialsById}
          emptyHighlightInitial={emptyHighlightInitial('admin')}
          dragDropInitialsById={dragDropInitialsById}
          emptyDragDropInitial={emptyDragDropInitial('admin')}
        />
      </div>
    </main>
  );
}
