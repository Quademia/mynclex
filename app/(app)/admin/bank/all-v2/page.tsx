// mynclex/app/(app)/admin/bank/all-v2/page.tsx
//
// New admin Question Bank list — slice 2 of the questions-and-wrappers
// rebuild. Lives alongside the legacy /admin/bank/all (which keeps
// working unchanged) until slice 13 swaps them.
//
// Differences vs legacy:
//   - Modal-based editor (no `?edit=` focus mode).
//   - "+ New question" → type picker → MCQ editor in create mode.
//   - Wrapper-linked rows are filtered out — they live in the wrapper
//     pages (slices 11-12 add the v2 wrapper pages).
//   - No filters, no search, no pagination yet — those polish in a
//     follow-up slice. Slice 2's job is the create/edit/delete loop.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import {
  BankListV2Client,
  type BankListV2RowSummary,
} from '@/lib/authoring/bank-list-v2-client';
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
import type { QuestionType } from '@/lib/bank/classifications';

export const dynamic = 'force-dynamic';

interface FullBankRow extends McqDbRow {
  parent_case_id: string | null;
  trend_id: string | null;
}

export default async function AdminBankAllV2Page() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  // Pull every standalone bank item — all types, but only standalone
  // (no wrapper link). MCQ rows get the full editor data; other types
  // appear in the list with the Edit button disabled (their editors
  // arrive in slices 3–10).
  const { data, error } = await supabase
    .from('nclex_bank_items')
    .select(MCQ_ROW_COLUMNS + ', parent_case_id, trend_id')
    .is('parent_case_id', null)
    .is('trend_id', null)
    .order('item_id', { ascending: true })
    .returns<FullBankRow[]>();

  if (error) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">Question Bank (v2)</h1>
          <p className="auth-sandbox-error">
            Could not load the bank: {error.message}
          </p>
        </div>
      </main>
    );
  }

  const fullRows = data ?? [];

  const summaryRows: BankListV2RowSummary[] = fullRows.map((r) => ({
    item_id: r.item_id,
    question_type: r.question_type as QuestionType,
    stem: r.stem ?? '',
    difficulty: r.difficulty,
    is_published: r.is_published,
    is_free_sample: r.is_free_sample,
  }));

  const mcqInitialsById: Record<string, McqEditorInitial> = {};
  const tfInitialsById: Record<string, TfEditorInitial> = {};
  for (const row of fullRows) {
    if (row.question_type === 'MCQ') {
      mcqInitialsById[row.item_id] = mcqRowToInitial(row, 'admin');
    } else if (row.question_type === 'TF') {
      tfInitialsById[row.item_id] = tfRowToInitial(row, 'admin');
    }
  }

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <h1 className="auth-list-page-title">Question Bank (v2)</h1>
          <p className="auth-list-page-subtitle">
            Questions-and-wrappers rebuild · admin surface · MCQ + TF create/edit/delete
          </p>
        </header>

        <BankListV2Client
          surface="admin"
          rows={summaryRows}
          mcqInitialsById={mcqInitialsById}
          emptyMcqInitial={emptyMcqInitial('admin')}
          tfInitialsById={tfInitialsById}
          emptyTfInitial={emptyTfInitial('admin')}
        />
      </div>
    </main>
  );
}
