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
//   - McqEditor        : exported — the body wrapped in <ModalFrame>,
//                        used as the default standalone host.
//
// Slice 1 is read-only — the form has no `action`, the Save / Delete
// buttons render disabled. Slice 2 wires the server action.

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
import { Section } from '@/lib/authoring/atoms/section';
import { StemField } from '@/lib/authoring/atoms/stem-field';
import { InstructionField } from '@/lib/authoring/atoms/instruction-field';
import { RationaleFields } from '@/lib/authoring/atoms/rationale-fields';
import { ClassificationFields } from '@/lib/authoring/atoms/classification-fields';
import {
  HousekeepingFields,
  type HousekeepingMode,
} from '@/lib/authoring/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/authoring/atoms/hidden-item-inputs';

// ─────────────────────────────────────────────────────────────
// Initial-value shape this editor accepts. A trimmed-down view of
// the legacy BankFormInitial — just the fields MCQ actually needs.
// Slice 2 will introduce a save action that maps from this shape
// back to the DB columns.
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
}

function McqOptionList({ options, correctId, onChange }: McqOptionListProps) {
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
          disabled={options.length >= MAX_OPTIONS}
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
              className="auth-input"
            />
            <input
              type="text"
              name="option_feedback"
              value={opt.feedback}
              onChange={(e) => updateFeedback(idx, e.target.value)}
              placeholder="Per-option feedback (optional)…"
              className="auth-input auth-input--sm"
            />
            <input type="hidden" name="option_id" value={opt.id} />
          </div>
          <button
            type="button"
            className="auth-row-remove"
            onClick={() => removeOption(idx)}
            disabled={options.length <= MIN_OPTIONS}
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
// McqPreview — pre-submit student view (private to this file).
// Reads ONLY from `content`-shape data: instruction, stem, options.
// Never reads correctId or feedback (those are post-submit only,
// out of scope for the rebuild).
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
// Slice 1: no form action, Save/Delete disabled.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-mcq-form';

export interface McqEditorBodyProps {
  initial: McqEditorInitial;
}

export function McqEditorBody({ initial }: McqEditorBodyProps) {
  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initial.options.length > 0 ? initial.options : defaultOptionRows(),
  );
  const [correctId, setCorrectId] = useState<string>(initial.correct_id);

  const isEdit = initial.itemId !== null;

  return (
    <form id={FORM_ID} className="auth-form" onSubmit={(e) => e.preventDefault()}>
      <HiddenItemInputs type="MCQ" itemId={initial.itemId} surface={initial.surface} />

      <div className="auth-split">
        <div className="auth-edit">
          <Section title="Content" open>
            <InstructionField value={instruction} onChange={setInstruction} />
            <StemField value={stem} onChange={setStem} />
            <McqOptionList
              options={options}
              correctId={correctId}
              onChange={(opts, cid) => {
                setOptions(opts);
                setCorrectId(cid);
              }}
            />
            <RationaleFields
              defaultRationale={initial.rationale}
              defaultRationaleImg={initial.rationale_img}
            />
          </Section>

          <Section title="Classification">
            <ClassificationFields
              defaults={{
                client_needs_category: initial.client_needs_category,
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
          </Section>

          <Section title="Housekeeping">
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
          </Section>
        </div>

        <div className="auth-preview">
          <McqPreview instruction={instruction} stem={stem} options={options} />
        </div>
      </div>

      {/* Slice 1 banner — temporary; removed when the save action lands in Slice 2. */}
      <p className="auth-readonly-note">
        Slice 1 (read-only sandbox). Save / Delete are disabled. Edits live only in this session.
        {isEdit && initial.itemId && <> Editing <code>{initial.itemId}</code>.</>}
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// McqEditor — default standalone host. Wraps the body in a modal.
// Bank list (Slice 2) will mount this directly.
// ─────────────────────────────────────────────────────────────

export interface McqEditorProps {
  initial: McqEditorInitial;
  onClose: () => void;
}

export function McqEditor({ initial, onClose }: McqEditorProps) {
  const isEdit = initial.itemId !== null;
  return (
    <ModalFrame
      title={isEdit ? 'Edit MCQ question' : 'New MCQ question'}
      onClose={onClose}
      actions={
        <EditorActions
          canDelete={isEdit}
          pending={true}
          onCancel={onClose}
          formId={FORM_ID}
        />
      }
    >
      <McqEditorBody initial={initial} />
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
