// mynclex/lib/bank/editors/select-n-editor.tsx
//
// SELECT_N (Select Exactly N) editor — SATA plus a "Number to select"
// input that constrains how many options the student must tick.
//
// Slice 6b: the content fields (instruction, stem, every option text +
// per-option feedback, rationale) are RICH, driven by the one roving toolbar
// on the Content tab. The select_count field stays a plain number. Read-coerce,
// no migration.

'use client';

import { useState } from 'react';
import {
  OPTION_LETTERS,
  MIN_OPTIONS,
  MAX_OPTIONS,
  DEFAULT_OPTIONS,
} from '@/lib/bank/classifications';
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
import type { SelectNEditorInitial } from './select-n-row-mapper';

export type { SelectNEditorInitial };

// ─────────────────────────────────────────────────────────────
// SelectNOptionList — checkbox option list (private). Rich text +
// feedback; hint copy reflects the exact-count requirement.
// ─────────────────────────────────────────────────────────────

interface OptionRow {
  id: string;
  text: RichDoc;
  feedback: RichDoc;
}

interface SelectNOptionListProps {
  options: OptionRow[];
  correctIds: Set<string>;
  selectCount: number;
  onChange: (next: OptionRow[], correctIds: Set<string>) => void;
  disabled: boolean;
}

