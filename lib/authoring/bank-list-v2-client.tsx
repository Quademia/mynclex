// mynclex/lib/authoring/bank-list-v2-client.tsx
//
// Shared client component used by /admin/bank/all-v2 and the tutor
// twin. Owns the modal stack:
//
//   - "+ New question" → opens <QuestionTypePicker>.
//   - Pick a type → opens the matching editor in create mode.
//   - "Edit" on a row → opens the matching editor in edit mode with
//                       the row's full data preloaded.
//
// Each new editor adds its own initials map to the props (mcq, tf,
// …) and a small switch case in the modal stack. No dispatcher —
// each editor is imported by name; the switch picks which one.
//
// On save / delete, the corresponding server action calls
// revalidatePath; this component then triggers a soft refresh of
// the page so the list reflects the change without a full reload.
//
// Currently MCQ + TF + SATA + SELECT_N + MATRIX + BOWTIE + CLOZE +
// HIGHLIGHT are wired (slices 2-9). Filters / search / pagination
// still deferred.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { McqEditor, type McqEditorInitial } from '@/lib/authoring/editors/mcq-editor';
import { TfEditor, type TfEditorInitial } from '@/lib/authoring/editors/tf-editor';
import { SataEditor, type SataEditorInitial } from '@/lib/authoring/editors/sata-editor';
import { SelectNEditor, type SelectNEditorInitial } from '@/lib/authoring/editors/select-n-editor';
import { MatrixEditor, type MatrixEditorInitial } from '@/lib/authoring/editors/matrix-editor';
import { BowtieEditor, type BowtieEditorInitial } from '@/lib/authoring/editors/bowtie-editor';
import { ClozeEditor, type ClozeEditorInitial } from '@/lib/authoring/editors/cloze-editor';
import { HighlightEditor, type HighlightEditorInitial } from '@/lib/authoring/editors/highlight-editor';
import { QuestionTypePicker } from '@/lib/authoring/atoms/question-type-picker';
import type { QuestionType } from '@/lib/authoring/classifications';

/** Question types whose editors are wired into bank-list-v2 today. */
const EDITABLE_TYPES: ReadonlySet<QuestionType> = new Set([
  'MCQ',
  'TF',
  'SATA',
  'SELECT_N',
  'MATRIX',
  'BOWTIE',
  'CLOZE',
  'HIGHLIGHT',
]);

export interface BankListV2RowSummary {
  item_id: string;
  question_type: QuestionType;
  stem: string;
  difficulty: string | null;
  is_published: boolean;
  is_free_sample: boolean;
}

export interface BankListV2ClientProps {
  surface: 'admin' | 'tutor';
  rows: BankListV2RowSummary[];
  /** Map of item_id → full editor initial, MCQ rows. */
  mcqInitialsById: Record<string, McqEditorInitial>;
  /** Empty initial used when the curator picks MCQ in create mode. */
  emptyMcqInitial: McqEditorInitial;
  /** Map of item_id → full editor initial, TF rows. */
  tfInitialsById: Record<string, TfEditorInitial>;
  /** Empty initial used when the curator picks TF in create mode. */
  emptyTfInitial: TfEditorInitial;
  /** Map of item_id → full editor initial, SATA rows. */
  sataInitialsById: Record<string, SataEditorInitial>;
  /** Empty initial used when the curator picks SATA in create mode. */
  emptySataInitial: SataEditorInitial;
  /** Map of item_id → full editor initial, SELECT_N rows. */
  selectNInitialsById: Record<string, SelectNEditorInitial>;
  /** Empty initial used when the curator picks SELECT_N in create mode. */
  emptySelectNInitial: SelectNEditorInitial;
  /** Map of item_id → full editor initial, MATRIX rows. */
  matrixInitialsById: Record<string, MatrixEditorInitial>;
  /** Empty initial used when the curator picks MATRIX in create mode. */
  emptyMatrixInitial: MatrixEditorInitial;
  /** Map of item_id → full editor initial, BOWTIE rows. */
  bowtieInitialsById: Record<string, BowtieEditorInitial>;
  /** Empty initial used when the curator picks BOWTIE in create mode. */
  emptyBowtieInitial: BowtieEditorInitial;
  /** Map of item_id → full editor initial, CLOZE rows. */
  clozeInitialsById: Record<string, ClozeEditorInitial>;
  /** Empty initial used when the curator picks CLOZE in create mode. */
  emptyClozeInitial: ClozeEditorInitial;
  /** Map of item_id → full editor initial, HIGHLIGHT rows. */
  highlightInitialsById: Record<string, HighlightEditorInitial>;
  /** Empty initial used when the curator picks HIGHLIGHT in create mode. */
  emptyHighlightInitial: HighlightEditorInitial;
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'picker' }
  | { kind: 'editor-create'; type: QuestionType }
  | { kind: 'editor-edit'; itemId: string; type: QuestionType };

