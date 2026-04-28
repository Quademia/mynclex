// mynclex/app/(app)/admin/sandbox/authoring/page.tsx
//
// Slice 1 of the questions-and-wrappers rebuild — read-only sandbox
// for the new MCQ editor.
//
// The page is a Server Component. It:
//   1. Gates on BANK_CURATE.
//   2. Fetches one existing MCQ row from nclex_bank_items.
//   3. Maps that row into McqEditorInitial.
//   4. Hands it to <SandboxClient>, which manages modal open/close
//      and mounts <McqEditor> (the default modal host).
//
// The page itself does NOT mount <McqEditorBody> inline — that's the
// "embedded in a wrapper pane" path, reserved for slices 11–12. Here
// we exercise the standalone modal host, which the bank list will use
// in Slice 2.
//
// Removed at Slice 13 (the swap) along with the nav entry.

import { redirect } from 'next/navigation';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import type { McqEditorInitial } from '@/lib/authoring/editors/mcq-editor';
import { SandboxClient } from './sandbox-client';

export const dynamic = 'force-dynamic';

interface BankItemRow {
  item_id: string;
  question_type: string;
  stem: string | null;
  instruction: string | null;
  rationale: string | null;
  rationale_img: string | null;
  content: { options?: { id: string; text: string }[] } | null;
  correct: { answer?: string; feedback?: Record<string, string> } | null;
  client_needs_category: string | null;
  client_needs_subcategory: string | null;
  nursing_subject: string | null;
  body_system: string | null;
  topic: string | null;
  subtopic: string | null;
  difficulty: string | null;
  bloom_level: string | null;
  tags: string[] | null;
  is_published: boolean;
  is_free_sample: boolean;
  is_builder_visible: boolean;
  marks: number | null;
  shuffle_options: boolean;
  question_ref: string | null;
  batch_id: string | null;
}

export default async function AdminAuthoringSandboxPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  // Pick the first MCQ in the bank. The sandbox doesn't care which
  // row — it just needs a real one to exercise the editor.
  const { data, error } = await supabase
    .from('nclex_bank_items')
    .select(
      'item_id, question_type, stem, instruction, rationale, rationale_img, ' +
        'content, correct, client_needs_category, client_needs_subcategory, ' +
        'nursing_subject, body_system, topic, subtopic, difficulty, bloom_level, ' +
        'tags, is_published, is_free_sample, is_builder_visible, marks, ' +
        'shuffle_options, question_ref, batch_id',
    )
    .eq('question_type', 'MCQ')
    .order('item_id', { ascending: true })
    .limit(1)
    .maybeSingle<BankItemRow>();

  if (error) {
    return (
      <main className="auth-sandbox">
        <div className="auth-sandbox-inner">
          <h1 className="auth-sandbox-title">Authoring sandbox</h1>
          <p className="auth-sandbox-error">
            Could not load an MCQ from the bank: {error.message}
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    // No MCQ in the bank yet — the sandbox needs at least one to render.
    // Bounce to the bank list so the curator can create one first.
    redirect('/admin/bank/all?sandbox-needs-mcq=1');
  }

  const initial = rowToMcqInitial(data);

  return (
    <main className="auth-sandbox">
      <div className="auth-sandbox-inner">
        <h1 className="auth-sandbox-title">Authoring sandbox</h1>
        <p className="auth-sandbox-subtitle">
          Slice 1 of the questions-and-wrappers rebuild · MCQ editor · read-only
        </p>
        <p className="auth-sandbox-meta">
          Loaded item: <code>{data.item_id}</code>. Open the modal to verify
          the file shape, atoms, two-pane layout, and live preview.
        </p>
        <SandboxClient initial={initial} />
      </div>
    </main>
  );
}

// ── Mapping ────────────────────────────────────────────────────
//
// Translate a DB row into McqEditorInitial. Mirrors the mapping in
// `lib/bank/list-view#rowToInitial` for MCQ specifically — duplicated
// rather than imported so the new authoring tree stays independent
// of the legacy bank library during the parallel-build phase.

function rowToMcqInitial(row: BankItemRow): McqEditorInitial {
  const rawOptions = row.content?.options ?? [];
  const feedbackMap = row.correct?.feedback ?? {};

  return {
    itemId: row.item_id,
    surface: 'admin',
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    options: rawOptions.map((o) => ({
      id: o.id,
      text: o.text,
      feedback: feedbackMap[o.id] ?? '',
    })),
    correct_id: row.correct?.answer ?? '',
    client_needs_category: row.client_needs_category ?? '',
    client_needs_subcategory: row.client_needs_subcategory ?? '',
    nursing_subject: row.nursing_subject ?? '',
    body_system: row.body_system ?? '',
    topic: row.topic ?? '',
    subtopic: row.subtopic ?? '',
    difficulty: row.difficulty ?? '',
    bloom_level: row.bloom_level ?? '',
    tags: (row.tags ?? []).join(', '),
    is_published: row.is_published,
    is_free_sample: row.is_free_sample,
    is_builder_visible: row.is_builder_visible,
    marks: row.marks ?? 1,
    shuffle_options: row.shuffle_options,
    question_ref: row.question_ref ?? '',
    batch_id: row.batch_id ?? '',
  };
}