function SelectNOptionList({
  options,
  correctIds,
  selectCount,
  onChange,
  disabled,
}: SelectNOptionListProps) {
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const nextLetter = OPTION_LETTERS[options.length];
    onChange([...options, { id: nextLetter, text: emptyDoc(), feedback: emptyDoc() }], correctIds);
  }

  function removeOption(idx: number) {
    if (options.length <= MIN_OPTIONS) return;
    const removedId = options[idx].id;
    const nextOptions = options.filter((_, i) => i !== idx);
    if (correctIds.has(removedId)) {
      const nextSet = new Set(correctIds);
      nextSet.delete(removedId);
      onChange(nextOptions, nextSet);
    } else {
      onChange(nextOptions, correctIds);
    }
  }

  function updateText(idx: number, text: RichDoc) {
    onChange(
      options.map((o, i) => (i === idx ? { ...o, text } : o)),
      correctIds,
    );
  }

  function updateFeedback(idx: number, feedback: RichDoc) {
    onChange(
      options.map((o, i) => (i === idx ? { ...o, feedback } : o)),
      correctIds,
    );
  }

  function toggleCorrect(id: string) {
    const next = new Set(correctIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(options, next);
  }

  return (
    <div className="auth-fg">
      <div className="auth-label-row">
        <label className="auth-label">Options *</label>
        <button
          type="button"
          className="auth-link-btn"
          onClick={addOption}
          disabled={disabled || options.length >= MAX_OPTIONS}
        >
          + Add option
        </button>
      </div>
      <p className="auth-hint">
        Tick exactly {selectCount} correct option{selectCount === 1 ? '' : 's'}.
      </p>

      {options.map((opt, idx) => (
        <div key={opt.id} className="auth-option-row">
          <div className="auth-option-correct">
            <input
              type="checkbox"
              name="correct_id"
              value={opt.id}
              checked={correctIds.has(opt.id)}
              onChange={() => toggleCorrect(opt.id)}
              disabled={disabled}
              title="Mark as correct"
            />
          </div>
          <div className="auth-option-letter">{opt.id}</div>
          <div className="auth-option-fields">
            <RovingRichField
              fieldKey={`opt:${opt.id}:text`}
              name="option_text"
              value={opt.text}
              onChange={(doc) => updateText(idx, doc)}
              inline
              className="auth-rrf-option"
              ariaLabel={`Option ${opt.id} text`}
              placeholder={`Option ${opt.id} text…`}
            />
            <RovingRichField
              fieldKey={`opt:${opt.id}:fb`}
              name="option_feedback"
              value={opt.feedback}
              onChange={(doc) => updateFeedback(idx, doc)}
              inline
              className="auth-rrf-option-fb"
              ariaLabel={`Option ${opt.id} feedback`}
              placeholder="Per-option feedback (optional)…"
            />
            <input type="hidden" name="option_id" value={opt.id} />
          </div>
          <button
            type="button"
            className="auth-row-remove"
            onClick={() => removeOption(idx)}
            disabled={disabled || options.length <= MIN_OPTIONS}
            title="Remove option"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SelectNCountField — number input + helper hint. Posts as
// `name="select_count"`. Clamped to [1, optionsWithText] in the editor;
// the server parser re-checks.
// ─────────────────────────────────────────────────────────────

interface SelectNCountFieldProps {
  value: number;
  max: number;
  disabled: boolean;
  onChange: (next: number) => void;
}

function SelectNCountField({ value, max, disabled, onChange }: SelectNCountFieldProps) {
  return (
    <div className="auth-fg">
      <label htmlFor="auth-select-count" className="auth-label">Select exactly *</label>
      <input
        id="auth-select-count"
        name="select_count"
        type="number"
        min={1}
        max={Math.max(1, max)}
        value={value}
        onChange={(e) => {
          const next = parseInt(e.target.value, 10);
          if (Number.isFinite(next) && next >= 1) onChange(next);
        }}
        disabled={disabled}
        className="auth-input auth-input--num"
      />
      <p className="auth-hint">Students must pick exactly this many options.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SelectNPreview — dual-mode preview (private). "Select N" line above
// the checkbox option list; answer-key view highlights correctIds.
// ─────────────────────────────────────────────────────────────

interface SelectNPreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  options: OptionRow[];
  selectCount: number;
  correctIds: Set<string>;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function SelectNPreview({
  instruction,
  stem,
  options,
  selectCount,
  correctIds,
  viewMode,
  onViewModeChange,
}: SelectNPreviewProps) {
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
        <p className="auth-preview-select-n">
          Select exactly <strong>{selectCount}</strong>.
        </p>
        <ol className="auth-preview-options">
          {options.length === 0 && (
            <li className="auth-preview-placeholder">Options appear here as you add them.</li>
          )}
          {options.map((opt) => {
            const isCorrect = viewMode === 'answer-key' && correctIds.has(opt.id);
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
                    isCorrect ? 'auth-preview-checkbox-correct' : 'auth-preview-checkbox'
                  }
                  aria-hidden="true"
                />
                <span className="auth-preview-letter">{opt.id}.</span>
                <span className="auth-preview-text">
                  {isEmptyRichDoc(opt.text) ? (
                    <span className="auth-preview-placeholder">Option {opt.id} text…</span>
                  ) : (
                    <RichRender doc={opt.text} inline />
                  )}
                </span>
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
// SelectNEditorBody — two-pane edit + preview body. Mountable anywhere.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-select-n-form';

export interface SelectNEditorBodyProps {
  initial: SelectNEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function SelectNEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: SelectNEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  const [clientError, setClientError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');
  // Slice 8 — hold Save while a stem-image upload is in flight (saving
  // then would persist a not-yet-filled image block).
  const uploadsInFlight = useAuthUploadsInFlight();

  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() => parseRichDoc(initial.instruction));
  const [rationale, setRationale] = useState<RichDoc>(() => parseRichDoc(initial.rationale));
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initial.options.length > 0
      ? initial.options.map((o) => ({
          id: o.id,
          text: parseRichDoc(o.text),
          feedback: parseRichDoc(o.feedback),
        }))
      : defaultOptionRows(),
  );
  const [correctIds, setCorrectIds] = useState<Set<string>>(
    () => new Set(initial.correct_ids),
  );
  const [selectCount, setSelectCount] = useState<number>(initial.select_count);
  const [category, setCategory] = useState(initial.client_needs_category);

  function markDirty() {
    onDirty?.();
  }

  const optionsWithText = options.filter((o) => !isEmptyRichDoc(o.text)).length;

  // Clamp selectCount to the current options-with-text upper bound for
  // display only; saved value is whatever's in the input + parser re-validates.
  const effectiveCount = Math.min(
    Math.max(1, selectCount),
    Math.max(1, optionsWithText),
  );

  const contentIncomplete =
    isEmptyRichDoc(stem) ||
    optionsWithText < MIN_OPTIONS ||
    correctIds.size !== effectiveCount;
  const classificationIncomplete = !category;

  // Live marks for the Housekeeping readout. Per bank-marks-and-scoring §4.1:
  // SELECT_N enforces N == count(correct), so max = N = correctIds.size.
  const liveMarks = correctIds.size;

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
      <HiddenItemInputs type="SELECT_N" itemId={initial.itemId} surface={initial.surface} parentNoteId={initial.parentNoteId} />

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
                <SelectNOptionList
                  options={options}
                  correctIds={correctIds}
                  selectCount={effectiveCount}
                  onChange={(opts, cids) => {
                    setOptions(opts);
                    setCorrectIds(cids);
                    markDirty();
                  }}
                  disabled={pending}
                />
                <SelectNCountField
                  value={selectCount}
                  max={Math.max(1, optionsWithText)}
                  disabled={pending}
                  onChange={(n) => { setSelectCount(n); markDirty(); }}
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
                    bloom_level: initial.bloom_level,
                    tags: initial.tags,
                  }}
                />
              </TabPanel>

              <TabPanel id="housekeeping">
                <HousekeepingFields
                  mode={initial.mode}
                  questionType="SELECT_N"
                  defaults={{
                    marks: liveMarks,
                    question_ref: initial.question_ref,
                    batch_id: initial.batch_id,
                    is_published: initial.is_published,
                    is_free_sample: initial.is_free_sample,
                    is_builder_visible: initial.is_builder_visible,
                    shuffle_options: initial.shuffle_options,
                  }}
                />
              </TabPanel>
            </EditorTabs>
          </div>

          <div className="auth-preview">
            <SelectNPreview
              instruction={instruction}
              stem={stem}
              options={options}
              selectCount={effectiveCount}
              correctIds={correctIds}
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
// SelectNEditor — default standalone modal host. Same wiring as MCQ.
// ─────────────────────────────────────────────────────────────

export interface SelectNEditorProps {
  initial: SelectNEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function SelectNEditor({ initial, onClose, onSaved, onDeleted }: SelectNEditorProps) {
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
      title={isEdit ? `Edit Select N — ${initial.itemId}` : 'New Select N question'}
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
      <SelectNEditorBody
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

// ─────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────

function emptyDoc(): RichDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function defaultOptionRows(): OptionRow[] {
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: emptyDoc(),
    feedback: emptyDoc(),
  }));
}
