// mynclex/lib/bank/editors/tf-editor.tsx
//
// TF (True/False) editor — the MCQ mirror. Same file shape as MCQ; the
// only differences:
//   - The option list is locked to two rows (True / False, IDs A / B).
//   - The option-TEXT is a fixed label ("True"/"False") and stays plain —
//     parseTf re-enforces those exact strings server-side, so it must NOT
//     become rich. Only the per-option FEEDBACK is rich.
//   - No add/remove buttons.
//
// Slice 6a foundation reused: the Content tab carries one roving toolbar
// (lib/authoring/roving-rich.tsx) driving instruction / stem / each
// feedback / rationale. The TF runner is a thin wrapper around McqRunner,
// so it already renders rich (no runner change).

'use client';

import { useState } from 'react';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { EditorAuthorship } from '@/lib/audit/authorship-line';
import { ClassificationFields } from '@/lib/bank/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/bank/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/bank/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { DeleteConfirm } from '@/lib/overlays/bank/delete-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  PreviewToggle,
  type PreviewViewMode,
} from '@/lib/bank/atoms/preview-toggle';
import { useSaveAction } from '@/lib/bank/hooks/use-save-action';
import { useDirtyGuard } from '@/lib/bank/hooks/use-dirty-guard';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/bank/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/bank/actions/delete-question';
import {
  RovingProvider,
  RovingToolbar,
  RovingRichField,
} from '@/lib/authoring/roving-rich';
import {
  RichInstructionField,
  RichStemField,
  RichRationaleFields,
  STEM_IMAGE_KEYS,
} from '@/lib/authoring/rich-atoms';
import { RichRender } from '@/lib/authoring/rich-render';
import { curatorBankImageRenderer } from '@/lib/authoring/bank-image-render';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { useAuthUploadsInFlight } from '@/lib/authoring/use-uploads-in-flight';
import {
  parseRichDoc,
  isEmptyRichDoc,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import type { TfEditorInitial } from './tf-row-mapper';

// Re-export so client callers (bank-list-client) can keep imports short.
export type { TfEditorInitial };

// ─────────────────────────────────────────────────────────────
// TfOptionList — the locked True/False list (private).
// option_text is a fixed, read-only label (plain); option_feedback is
// rich. Same form-data contract as MCQ (option_id / option_text /
// option_feedback / correct_id).
// ─────────────────────────────────────────────────────────────

interface TfRow {
  id: string;
  text: string;        // locked label — "True" / "False"
  feedback: RichDoc;   // rich
}

interface TfOptionListProps {
  options: TfRow[];
  correctId: string;
  onChange: (next: TfRow[], correctId: string) => void;
  disabled: boolean;
}

function TfOptionList({ options, correctId, onChange, disabled }: TfOptionListProps) {
  function updateFeedback(idx: number, feedback: RichDoc) {
    onChange(
      options.map((o, i) => (i === idx ? { ...o, feedback } : o)),
      correctId,
    );
  }

  function pickCorrect(id: string) {
    onChange(options, id);
  }

  return (
    <div className="auth-fg">
      <label className="auth-label">Options *</label>
      <p className="auth-hint">True / False are locked. Mark one correct.</p>

      {options.map((opt, idx) => (
        <div key={opt.id} className="auth-option-row">
          <div className="auth-option-correct">
            <input
              type="radio"
              name="correct_id"
              value={opt.id}
              checked={correctId === opt.id}
              onChange={() => pickCorrect(opt.id)}
              disabled={disabled}
              title="Mark as correct"
            />
          </div>
          <div className="auth-option-letter">{opt.id}</div>
          <div className="auth-option-fields">
            {/* Locked label — stays plain text (parseTf enforces these
                exact strings). */}
            <input
              type="text"
              name="option_text"
              value={opt.text}
              readOnly
              className="auth-input"
            />
            <RovingRichField
              fieldKey={`opt:${opt.id}:fb`}
              name="option_feedback"
              value={opt.feedback}
              onChange={(doc) => updateFeedback(idx, doc)}
              inline
              className="auth-rrf-option-fb"
              ariaLabel={`${opt.text} feedback`}
              placeholder="Per-option feedback (optional)…"
            />
            <input type="hidden" name="option_id" value={opt.id} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TfPreview — dual-mode preview (private). Stem rich; option text is
// the locked "True"/"False" label (plain).
// ─────────────────────────────────────────────────────────────

interface TfPreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  options: { id: string; text: string }[];
  correctId: string;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function TfPreview({
  instruction,
  stem,
  options,
  correctId,
  viewMode,
  onViewModeChange,
}: TfPreviewProps) {
  const headerText =
    viewMode === 'answer-key'
      ? 'Answer key · curator view'
      : 'Pre-submit · student view';

  return (
    <div className="auth-preview-card">
      <div className="auth-preview-card-header">
        <div className="auth-preview-card-header-text">{headerText}</div>
        <PreviewToggle value={viewMode} onChange={onViewModeChange} />
      </div>
      <div className="auth-preview-card-body">
        {!isEmptyRichDoc(instruction) && (
          <p className="auth-preview-instruction">
            <RichRender doc={instruction} inline />
          </p>
        )}
        <div className="auth-preview-stem">
          {isEmptyRichDoc(stem) ? (
            <span className="auth-preview-placeholder">Stem appears here…</span>
          ) : (
            <RichRender doc={stem} custom={curatorBankImageRenderer} />
          )}
        </div>
        <ol className="auth-preview-options">
          {options.map((opt) => {
            const isCorrect = viewMode === 'answer-key' && opt.id === correctId;
            return (
              <li
                key={opt.id}
                className={
                  'auth-preview-option' +
                  (isCorrect ? ' auth-preview-option-correct' : '')
                }
              >
                <span
                  className={
                    isCorrect ? 'auth-preview-radio-correct' : 'auth-preview-radio'
                  }
                  aria-hidden="true"
                />
                <span className="auth-preview-letter">{opt.id}.</span>
                <span className="auth-preview-text">{opt.text}</span>
                {isCorrect && (
                  <span className="auth-preview-correct-pill">✓ Correct</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TfEditorBody — two-pane edit + preview body. Mountable anywhere.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-tf-form';

export interface TfEditorBodyProps {
  initial: TfEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function TfEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: TfEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  const [clientError, setClientError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');
  // Slice 8 — hold Save while a stem-image upload is in flight (saving
  // then would persist a not-yet-filled image block).
  const uploadsInFlight = useAuthUploadsInFlight();

  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() => parseRichDoc(initial.instruction));
  const [rationale, setRationale] = useState<RichDoc>(() => parseRichDoc(initial.rationale));
  const [options, setOptions] = useState<TfRow[]>(() =>
    initial.options.map((o) => ({
      id: o.id,
      text: o.text,
      feedback: parseRichDoc(o.feedback),
    })),
  );
  const [correctId, setCorrectId] = useState<string>(initial.correct_id);
  const [category, setCategory] = useState(initial.client_needs_category);

  function markDirty() {
    onDirty?.();
  }

  // TF content is complete with a stem + a correct pick (options locked).
  const contentIncomplete = isEmptyRichDoc(stem) || !correctId;
  const classificationIncomplete = !category;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (uploadsInFlight) {
      setClientError('An image is still uploading — give it a moment, then save.');
      return;
    }
    if (contentIncomplete) {
      setTab('content');
      setClientError('Fill in the required fields on Content to continue.');
      return;
    }
    if (classificationIncomplete) {
      setTab('classification');
      setClientError('Pick a Client Needs category to continue.');
      return;
    }
    setClientError(null);
    onSubmit(new FormData(e.currentTarget));
  }

  function dismissError() {
    setClientError(null);
    onErrorDismiss?.();
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      noValidate
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs type="TF" itemId={initial.itemId} surface={initial.surface} parentNoteId={initial.parentNoteId} />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <EditorAuthorship
        realm={initial.surface}
        entityType={initial.surface === 'tutor' ? 'tutor_question' : 'bank_item'}
        itemId={initial.itemId}
        title={richTextToPlainLabel(initial.stem)}
      />
      <RovingProvider>
        <div className="auth-split">
          <div className="auth-edit">
            <EditorTabs
              tabs={[
                { id: 'content',        label: 'Content',        incomplete: contentIncomplete },
                { id: 'classification', label: 'Classification', incomplete: classificationIncomplete },
                { id: 'housekeeping',   label: 'Housekeeping' },
              ]}
              active={tab}
              onChange={(id) => setTab(id as typeof tab)}
            >
              <TabPanel id="content">
                <RovingToolbar
                  hint="Click into a field to format it"
                  imageFieldKeys={STEM_IMAGE_KEYS}
                />
                <RichInstructionField
                  value={instruction}
                  onChange={(doc) => { setInstruction(doc); markDirty(); }}
                />
                <RichStemField
                  value={stem}
                  onChange={(doc) => { setStem(doc); markDirty(); }}
                />
                <TfOptionList
                  options={options}
                  correctId={correctId}
                  onChange={(opts, cid) => {
                    setOptions(opts);
                    setCorrectId(cid);
                    markDirty();
                  }}
                  disabled={pending}
                />
                <RichRationaleFields
                  rationale={rationale}
                  onRationaleChange={(doc) => { setRationale(doc); markDirty(); }}
                  defaultRationaleImg={initial.rationale_img}
                />
              </TabPanel>

              <TabPanel id="classification">
                <ClassificationFields
                  category={category}
                  onCategoryChange={setCategory}
                  defaults={{
                    client_needs_subcategory: initial.client_needs_subcategory,
                    nursing_subject: initial.nursing_subject,
                    body_system: initial.body_system,
                    topic: initial.topic,
                    subtopic: initial.subtopic,
                    difficulty: initial.difficulty,
                    difficulty_irt: initial.difficulty_irt,
                    difficulty_source: initial.difficulty_source,
                    bloom_level: initial.bloom_level,
                    tags: initial.tags,
                  }}
                />
              </TabPanel>

              <TabPanel id="housekeeping">
                <HousekeepingFields
                  canReserveCat={initial.surface === 'admin'}
                  mode={initial.mode}
                  questionType="TF"
                  defaults={{
                    // Per bank-marks-and-scoring §5.2: TF max is fixed at 1.
                    marks: 1,
                    question_ref: initial.question_ref,
                    batch_id: initial.batch_id,
                    is_published: initial.is_published,
                    cat_pool: initial.cat_pool,
                    is_free_sample: initial.is_free_sample,
                    is_builder_visible: initial.is_builder_visible,
                    shuffle_options: initial.shuffle_options,
                  }}
                />
              </TabPanel>
            </EditorTabs>
          </div>

          <div className="auth-preview">
            <TfPreview
              instruction={instruction}
              stem={stem}
              options={options}
              correctId={correctId}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>
      </RovingProvider>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// TfEditor — default standalone modal host. Same wiring as MCQ.
// ─────────────────────────────────────────────────────────────

export interface TfEditorProps {
  initial: TfEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function TfEditor({ initial, onClose, onSaved, onDeleted }: TfEditorProps) {
  const isEdit = initial.itemId !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const guard = useDirtyGuard({
    onClose,
    onSaveAndClose: () => {
      const form = document.getElementById(FORM_ID);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    },
  });

  const save = useSaveAction<SaveResult>(saveQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onSaved?.({ item_id: result.item_id, created: result.created });
        onClose();
      }
    },
  });

  const del = useSaveAction<DeleteResult>(deleteQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onDeleted?.(result.item_id);
        onClose();
      }
    },
  });

  const pending = save.pending || del.pending;
  const error = save.error ?? del.error;

  function startDelete() {
    setConfirmingDelete(true);
    setDeleteText('');
    save.clearError();
    del.clearError();
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteText('');
  }

  function confirmDelete() {
    if (!initial.itemId) return;
    if (deleteText !== 'DELETE') return;
    const fd = new FormData();
    fd.set('item_id', initial.itemId);
    fd.set('surface', initial.surface);
    del.submit(fd);
  }

  return (
    <ModalFrame
      title={isEdit ? `Edit TF — ${initial.itemId}` : 'New True/False question'}
      onClose={pending ? () => undefined : guard.requestClose}
      actions={
        <EditorActions
          canDelete={isEdit}
          pending={pending || confirmingDelete || guard.confirming}
          onCancel={guard.requestClose}
          onDelete={isEdit ? startDelete : undefined}
          formId={FORM_ID}
        />
      }
    >
      {guard.confirming && (
        <DiscardConfirm
          onKeepEditing={guard.keepEditing}
          onDiscard={guard.discardAndClose}
          onSaveAndClose={guard.saveAndClose}
          pending={save.pending}
        />
      )}
      {confirmingDelete && initial.itemId && (
        <DeleteConfirm
          itemId={initial.itemId}
          deleteText={deleteText}
          pending={del.pending}
          onTextChange={setDeleteText}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
      <TfEditorBody
        initial={initial}
        error={error}
        pending={pending}
        onSubmit={save.submit}
        onDirty={guard.markDirty}
        onErrorDismiss={() => {
          save.clearError();
          del.clearError();
        }}
      />
    </ModalFrame>
  );
}
