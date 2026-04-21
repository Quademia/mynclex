// mynclex/app/(app)/admin/bank/form.tsx
//
// Client component — the bank-item authoring form.
//
// Manages interactive bits only:
//   - question type selector (swaps the correct-answer control)
//   - variable-length option list (add/remove rows, A–F)
//   - per-option correct toggle (radio for MCQ/TF, checkbox for SATA/SELECT_N)
//   - select-N count field
//
// All other fields are uncontrolled — they post directly to the Server
// Action via plain <form> submission. Validation is server-authoritative;
// browser checks are a UX nicety.

'use client';

import { useState, useTransition } from 'react';
import {
  QUESTION_TYPES,
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  NURSING_SUBJECTS,
  BODY_SYSTEMS,
  DIFFICULTY_LEVELS,
  BLOOM_LEVELS,
  OPTION_LETTERS,
  MIN_OPTIONS,
  MAX_OPTIONS,
  DEFAULT_OPTIONS,
  type QuestionType,
  type ClientNeedsCategory,
} from '@/lib/bank/classifications';
import {
  createBankItemAction,
  updateBankItemAction,
  deleteBankItemAction,
  type ActionResult,
} from './actions';
import type { BankFormInitial } from '@/lib/bank/form-shape';

interface OptionRow {
  id: string;
  text: string;
  feedback: string;
}

