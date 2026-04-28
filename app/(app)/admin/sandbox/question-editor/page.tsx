// mynclex/app/(app)/admin/sandbox/question-editor/page.tsx
//
// Slice 1 sandbox — paste a URL like
//   /admin/sandbox/question-editor?edit=NCLEX_MCQ_00012
// and the new McqEditor mounts with that question loaded.
//
// Hidden (no nav links to it). Bank-curate gated. Lives under
// /admin/sandbox/ so the existing /admin/bank route is untouched
// and curators don't accidentally hit work-in-progress UI.
//
// What this page does NOT do:
//   - Save (Slice 2)
//   - Publish (Slice 7)
//   - Mount any non-MCQ editor (slices 3–10 add the others)

import '@/styles/authoring.css';

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { StandaloneQuestionModal, rowToMcq } from '@/lib/authoring';
import type { BankItemRow } from '@/lib/authoring';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ edit?: string }>;
}

export default async function SandboxQuestionEditorPage({ searchParams }: PageProps) {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);
  const params = await searchParams;
  const editId = params.edit ?? null;

  if (!editId) {
    return (
      <div className="aut-sandbox-empty">
        <h1>Authoring sandbox — question editor</h1>
        <p>
          Open a question by appending <code>?edit=&lt;id&gt;</code> to this URL.
        </p>
        <p>
          Example:{' '}
          <code>/admin/sandbox/question-editor?edit=NCLEX_MCQ_00012</code>
        </p>
        <p className="aut-sandbox-hint">
          Slice 1 sandbox — Save and Publish are disabled. Read-side parsing and the
          controlled-component shape are the only behaviours wired so far.
        </p>
      </div>
    );
  }

  const { data: row, error } = await supabase
    .from('nclex_bank_items')
    .select('*')
    .eq('item_id', editId)
    .maybeSingle<BankItemRow>();

  if (error || !row) {
    return (
      <div className="aut-sandbox-empty">
        <h1>Question not found</h1>
        <p>
          Could not load <code>{editId}</code>.
        </p>
        {error && <pre className="aut-sandbox-error">{error.message}</pre>}
      </div>
    );
  }

  if (row.question_type !== 'MCQ') {
    return (
      <div className="aut-sandbox-empty">
        <h1>Editor not yet implemented</h1>
        <p>
          Slice 1 only ships <code>McqEditor</code>. <code>{editId}</code> is a{' '}
          {row.question_type} item.
        </p>
        <p className="aut-sandbox-hint">
          Try an MCQ — its editor lands in this slice. The other 8 question editors
          arrive in slices 3–10.
        </p>
      </div>
    );
  }

  const initial = rowToMcq(row);

  return (
    <div className="aut-sandbox-stage">
      <StandaloneQuestionModal
        initial={initial}
        questionType="MCQ"
        cancelHref="/admin/sandbox/question-editor"
      />
    </div>
  );
}
