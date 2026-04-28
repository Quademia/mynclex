// mynclex/app/(app)/tutor/bank/all-v2/page.tsx
//
// Tutor twin of /admin/bank/all-v2. Same component tree, different
// table (nclex_tutor_questions) and surface ('tutor'). Auth is gated
// by /tutor/layout.tsx via requireTutor() above this page; the
// server actions re-check independently and RLS enforces
// tutor_id = auth.uid() at the DB layer regardless.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
import type { QuestionType } from '@/lib/authoring/classifications';

export const dynamic = 'force-dynamic';

interface FullTutorBankRow extends McqDbRow {
  parent_case_id: string | null;
  trend_id: string | null;
}

export default async function TutorBankAllV2Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // (app) + /tutor layouts already gate. Defensive fallback.
  if (!user) redirect('/login');

  // RLS on nclex_tutor_questions filters to tutor_id = auth.uid().
  const { data, error } = await supabase
    .from('nclex_tutor_questions')
    .select(MCQ_ROW_COLUMNS + ', parent_case_id, trend_id')
    .is('parent_case_id', null)
    .is('trend_id', null)
    .order('item_id', { ascending: true })
    .returns<FullTutorBankRow[]>();

  if (error) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">My Bank (v2)</h1>
          <p className="auth-sandbox-error">
            Could not load your bank: {error.message}
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
      mcqInitialsById[row.item_id] = mcqRowToInitial(row, 'tutor');
    } else if (row.question_type === 'TF') {
      tfInitialsById[row.item_id] = tfRowToInitial(row, 'tutor');
    }
  }

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <h1 className="auth-list-page-title">My Bank (v2)</h1>
          <p className="auth-list-page-subtitle">
            Questions-and-wrappers rebuild · tutor surface · MCQ + TF create/edit/delete
          </p>
        </header>

        <BankListV2Client
          surface="tutor"
          rows={summaryRows}
          mcqInitialsById={mcqInitialsById}
          emptyMcqInitial={emptyMcqInitial('tutor')}
          tfInitialsById={tfInitialsById}
          emptyTfInitial={emptyTfInitial('tutor')}
        />
      </div>
    </main>
  );
}
