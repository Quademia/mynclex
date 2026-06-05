// mynclex/app/(app)/tutor/bank/all/page.tsx
//
// Tutor twin of /admin/bank/all. Same component tree, different
// table (nclex_tutor_questions) and surface ('tutor'). Auth is gated
// by /tutor/layout.tsx via requireTutor() above this page; the
// server actions re-check independently and RLS enforces
// tutor_id = auth.uid() at the DB layer regardless.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  BankListClient,
  type BankListRowSummary,
} from '@/lib/bank/bank-list-client';
import { loadAuthorship } from '@/lib/audit/authorship';
import { BankFilters } from '@/lib/bank/bank-filters';
import {
  parseBankFilters,
  applyBankFilters,
  applyMembershipFilter,
  hasAnyBankFilter,
} from '@/lib/bank/bank-list-query';
import {
  BankCounts,
  type BankCompositionCounts,
} from '@/lib/bank/bank-counts';
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
import type { QuestionType } from '@/lib/bank/classifications';

export const dynamic = 'force-dynamic';

const BASE_URL = '/tutor/bank/all';

interface FullTutorBankRow extends McqDbRow {
  parent_case_id: string | null;
  trend_id:       string | null;
  case:  { title: string } | null;
  trend: { title: string } | null;
}

interface PageProps {
  searchParams?: Promise<Record<string, string | undefined>>;
}

export default async function TutorBankAllPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const filters = parseBankFilters(sp);
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
      ', parent_case_id, trend_id, ' +
      'trend:nclex_tutor_trend_datasets(title), ' +
      'case:nclex_tutor_case_studies(title)',
    );

  // All the non-membership filters + scoped search (shared helper).
  query = applyBankFilters(query, filters);

  // Membership filter (OR across the chosen kinds) — main query only.
  query = applyMembershipFilter(query, filters.membership);

  const { data, error } = await query
    .order('item_id', { ascending: true })
    .limit(500)
    .returns<FullTutorBankRow[]>();

  // ── Composition counts ─────────────────────────────────────
  type MembershipBucket = 'total' | 'standalone' | 'case' | 'trend';
  const buildCountQuery = (
    bucket: MembershipBucket,
    applyNonMembership: boolean,
  ) => {
    let q = supabase
      .from('nclex_tutor_questions')
      .select('*', { count: 'exact', head: true });
    if (bucket === 'standalone') {
      q = q.is('parent_case_id', null).is('trend_id', null);
    } else if (bucket === 'case') {
      q = q.not('parent_case_id', 'is', null);
    } else if (bucket === 'trend') {
      q = q.not('trend_id', 'is', null);
    }
    if (applyNonMembership) {
      q = applyBankFilters(q, filters);
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

  const counts: BankCompositionCounts = {
    total:       { filtered: filteredAll.count        ?? 0, total: totalAll.count        ?? 0 },
    standalone:  { filtered: filteredStandalone.count ?? 0, total: totalStandalone.count ?? 0 },
    caseLinked:  { filtered: filteredCase.count       ?? 0, total: totalCase.count       ?? 0 },
    trendLinked: { filtered: filteredTrend.count      ?? 0, total: totalTrend.count      ?? 0 },
  };

  // ── Row mapping + per-type initials ────────────────────────
  const fullRows = data ?? [];

  const summaryRows: BankListRowSummary[] = fullRows.map((r) => ({
    item_id:        r.item_id,
    question_type:  r.question_type as QuestionType,
    stem:           r.stem ?? '',
    difficulty:     r.difficulty,
    is_published:   r.is_published,
    is_free_sample: r.is_free_sample,
    marks:          r.marks ?? 1,
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
      mcqInitialsById[row.item_id] = mcqRowToInitial(row, 'tutor');
    } else if (row.question_type === 'TF') {
      tfInitialsById[row.item_id] = tfRowToInitial(row, 'tutor');
    } else if (row.question_type === 'SATA') {
      sataInitialsById[row.item_id] = sataRowToInitial(row as unknown as SataDbRow, 'tutor');
    } else if (row.question_type === 'SELECT_N') {
      selectNInitialsById[row.item_id] = selectNRowToInitial(row as unknown as SelectNDbRow, 'tutor');
    } else if (row.question_type === 'MATRIX') {
      matrixInitialsById[row.item_id] = matrixRowToInitial(row as unknown as MatrixDbRow, 'tutor');
    } else if (row.question_type === 'BOWTIE') {
      bowtieInitialsById[row.item_id] = bowtieRowToInitial(row as unknown as BowtieDbRow, 'tutor');
    } else if (row.question_type === 'CLOZE') {
      clozeInitialsById[row.item_id] = clozeRowToInitial(row as unknown as ClozeDbRow, 'tutor');
    } else if (row.question_type === 'HIGHLIGHT') {
      highlightInitialsById[row.item_id] = highlightRowToInitial(row as unknown as HighlightDbRow, 'tutor');
    } else if (row.question_type === 'DRAG_DROP') {
      dragDropInitialsById[row.item_id] = dragDropRowToInitial(row as unknown as DragDropDbRow, 'tutor');
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
        <div className="bank-header-row">
          <Link href="/tutor" className="bank-back-link">
            ← Tutor
          </Link>
        </div>

        <header className="auth-list-page-header">
          <div>
            <h1 className="auth-list-page-title">My Bank</h1>
          </div>
          <div className="auth-list-toolbar">
            <Link href="/tutor/bank/cases" className="auth-cs-btn subtle">
              Case Studies →
            </Link>
            <Link href="/tutor/bank/trends" className="auth-cs-btn subtle">
              Trend datasets →
            </Link>
          </div>
        </header>

        <BankCounts counts={counts} />

        {error && (
          <p className="auth-sandbox-error">
            Could not load your bank: {error.message}
          </p>
        )}

        <BankFilters values={filters} baseUrl={BASE_URL} tagOptions={tagOptions} />

        <BankListClient
          surface="tutor"
          rows={summaryRows}
          authorshipById={authorship}
          hasAnyFilter={hasAnyFilter}
          baseUrl={BASE_URL}
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
          bowtieInitialsById={bowtieInitialsById}
          emptyBowtieInitial={emptyBowtieInitial('tutor')}
          clozeInitialsById={clozeInitialsById}
          emptyClozeInitial={emptyClozeInitial('tutor')}
          highlightInitialsById={highlightInitialsById}
          emptyHighlightInitial={emptyHighlightInitial('tutor')}
          dragDropInitialsById={dragDropInitialsById}
          emptyDragDropInitial={emptyDragDropInitial('tutor')}
        />
      </div>
    </main>
  );
}
