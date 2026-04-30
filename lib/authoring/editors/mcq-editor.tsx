// mynclex/lib/authoring/editors/mcq-editor.tsx
//
// MCQ editor — first concrete editor in the rebuild. One file holds
// every piece needed to author an MCQ:
//
//   - McqOptionList    : private — the option-list edit row
//                        (radio, text, feedback, remove).
//   - McqPreview       : private — the live pre-submit student view.
//   - McqEditorBody    : exported — the two-pane edit + preview body.
//                        Mountable anywhere (modal, wrapper-page pane).
//                        Receives `error` + `pending` from its host so
//                        it can show validation errors inline.
//   - McqEditor        : exported — the body wrapped in <ModalFrame>,
//                        used as the default standalone host. Wires
//                        the save / delete server actions, manages
//                        the typed-DELETE confirmation, and closes
//                        the modal on success.
//
// Slice 2: actions are live. Save and Delete buttons run real server
// actions against nclex_bank_items (admin) or nclex_tutor_questions
// (tutor). The form ID is shared between the body's <form> and the
// header's <button form="…"> so the Save button sits outside the
// form in the modal header but still submits it.

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
import type { McqEditorInitial } from './mcq-row-mapper';

// Re-export the shape so existing client callers can keep importing
// it from this file. The canonical definition (and the empty-initial
// constructor) live in mcq-row-mapper.ts so server pages can build
// one without crossing the 'use client' boundary.
export type { McqEditorInitial };

// ─────────────────────────────────────────────────────────────
// McqOptionList — option-list editor (private to this file).
// ─────────────────────────────────────────────────────────────

interface OptionRow {
  id: string;
  text: string;
  feedback: string;
}

interface McqOptionListProps {
  options: OptionRow[];
  correctId: string;
  onChange: (next: OptionRow[], correctId: string) => void;
  disabled: boolean;
}

function McqOptionList({ options, correctId, onChange, disabled }: McqOptionListProps) {
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const nextLetter = OPTION_LETTERS[options.length];
    onChange([...options, { id: nextLetter, text: '', feedback: '' }], correctId);
  }

  function removeOption(idx: number) {
    if (options.length <= MIN_OPTIONS) return;
    const removedId = options[idx].id;
    onChange(
      options.filter((_, i) => i !== idx),
      correctId === removedId ? '' : correctId,
    );
  }

  function updateText(idx: number, text: string) {
    onChange(
      options.map((o, i) => (i === idx ? { ...o, text } : o)),
      correctId,
    );
  }

  function updateFeedback(idx: number, feedback: string) {
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
      <p className="auth-hint">Mark one correct option.</p>

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
// McqPreview — dual-mode preview (private).
// Student view: empty radios.
// Answer-key view: option matching `correctId` highlighted with a
// filled green radio + "✓ Correct" pill.
// ─────────────────────────────────────────────────────────────

interface McqPreviewProps {
  instruction: string;
  stem: string;
  options: OptionRow[];
  correctId: string;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

function McqPreview({
  instruction,
  stem,
  options,
  correctId,
  viewMode,
  onViewModeChange,
}: McqPreviewProps) {
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
// McqEditorBody — the two-pane body. Mountable anywhere.
// Submits via its parent's onSubmit callback; renders error / pending
// state passed in from the host.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-mcq-form';

export interface McqEditorBodyProps {
  initial: McqEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  /**
   * Optional. Called from the form's onInput on every keystroke
   * or input event so the host's dirty guard can flip dirty=true.
   * No-op when omitted (e.g. when embedded somewhere that doesn't
   * track dirty state).
   */
  onDirty?: () => void;
  /**
   * Optional. Called when the toast is dismissed (auto or click) so
   * the host can clear any server-side error it owns. Body still
   * clears its own client validation error regardless.
   */
  onErrorDismiss?: () => void;
}

export function McqEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: McqEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  // Client-side validation surfaces through the same toast that shows
  // server errors. Pre-submit guard checks each tab; if anything's
  // missing we jump to the offending tab and raise a toast instead of
  // letting the server reject blind.
  const [clientError, setClientError] = useState<string | null>(null);
  // Dual-mode preview — defaults to 'student' (matches the prior
  // single-mode behaviour). Curator can flip to 'answer-key' to verify
  // the correct option highlights as expected.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');

  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initial.options.length > 0 ? initial.options : defaultOptionRows(),
  );
  const [correctId, setCorrectId] = useState<string>(initial.correct_id);
  // Lifted out of <ClassificationFields> so the tab strip can show a
  // red-dot indicator when the required Client Needs category is unset.
  const [category, setCategory] = useState(initial.client_needs_category);

  // Per-tab incompleteness — drives the red-dot indicator.
  const optionsWithText = options.filter((o) => o.text.trim().length > 0).length;
  const contentIncomplete =
    !stem.trim() || !correctId || optionsWithText < MIN_OPTIONS;
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
      <HiddenItemInputs type="MCQ" itemId={initial.itemId} surface={initial.surface} />

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
              <McqOptionList
                options={options}
                correctId={correctId}
                onChange={(opts, cid) => {
                  setOptions(opts);
                  setCorrectId(cid);
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
          <McqPreview
            instruction={instruction}
            stem={stem}
            options={options}
            correctId={correctId}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// McqEditor — default standalone modal host.
// Owns the save / delete action wiring and the typed-DELETE
// confirmation flow.
// ─────────────────────────────────────────────────────────────

export interface McqEditorProps {
  initial: McqEditorInitial;
  /** Closes the modal — caller decides what to do on close. */
  onClose: () => void;
  /** Called after a successful save. Caller typically refetches or revalidates. */
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  /** Called after a successful delete. */
  onDeleted?: (item_id: string) => void;
}

export function McqEditor({ initial, onClose, onSaved, onDeleted }: McqEditorProps) {
  const isEdit = initial.itemId !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  // Dirty guard — intercepts close attempts when the form has
  // unsaved edits. Defined first so the save / delete onSuccess
  // handlers below can call clearDirty() before onClose().
  const guard = useDirtyGuard({
    onClose,
    onSaveAndClose: () => {
      // Programmatic submit. The form's own onSubmit then fires
      // useSaveAction.submit which goes through the same path as
      // clicking Save in the modal header.
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
        // Delete throws away the row entirely; no point keeping
        // dirty state alive past this point.
        guard.clearDirty();
        onDeleted?.(result.item_id);
        onClose();
      }
    },
  });

  const pending = save.pending || del.pending;
  // Combine errors from both actions so whichever ran most recently
  // is the one shown.
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
      title={isEdit ? `Edit MCQ — ${initial.itemId}` : 'New MCQ question'}
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
      {confirmingDelete && (
        <div className="auth-delete-confirm" role="alertdialog" aria-label="Confirm delete">
          <p className="auth-delete-confirm-title">Delete <code>{initial.itemId}</code>?</p>
          <p className="auth-delete-confirm-hint">
            This is irreversible. Type <strong>DELETE</strong> to confirm.
          </p>
          <input
            type="text"
            className="auth-input"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder="Type DELETE"
            autoFocus
            disabled={del.pending}
          />
          <div className="auth-delete-confirm-actions">
            <button
              type="button"
              className="auth-btn auth-btn-ghost"
              onClick={cancelDelete}
              disabled={del.pending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="auth-btn auth-btn-danger"
              onClick={confirmDelete}
              disabled={deleteText !== 'DELETE' || del.pending}
            >
              {del.pending ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        </div>
      )}
      <McqEditorBody
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
