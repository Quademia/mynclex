// mynclex/lib/authoring/editors/sata-editor.tsx
//
// SATA (Select All That Apply) editor — third concrete editor in the
// rebuild. Mirrors the MCQ shape with two differences:
//   - The option list uses checkboxes, not radios — any subset of the
//     options can be marked correct (≥1).
//   - `correct_ids` is an array of option IDs instead of a single
//     `correct_id`. The form-data contract still posts under
//     `name="correct_id"` (one value per ticked checkbox) so the
//     server action's existing `formData.getAll('correct_id')` call
//     is unchanged.
//
// All shared atoms (ModalFrame, EditorActions, EditorTabs, StemField,
// InstructionField, RationaleFields, ClassificationFields,
// HousekeepingFields, HiddenItemInputs, DiscardConfirm) are reused
// as-is.

'use client';

import { useState } from 'react';
import {
  OPTION_LETTERS,
  MIN_OPTIONS,
  MAX_OPTIONS,
  DEFAULT_OPTIONS,
} from '@/lib/authoring/classifications';
import { ModalFrame } from '@/lib/authoring/atoms/modal-frame';
import { EditorActions } from '@/lib/authoring/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/authoring/atoms/editor-tabs';
import { StemField } from '@/lib/authoring/atoms/stem-field';
import { InstructionField } from '@/lib/authoring/atoms/instruction-field';
import { RationaleFields } from '@/lib/authoring/atoms/rationale-fields';
import { ClassificationFields } from '@/lib/authoring/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/authoring/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/authoring/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/authoring/atoms/discard-confirm';
import { DeleteConfirm } from '@/lib/authoring/atoms/delete-confirm';
import { ErrorToast } from '@/lib/authoring/atoms/error-toast';
import {
  PreviewToggle,
  type PreviewViewMode,
} from '@/lib/authoring/atoms/preview-toggle';
import { useSaveAction } from '@/lib/authoring/hooks/use-save-action';
import { useDirtyGuard } from '@/lib/authoring/hooks/use-dirty-guard';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/authoring/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/authoring/actions/delete-question';
import type { SataEditorInitial } from './sata-row-mapper';

// Re-export so client callers (bank-list-v2-client) can keep imports
// short.
export type { SataEditorInitial };

// ─────────────────────────────────────────────────────────────
// SataOptionList — checkbox option list (private to this file).
// ─────────────────────────────────────────────────────────────

interface OptionRow {
  id: string;
  text: string;
  feedback: string;
}

interface SataOptionListProps {
  options: OptionRow[];
  correctIds: Set<string>;
  onChange: (next: OptionRow[], correctIds: Set<string>) => void;
  disabled: boolean;
}

function SataOptionList({ options, correctIds, onChange, disabled }: SataOptionListProps) {
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const nextLetter = OPTION_LETTERS[options.length];
    onChange([...options, { id: nextLetter, text: '', feedback: '' }], correctIds);
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

  function updateText(idx: number, text: string) {
    onChange(
      options.map((o, i) => (i === idx ? { ...o, text } : o)),
      correctIds,
    );
  }

  function updateFeedback(idx: number, feedback: string) {
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
      <p className="auth-hint">Tick all correct options (at least one).</p>

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
            <input
              type="text"
              name="option_text"
              value={opt.text}
              onChange={(e) => updateText(idx, e.target.value)}
              placeholder={`Option ${opt.id} text…`}
              disabled={disabled}
              className="auth-input"
            />
            <input
              type="text"
              name="option_feedback"
              value={opt.feedback}
              onChange={(e) => updateFeedback(idx, e.target.value)}
              placeholder="Per-option feedback (optional)…"
              disabled={disabled}
              className="auth-input auth-input--sm"
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
// SataPreview — dual-mode preview (private). Renders option list
// with square checkboxes. Answer-key view highlights every option
// in `correctIds` with a filled green checkbox + "✓ Correct" pill.
// ─────────────────────────────────────────────────────────────

interface SataPreviewProps {
  instruction: string;
  stem: string;
  options: OptionRow[];
  correctIds: Set<string>;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

function SataPreview({
  instruction,
  stem,
  options,
  correctIds,
  viewMode,
  onViewModeChange,
}: SataPreviewProps) {
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
        {instruction.trim() && (
          <p className="auth-preview-instruction">{instruction}</p>
        )}
        <div className="auth-preview-stem">
          {stem.trim() || <span className="auth-preview-placeholder">Stem appears here…</span>}
        </div>
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
                  {opt.text.trim() || (
                    <span className="auth-preview-placeholder">Option {opt.id} text…</span>
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
// SataEditorBody — two-pane edit + preview body. Mountable anywhere.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-sata-form';

export interface SataEditorBodyProps {
  initial: SataEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function SataEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: SataEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  const [clientError, setClientError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');

  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initial.options.length > 0 ? initial.options : defaultOptionRows(),
  );
  const [correctIds, setCorrectIds] = useState<Set<string>>(
    () => new Set(initial.correct_ids),
  );
  const [category, setCategory] = useState(initial.client_needs_category);

  const optionsWithText = options.filter((o) => o.text.trim().length > 0).length;
  const contentIncomplete =
    !stem.trim() || correctIds.size === 0 || optionsWithText < MIN_OPTIONS;
  const classificationIncomplete = !category;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
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
      <HiddenItemInputs type="SATA" itemId={initial.itemId} surface={initial.surface} />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

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
              <InstructionField value={instruction} onChange={setInstruction} />
              <StemField value={stem} onChange={setStem} />
              <SataOptionList
                options={options}
                correctIds={correctIds}
                onChange={(opts, cids) => {
                  setOptions(opts);
                  setCorrectIds(cids);
                }}
                disabled={pending}
              />
              <RationaleFields
                defaultRationale={initial.rationale}
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
                defaults={{
                  marks: initial.marks,
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
          <SataPreview
            instruction={instruction}
            stem={stem}
            options={options}
            correctIds={correctIds}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// SataEditor — default standalone modal host. Same wiring as MCQ.
// ─────────────────────────────────────────────────────────────

export interface SataEditorProps {
  initial: SataEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function SataEditor({ initial, onClose, onSaved, onDeleted }: SataEditorProps) {
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
      title={isEdit ? `Edit SATA — ${initial.itemId}` : 'New SATA question'}
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
      <SataEditorBody
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

function defaultOptionRows(): OptionRow[] {
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: '',
    feedback: '',
  }));
}
