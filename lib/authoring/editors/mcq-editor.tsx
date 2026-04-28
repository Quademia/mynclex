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
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/authoring/atoms/modal-frame';
import { EditorActions } from '@/lib/authoring/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/authoring/atoms/editor-tabs';
import { StemField } from '@/lib/authoring/atoms/stem-field';
import { InstructionField } from '@/lib/authoring/atoms/instruction-field';
import { RationaleFields } from '@/lib/authoring/atoms/rationale-fields';
import { ClassificationFields } from '@/lib/authoring/atoms/classification-fields';
import {
  HousekeepingFields,
  type HousekeepingMode,
} from '@/lib/authoring/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/authoring/atoms/hidden-item-inputs';
import { useSaveAction } from '@/lib/authoring/hooks/use-save-action';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/authoring/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/authoring/actions/delete-question';

// ─────────────────────────────────────────────────────────────
// Initial-value shape this editor accepts.
// ─────────────────────────────────────────────────────────────

export interface McqEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  options: { id: string; text: string; feedback: string }[];
  correct_id: string;
  client_needs_category: string;
  client_needs_subcategory: string;
  nursing_subject: string;
  body_system: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  bloom_level: string;
  tags: string;
  is_published: boolean;
  is_free_sample: boolean;
  is_builder_visible: boolean;
  marks: number;
  shuffle_options: boolean;
  question_ref: string;
  batch_id: string;
}

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
// McqPreview — pre-submit student view (private).
// ─────────────────────────────────────────────────────────────

interface McqPreviewProps {
  instruction: string;
  stem: string;
  options: OptionRow[];
}

function McqPreview({ instruction, stem, options }: McqPreviewProps) {
  return (
    <div className="auth-preview-card">
      <div className="auth-preview-tag">Pre-submit · student view</div>
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
        {options.map((opt) => (
          <li key={opt.id} className="auth-preview-option">
            <span className="auth-preview-radio" aria-hidden="true" />
            <span className="auth-preview-letter">{opt.id}.</span>
            <span className="auth-preview-text">
              {opt.text.trim() || (
                <span className="auth-preview-placeholder">Option {opt.id} text…</span>
              )}
            </span>
          </li>
        ))}
      </ol>
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
}

export function McqEditorBody({
  initial,
  error,
  pending,
  onSubmit,
}: McqEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');

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
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <form id={FORM_ID} className="auth-form" onSubmit={handleSubmit}>
      <HiddenItemInputs type="MCQ" itemId={initial.itemId} surface={initial.surface} />

      {error && (
        <div className="auth-error" role="alert">{error}</div>
      )}

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
          <McqPreview instruction={instruction} stem={stem} options={options} />
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

  const save = useSaveAction<SaveResult>(saveQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        onSaved?.({ item_id: result.item_id, created: result.created });
        onClose();
      }
    },
  });

  const del = useSaveAction<DeleteResult>(deleteQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
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
      onClose={pending ? () => undefined : onClose}
      actions={
        <EditorActions
          canDelete={isEdit}
          pending={pending || confirmingDelete}
          onCancel={onClose}
          onDelete={isEdit ? startDelete : undefined}
          formId={FORM_ID}
        />
      }
    >
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

/** Empty initial for a fresh MCQ. Used by the bank-list-v2 "+ New question" flow. */
export function emptyMcqInitial(surface: 'admin' | 'tutor'): McqEditorInitial {
  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    options: defaultOptionRows(),
    correct_id: '',
    client_needs_category: '',
    client_needs_subcategory: '',
    nursing_subject: '',
    body_system: '',
    topic: '',
    subtopic: '',
    difficulty: '',
    bloom_level: '',
    tags: '',
    is_published: false,
    is_free_sample: false,
    is_builder_visible: true,
    marks: 1,
    shuffle_options: true,
    question_ref: '',
    batch_id: '',
  };
}