export function BankForm({ initial, savedFlash }: { initial: BankFormInitial; savedFlash: boolean }) {
  const isEdit = initial.item_id !== null;

  const [type, setType] = useState<QuestionType>(initial.question_type);
  const [options, setOptions] = useState<OptionRow[]>(() => {
    if (initial.options.length > 0) return initial.options;
    return defaultOptionsFor(initial.question_type);
  });
  const [correctIds, setCorrectIds] = useState<Set<string>>(
    () => new Set(initial.correct_ids),
  );
  const [selectCount, setSelectCount] = useState<number>(initial.select_count || 2);
  const [category, setCategory] = useState<string>(initial.client_needs_category);

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Subcategory list depends on category.
  const subcatOptions = category && (CLIENT_NEEDS_CATEGORIES as readonly string[]).includes(category)
    ? CLIENT_NEEDS_SUBCATEGORIES[category as ClientNeedsCategory]
    : [];

  // ─────────────────────────────────────────────────────────
  // Type change — rebuild options for TF; otherwise keep but clear
  // correct selection (semantics differ between MCQ/SATA/SELECT_N).
  // Type change is disabled in edit mode (locked at the server too).
  // ─────────────────────────────────────────────────────────
  function onTypeChange(next: QuestionType) {
    if (isEdit) return;
    setType(next);
    setOptions(defaultOptionsFor(next));
    setCorrectIds(new Set());
    if (next === 'SELECT_N') setSelectCount(2);
  }

  // ─────────────────────────────────────────────────────────
  // Option list helpers.
  // ─────────────────────────────────────────────────────────
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    if (type === 'TF') return;
    const nextLetter = OPTION_LETTERS[options.length];
    setOptions([...options, { id: nextLetter, text: '', feedback: '' }]);
  }

  function removeOption(idx: number) {
    if (options.length <= MIN_OPTIONS) return;
    if (type === 'TF') return;
    const removedId = options[idx].id;
    const next = options.filter((_, i) => i !== idx);
    setOptions(next);
    if (correctIds.has(removedId)) {
      const newSet = new Set(correctIds);
      newSet.delete(removedId);
      setCorrectIds(newSet);
    }
  }

  function updateOptionText(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  }

  function updateOptionFeedback(idx: number, feedback: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, feedback } : o)));
  }

  function toggleCorrect(id: string) {
    const newSet = new Set(correctIds);
    if (type === 'MCQ' || type === 'TF') {
      // Single-correct types: replace selection.
      newSet.clear();
      newSet.add(id);
    } else if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setCorrectIds(newSet);
  }

  // ─────────────────────────────────────────────────────────
  // Submit — calls the right Server Action and surfaces errors.
  // ─────────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    // Inject the option arrays + correct ids from React state — the
    // input fields below are name-less (for the per-row state) so the
    // server has to receive them this way.
    formData.delete('option_id');
    formData.delete('option_text');
    formData.delete('option_feedback');
    formData.delete('correct_id');
    options.forEach((o) => {
      formData.append('option_id', o.id);
      formData.append('option_text', o.text);
      formData.append('option_feedback', o.feedback);
    });
    correctIds.forEach((id) => formData.append('correct_id', id));
    if (type === 'SELECT_N') {
      formData.set('select_count', String(selectCount));
    }
    formData.set('question_type', type);

    startTransition(async () => {
      const action = isEdit ? updateBankItemAction : createBankItemAction;
      const result: ActionResult | void = await action(formData);
      // Server Actions that redirect throw NEXT_REDIRECT; we only get a
      // result back on the failure branch.
      if (result && result.ok === false) {
        setError(result.error);
      }
    });
  }

  function onDelete() {
    if (!isEdit || !initial.item_id) return;
    if (!confirm(`Delete ${initial.item_id}? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.set('item_id', initial.item_id);
    startTransition(async () => {
      const result: ActionResult | void = await deleteBankItemAction(fd);
      if (result && result.ok === false) {
        setError(result.error);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <form className="bank-form" onSubmit={onSubmit}>
      <div className="bank-form-header">
        <h2 className="bank-form-title">
          {isEdit ? `Edit ${initial.item_id}` : 'New Question'}
        </h2>
        {isEdit && (
          <a href="/admin/bank" className="bank-form-cancel">
            + New
          </a>
        )}
      </div>

      {savedFlash && !error && (
        <div className="bank-form-flash">Saved ✓</div>
      )}
      {error && (
        <div className="bank-form-error">{error}</div>
      )}

      {/* Question type */}
      <div className="bank-fg">
        <label htmlFor="qtype" className="bank-label">Question type *</label>
        <select
          id="qtype"
          value={type}
          onChange={(e) => onTypeChange(e.target.value as QuestionType)}
          disabled={isEdit}
          className="bank-input"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {isEdit && (
          <p className="bank-hint">Type cannot be changed after creation.</p>
        )}
      </div>

      {/* Stem */}
      <div className="bank-fg">
        <label htmlFor="stem" className="bank-label">Stem *</label>
        <textarea
          id="stem"
          name="stem"
          rows={4}
          required
          defaultValue={initial.stem}
          placeholder="Enter the full question text…"
          className="bank-input"
        />
      </div>

      {/* Options */}
      <div className="bank-fg">
        <div className="bank-label-row">
          <label className="bank-label">Options *</label>
          {type !== 'TF' && (
            <button
              type="button"
              className="bank-link-btn"
              onClick={addOption}
              disabled={options.length >= MAX_OPTIONS}
            >
              + Add option
            </button>
          )}
        </div>
        <p className="bank-hint">
          {type === 'MCQ' && 'Mark one correct option.'}
          {type === 'TF' && 'True / False locked.'}
          {type === 'SATA' && 'Tick all correct options.'}
          {type === 'SELECT_N' && `Tick exactly ${selectCount} correct options.`}
        </p>

        {options.map((opt, idx) => {
          const isChecked = correctIds.has(opt.id);
          return (
            <div key={opt.id} className="bank-option-row">
              <div className="bank-option-correct">
                {(type === 'MCQ' || type === 'TF') ? (
                  <input
                    type="radio"
                    name="opt_correct_radio"
                    checked={isChecked}
                    onChange={() => toggleCorrect(opt.id)}
                    title="Mark as correct"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCorrect(opt.id)}
                    title="Mark as correct"
                  />
                )}
              </div>
              <div className="bank-option-letter">{opt.id}</div>
              <div className="bank-option-fields">
                <input
                  type="text"
                  value={opt.text}
                  onChange={(e) => updateOptionText(idx, e.target.value)}
                  placeholder={`Option ${opt.id} text…`}
                  readOnly={type === 'TF'}
                  className="bank-input"
                />
                <input
                  type="text"
                  value={opt.feedback}
                  onChange={(e) => updateOptionFeedback(idx, e.target.value)}
                  placeholder="Per-option feedback (optional)…"
                  className="bank-input bank-input--sm"
                />
              </div>
              {type !== 'TF' && (
                <button
                  type="button"
                  className="bank-row-remove"
                  onClick={() => removeOption(idx)}
                  disabled={options.length <= MIN_OPTIONS}
                  title="Remove option"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* SELECT_N count */}
      {type === 'SELECT_N' && (
        <div className="bank-fg">
          <label htmlFor="select_count" className="bank-label">Select exactly *</label>
          <input
            id="select_count"
            type="number"
            min={1}
            max={options.length}
            value={selectCount}
            onChange={(e) => setSelectCount(parseInt(e.target.value, 10) || 1)}
            className="bank-input bank-input--num"
          />
          <p className="bank-hint">Students must pick exactly this many options.</p>
        </div>
      )}

      {/* Rationale */}
      <div className="bank-fg">
        <label htmlFor="rationale" className="bank-label">Overall rationale</label>
        <textarea
          id="rationale"
          name="rationale"
          rows={3}
          defaultValue={initial.rationale}
          placeholder="Explain why the correct answer is correct…"
          className="bank-input"
        />
      </div>

      <div className="bank-fg">
        <label htmlFor="rationale_img" className="bank-label">Rationale image URL</label>
        <input
          id="rationale_img"
          name="rationale_img"
          type="url"
          defaultValue={initial.rationale_img}
          placeholder="https://… (paste a hosted image URL)"
          className="bank-input"
        />
        <p className="bank-hint">
          Paste a hosted URL for now. Direct upload lands in a later slice.
        </p>
      </div>

      {/* Classification */}
      <div className="bank-section-label">Classification</div>

      <div className="bank-grid-2">
        <div className="bank-fg">
          <label htmlFor="cnc" className="bank-label">Client Needs category *</label>
          <select
            id="cnc"
            name="client_needs_category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="bank-input"
          >
            <option value="">— Select —</option>
            {CLIENT_NEEDS_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="bank-fg">
          <label htmlFor="cns" className="bank-label">Subcategory</label>
          <select
            id="cns"
            name="client_needs_subcategory"
            defaultValue={initial.client_needs_subcategory}
            className="bank-input"
            disabled={subcatOptions.length === 0}
          >
            <option value="">— Select —</option>
            {subcatOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bank-grid-3">
        <div className="bank-fg">
          <label htmlFor="ns" className="bank-label">Nursing subject</label>
          <select id="ns" name="nursing_subject" defaultValue={initial.nursing_subject} className="bank-input">
            <option value="">— Select —</option>
            {NURSING_SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="bank-fg">
          <label htmlFor="bs" className="bank-label">Body system</label>
          <select id="bs" name="body_system" defaultValue={initial.body_system} className="bank-input">
            <option value="">— Select —</option>
            {BODY_SYSTEMS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="bank-fg">
          <label htmlFor="diff" className="bank-label">Difficulty</label>
          <select id="diff" name="difficulty" defaultValue={initial.difficulty} className="bank-input">
            <option value="">— Select —</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bank-grid-2">
        <div className="bank-fg">
          <label htmlFor="topic" className="bank-label">Topic</label>
          <input id="topic" name="topic" type="text" defaultValue={initial.topic} placeholder="e.g. Fall prevention" className="bank-input" />
        </div>
        <div className="bank-fg">
          <label htmlFor="subtopic" className="bank-label">Subtopic</label>
          <input id="subtopic" name="subtopic" type="text" defaultValue={initial.subtopic} placeholder="e.g. Restraint alternatives" className="bank-input" />
        </div>
      </div>

      <div className="bank-grid-2">
        <div className="bank-fg">
          <label htmlFor="bloom" className="bank-label">Bloom&apos;s level</label>
          <select id="bloom" name="bloom_level" defaultValue={initial.bloom_level} className="bank-input">
            <option value="">— Select —</option>
            {BLOOM_LEVELS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="bank-fg">
          <label htmlFor="tags" className="bank-label">Tags</label>
          <input id="tags" name="tags" type="text" defaultValue={initial.tags} placeholder="comma, separated, tags" className="bank-input" />
        </div>
      </div>

      {/* Housekeeping */}
      <div className="bank-section-label">Housekeeping</div>

      <div className="bank-grid-3">
        <div className="bank-fg">
          <label htmlFor="marks" className="bank-label">Marks</label>
          <input id="marks" name="marks" type="number" min={0.5} step={0.5} defaultValue={initial.marks} className="bank-input" />
        </div>
        <div className="bank-fg">
          <label htmlFor="qref" className="bank-label">Question ref</label>
          <input id="qref" name="question_ref" type="text" defaultValue={initial.question_ref} placeholder="e.g. CARDIO-Q12" className="bank-input" />
        </div>
        <div className="bank-fg">
          <label htmlFor="batch" className="bank-label">Batch ID</label>
          <input id="batch" name="batch_id" type="text" defaultValue={initial.batch_id} placeholder="e.g. BATCH_2026_05" className="bank-input" />
        </div>
      </div>

      <div className="bank-checks">
        <label className="bank-check">
          <input type="checkbox" name="is_published" defaultChecked={initial.is_published} />
          <span>Published (visible to students)</span>
        </label>
        <label className="bank-check">
          <input type="checkbox" name="is_free_sample" defaultChecked={initial.is_free_sample} />
          <span>Free sample</span>
        </label>
        <label className="bank-check">
          <input
            type="checkbox"
            name="is_builder_visible"
            defaultChecked={initial.is_builder_visible}
            value="on"
          />
          <span>Visible in student quiz builder</span>
        </label>
        <label className="bank-check">
          <input
            type="checkbox"
            name="shuffle_options"
            defaultChecked={initial.shuffle_options}
            value="on"
          />
          <span>Shuffle options when shown to students</span>
        </label>
      </div>

      {/* Footer actions */}
      <div className="bank-form-footer">
        <button type="submit" disabled={pending} className="bank-btn bank-btn--primary">
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create question'}
        </button>
        {isEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="bank-btn bank-btn--danger"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function defaultOptionsFor(type: QuestionType): OptionRow[] {
  if (type === 'TF') {
    return [
      { id: 'A', text: 'True', feedback: '' },
      { id: 'B', text: 'False', feedback: '' },
    ];
  }
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: '',
    feedback: '',
  }));
}

