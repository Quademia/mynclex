// mynclex/lib/authoring/editors/select-n-editor.tsx
//
// SELECT_N (Select Exactly N) editor — fourth concrete editor in the
// rebuild. Variant of SATA: same checkbox option list, plus a "Number
// to select" input that constrains how many options the student must
// tick. The form posts `name="select_count"` alongside the option /
// correct_id arrays so the server-side parser can enforce the count.
//
// Behaviour notes:
//   - select_count is clamped to [1, optionsWithText] in the editor;
//     the parser re-checks server-side.
//   - A red "exactly N must be ticked" hint replaces SATA's "at least
//     one" hint.
//   - Content tab is incomplete unless tickedCount === select_count.

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
import type { SelectNEditorInitial } from './select-n-row-mapper';

export type { SelectNEditorInitial };

// ─────────────────────────────────────────────────────────────
// SelectNOptionList — checkbox option list (private). Same shape as
// SATA's, hint copy reflects the exact-count requirement.
// ─────────────────────────────────────────────────────────────

interface OptionRow {
  id: string;
  text: string;
  feedback: string;
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
// SelectNCountField — number input + helper hint. Posts as
// `name="select_count"`. Clamped to [1, optionsWithText] in the
// editor; the server parser re-checks.
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
// SelectNPreview — pre-submit student view (private). Renders an
// instruction line ("Select N") above the checkbox option list.
// ─────────────────────────────────────────────────────────────

interface SelectNPreviewProps {
  instruction: string;
  stem: string;
  options: OptionRow[];
  selectCount: number;
}

function SelectNPreview({ instruction, stem, options, selectCount }: SelectNPreviewProps) {
  return (
    <div className="auth-preview-card">
      <div className="auth-preview-tag">Pre-submit · student view</div>
      {instruction.trim() && (
        <p className="auth-preview-instruction">{instruction}</p>
      )}
      <div className="auth-preview-stem">
        {stem.trim() || <span className="auth-preview-placeholder">Stem appears here…</span>}
      </div>
      <p className="auth-preview-select-n">
        Select exactly <strong>{selectCount}</strong>.
      </p>
      <ol className="auth-preview-options">
        {options.length === 0 && (
          <li className="auth-preview-placeholder">Options appear here as you add them.</li>
        )}
        {options.map((opt) => (
          <li key={opt.id} className="auth-preview-option">
            <span className="auth-preview-checkbox" aria-hidden="true" />
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
// SelectNEditorBody — two-pane edit + preview body. Mountable anywhere.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-select-n-form';

export interface SelectNEditorBodyProps {
  initial: SelectNEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
}

export function SelectNEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
}: SelectNEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');

  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initial.options.length > 0 ? initial.options : defaultOptionRows(),
  );
  const [correctIds, setCorrectIds] = useState<Set<string>>(
    () => new Set(initial.correct_ids),
  );
  const [selectCount, setSelectCount] = useState<number>(initial.select_count);
  const [category, setCategory] = useState(initial.client_needs_category);

  const optionsWithText = options.filter((o) => o.text.trim().length > 0).length;

  // Clamp selectCount to the current options-with-text upper bound
  // for display only; saved value is whatever's in the input + parser
  // re-validates server-side.
  const effectiveCount = Math.min(
    Math.max(1, selectCount),
    Math.max(1, optionsWithText),
  );

  const contentIncomplete =
    !stem.trim() ||
    optionsWithText < MIN_OPTIONS ||
    correctIds.size !== effectiveCount;
  const classificationIncomplete = !category;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs type="SELECT_N" itemId={initial.itemId} surface={initial.surface} />

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
              <SelectNOptionList
                options={options}
                correctIds={correctIds}
                selectCount={effectiveCount}
                onChange={(opts, cids) => {
                  setOptions(opts);
                  setCorrectIds(cids);
                }}
                disabled={pending}
              />
              <SelectNCountField
                value={selectCount}
                max={Math.max(1, optionsWithText)}
                disabled={pending}
                onChange={setSelectCount}
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
          <SelectNPreview
            instruction={instruction}
            stem={stem}
            options={options}
            selectCount={effectiveCount}
          />
        </div>
      </div>
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
      <SelectNEditorBody
        initial={initial}
        error={error}
        pending={pending}
        onSubmit={save.submit}
        onDirty={guard.markDirty}
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