export function BankListV2Client({
  surface,
  rows,
  mcqInitialsById,
  emptyMcqInitial,
  tfInitialsById,
  emptyTfInitial,
  sataInitialsById,
  emptySataInitial,
  selectNInitialsById,
  emptySelectNInitial,
  matrixInitialsById,
  emptyMatrixInitial,
  bowtieInitialsById,
  emptyBowtieInitial,
  clozeInitialsById,
  emptyClozeInitial,
  highlightInitialsById,
  emptyHighlightInitial,
}: BankListV2ClientProps) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  // Brief flash after a successful save/delete — useful confirmation
  // for the curator since the modal closed without showing a "Saved"
  // state of its own.
  const [flash, setFlash] = useState<string | null>(null);

  function handleNewQuestion() {
    setFlash(null);
    setModal({ kind: 'picker' });
  }

  function handlePickType(type: QuestionType) {
    if (EDITABLE_TYPES.has(type)) {
      setModal({ kind: 'editor-create', type });
    }
    // Other types are disabled in the picker — fall through to no-op.
  }

  function handleEditRow(row: BankListV2RowSummary) {
    setFlash(null);
    setModal({ kind: 'editor-edit', itemId: row.item_id, type: row.question_type });
  }

  function handleClose() {
    setModal({ kind: 'closed' });
  }

  function handleSaved(result: { item_id: string; created: boolean }) {
    setModal({ kind: 'closed' });
    setFlash(
      result.created
        ? `Created ${result.item_id}.`
        : `Saved changes to ${result.item_id}.`,
    );
    router.refresh();
  }

  function handleDeleted(itemId: string) {
    setModal({ kind: 'closed' });
    setFlash(`Deleted ${itemId}.`);
    router.refresh();
  }

  // Each slice (3-10) flips one type from "uneditable" to "editable"
  // by adding it to EDITABLE_TYPES + wiring its editor + initials map.
  // The list still shows rows of every type so the curator sees what's
  // there; the Edit button just renders disabled for unsupported types.
  function rowEditable(row: BankListV2RowSummary): boolean {
    return EDITABLE_TYPES.has(row.question_type);
  }

  return (
    <>
      {flash && (
        <div className="auth-flash" role="status">
          {flash}
        </div>
      )}

      <div className="auth-list-toolbar">
        <p className="auth-list-count">
          {rows.length} {rows.length === 1 ? 'question' : 'questions'}
        </p>
        <button
          type="button"
          className="auth-btn auth-btn-primary"
          onClick={handleNewQuestion}
        >
          + New question
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="auth-list-empty">
          <p>No standalone questions yet.</p>
          <p>Click <strong>+ New question</strong> above to create your first one.</p>
        </div>
      ) : (
        <table className="auth-list-table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Stem</th>
              <th>Type</th>
              <th>Difficulty</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item_id}>
                <td className="auth-list-item-id"><code>{row.item_id}</code></td>
                <td className="auth-list-stem">{stemSnippet(row.stem)}</td>
                <td>
                  <span className="auth-pill auth-pill--type">{row.question_type}</span>
                </td>
                <td>{row.difficulty ?? '—'}</td>
                <td>
                  <span
                    className={
                      'auth-pill ' +
                      (row.is_published ? 'auth-pill--published' : 'auth-pill--draft')
                    }
                  >
                    {row.is_published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="auth-list-row-actions">
                  {rowEditable(row) ? (
                    <button
                      type="button"
                      className="auth-btn auth-btn-ghost auth-btn-sm"
                      onClick={() => handleEditRow(row)}
                    >
                      Edit
                    </button>
                  ) : (
                    <span
                      className="auth-list-row-disabled"
                      title={`The ${row.question_type} editor lands in a later slice`}
                    >
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal.kind === 'picker' && (
        <QuestionTypePicker onClose={handleClose} onPick={handlePickType} />
      )}

      {/* Create-mode dispatch — one branch per type-picker entry. */}
      {modal.kind === 'editor-create' && modal.type === 'MCQ' && (
        <McqEditor
          initial={emptyMcqInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'TF' && (
        <TfEditor
          initial={emptyTfInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'SATA' && (
        <SataEditor
          initial={emptySataInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'SELECT_N' && (
        <SelectNEditor
          initial={emptySelectNInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'MATRIX' && (
        <MatrixEditor
          initial={emptyMatrixInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'BOWTIE' && (
        <BowtieEditor
          initial={emptyBowtieInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'CLOZE' && (
        <ClozeEditor
          initial={emptyClozeInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
      {modal.kind === 'editor-create' && modal.type === 'HIGHLIGHT' && (
        <HighlightEditor
          initial={emptyHighlightInitial}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}

      {/* Edit-mode dispatch — one branch per editable type, gated on
          the matching initials map having a row for the current id. */}
      {modal.kind === 'editor-edit' &&
        modal.type === 'MCQ' &&
        mcqInitialsById[modal.itemId] && (
          <McqEditor
            initial={mcqInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'TF' &&
        tfInitialsById[modal.itemId] && (
          <TfEditor
            initial={tfInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'SATA' &&
        sataInitialsById[modal.itemId] && (
          <SataEditor
            initial={sataInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'SELECT_N' &&
        selectNInitialsById[modal.itemId] && (
          <SelectNEditor
            initial={selectNInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'MATRIX' &&
        matrixInitialsById[modal.itemId] && (
          <MatrixEditor
            initial={matrixInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'BOWTIE' &&
        bowtieInitialsById[modal.itemId] && (
          <BowtieEditor
            initial={bowtieInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'CLOZE' &&
        clozeInitialsById[modal.itemId] && (
          <ClozeEditor
            initial={clozeInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      {modal.kind === 'editor-edit' &&
        modal.type === 'HIGHLIGHT' &&
        highlightInitialsById[modal.itemId] && (
          <HighlightEditor
            initial={highlightInitialsById[modal.itemId]}
            onClose={handleClose}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}

      {/* Surface + supported-types note. Removed when -v2 is renamed
          to canonical at swap time. */}
      <p className="auth-list-footnote">
        Surface: <code>{surface}</code>. Bank-list-v2 supports{' '}
        {[...EDITABLE_TYPES].join(' / ')} create/edit/delete. Other
        types and wrapper rows arrive in later slices.
      </p>
    </>
  );
}

function stemSnippet(stem: string, maxLen = 110): string {
  const trimmed = stem.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trimEnd() + '…';
}
