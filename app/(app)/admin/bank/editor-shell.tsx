// mynclex/app/(app)/admin/bank/editor-shell.tsx
//
// The ~80% of the bank authoring form that every question type shares:
// type selector, stem, rationale, classification axes, housekeeping
// toggles, submit/delete actions, flash + error display. The ~20% that
// differs per type (option list, correct-answer control, SELECT_N
// count) is delegated to the per-type editor chosen by `type`.
//
// Slice 1.4 layout: a sticky top action bar carries Save / Delete /
// Cancel (always visible while scrolling). Form body is split into
// three collapsible accordion sections — Content (open by default),
// Classification and Housekeeping (collapsed). Native <details>
// elements handle the open/close state; no extra JS.
//
// Editor components render inputs with `name=` attributes, so their
// values flow straight into the outer FormData — this shell does not
// need to marshal editor state manually.

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  QUESTION_TYPES,
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
  NURSING_SUBJECTS,
  BODY_SYSTEMS,
  DIFFICULTY_LEVELS,
  BLOOM_LEVELS,
  type QuestionType,
  type ClientNeedsCategory,
} from '@/lib/bank/classifications';
import { McqEditor } from '@/lib/bank/editors/mcq-editor';
import { TfEditor } from '@/lib/bank/editors/tf-editor';
import { SataEditor } from '@/lib/bank/editors/sata-editor';
import { SelectNEditor } from '@/lib/bank/editors/select-n-editor';
import { MatrixEditor } from '@/lib/bank/editors/matrix-editor';
import { BowtieEditor } from '@/lib/bank/editors/bowtie-editor';
import { ClozeEditor } from '@/lib/bank/editors/cloze-editor';
import { HighlightEditor } from '@/lib/bank/editors/highlight-editor';
import { DragDropEditor } from '@/lib/bank/editors/drag-drop-editor';
import {
  createBankItemAction,
  updateBankItemAction,
  deleteBankItemAction,
  type ActionResult,
} from './actions';
import type { BankFormInitial } from '@/lib/bank/form-shape';

export function EditorShell({
  initial,
  savedFlash,
  cancelHref = '/admin/bank',
  surface = 'admin',
}: {
  initial: BankFormInitial;
  savedFlash: boolean;
  cancelHref?: string;
  // Slice 2.1: which bank surface owns this row. Passed through to the
  // server actions via a hidden input so create/update/delete can pick
  // the right table and role gate.
  surface?: 'admin' | 'tutor';
}) {
  const isEdit = initial.item_id !== null;

  const [type, setType] = useState<QuestionType>(initial.question_type);
  const [category, setCategory] = useState<string>(initial.client_needs_category);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subcatOptions =
    category && (CLIENT_NEEDS_CATEGORIES as readonly string[]).includes(category)
      ? CLIENT_NEEDS_SUBCATEGORIES[category as ClientNeedsCategory]
      : [];

  // Type change is disabled in edit mode (the disabled <select> won't
  // fire onChange in that case; the belt-and-braces guard stays anyway).
  function onTypeChange(next: QuestionType) {
    if (isEdit) return;
    setType(next);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

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
    fd.set('surface', surface);
    startTransition(async () => {
      const result: ActionResult | void = await deleteBankItemAction(fd);
      if (result && result.ok === false) {
        setError(result.error);
      }
    });
  }

  // Only the editor matching the initial type inherits the existing
  // option list + correct ids. When the user swaps type in create mode,
  // the new editor mounts with its own defaults (empty option list).
  const editorInheritsInitial = type === initial.question_type;

  function renderEditor() {
    switch (type) {
      case 'MCQ':
        return (
          <McqEditor
            key="mcq"
            initialOptions={editorInheritsInitial ? initial.options : []}
            initialCorrectId={
              editorInheritsInitial ? initial.correct_ids[0] ?? '' : ''
            }
          />
        );
      case 'TF':
        return (
          <TfEditor
            key="tf"
            initialFeedback={
              editorInheritsInitial
                ? Object.fromEntries(
                    initial.options.map((o) => [o.id, o.feedback]),
                  )
                : {}
            }
            initialCorrectId={
              editorInheritsInitial ? initial.correct_ids[0] ?? '' : ''
            }
          />
        );
      case 'SATA':
        return (
          <SataEditor
            key="sata"
            initialOptions={editorInheritsInitial ? initial.options : []}
            initialCorrectIds={
              editorInheritsInitial ? initial.correct_ids : []
            }
          />
        );
      case 'SELECT_N':
        return (
          <SelectNEditor
            key="select_n"
            initialOptions={editorInheritsInitial ? initial.options : []}
            initialCorrectIds={
              editorInheritsInitial ? initial.correct_ids : []
            }
            initialSelectCount={
              editorInheritsInitial ? initial.select_count : 2
            }
          />
        );
      case 'MATRIX':
        return (
          <MatrixEditor
            key="matrix"
            initialRowLabel={editorInheritsInitial ? initial.matrix_row_label : ''}
            initialRows={editorInheritsInitial ? initial.matrix_rows : []}
            initialColumns={editorInheritsInitial ? initial.matrix_columns : []}
            initialCorrect={editorInheritsInitial ? initial.matrix_correct : {}}
          />
        );
      case 'BOWTIE':
        return (
          <BowtieEditor
            key="bowtie"
            initialLeftLabel={editorInheritsInitial ? initial.bowtie_left_label : 'Actions to take'}
            initialLeftTokens={editorInheritsInitial ? initial.bowtie_left_tokens : []}
            initialCentreLabel={editorInheritsInitial ? initial.bowtie_centre_label : 'Condition'}
            initialCentreTokens={editorInheritsInitial ? initial.bowtie_centre_tokens : []}
            initialRightLabel={editorInheritsInitial ? initial.bowtie_right_label : 'Parameters to monitor'}
            initialRightTokens={editorInheritsInitial ? initial.bowtie_right_tokens : []}
          />
        );
      case 'CLOZE':
        return (
          <ClozeEditor
            key="cloze"
            initialBlanks={editorInheritsInitial ? initial.cloze_blanks : []}
            initialStem={editorInheritsInitial ? initial.stem : ''}
          />
        );
      case 'HIGHLIGHT':
        return (
          <HighlightEditor
            key="highlight"
            initialChunks={editorInheritsInitial ? initial.highlight_chunks : []}
            initialStem={editorInheritsInitial ? initial.stem : ''}
          />
        );
      case 'DRAG_DROP':
        return (
          <DragDropEditor
            key="drag_drop"
            initialSubtype={editorInheritsInitial ? initial.dd_subtype : 'ORDERED'}
            initialSlots={editorInheritsInitial ? initial.dd_slots : []}
            initialTokens={
              editorInheritsInitial
                ? initial.dd_tokens
                : [
                    { id: 't1', text: '' },
                    { id: 't2', text: '' },
                    { id: 't3', text: '' },
                  ]
            }
            initialStem={editorInheritsInitial ? initial.stem : ''}
          />
        );
    }
  }

  return (
    <form className="bank-form" onSubmit={onSubmit}>
      {/* question_type is posted via a hidden input so it survives the
          disabled <select> in edit mode. item_id is required by the
          update + delete actions. surface tells the action which table
          to write to (admin → nclex_bank_items, tutor →
          nclex_tutor_questions). */}
      <input type="hidden" name="question_type" value={type} />
      <input type="hidden" name="surface" value={surface} />
      {isEdit && initial.item_id && (
        <input type="hidden" name="item_id" value={initial.item_id} />
      )}

      {/* Sticky top action bar: Save / Delete / Cancel stay visible as
          the user scrolls through the form body. */}
      <div className="bank-form-topbar">
        <h2 className="bank-form-topbar-title">
          {isEdit ? `Edit ${initial.item_id}` : 'New Question'}
        </h2>
        <div className="bank-form-topbar-actions">
          <Link href={cancelHref} className="bank-btn bank-btn-ghost">
            Cancel
          </Link>
          {isEdit && (
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="bank-btn bank-btn-danger"
            >
              Delete
            </button>
          )}
          <button type="submit" disabled={pending} className="bank-btn bank-btn-primary">
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create question'}
          </button>
        </div>
      </div>

      {savedFlash && !error && (
        <div className="bank-form-flash">Saved ✓</div>
      )}
      {error && (
        <div className="bank-form-error">{error}</div>
      )}

      {/* Content section — open by default */}
      <details className="bank-section" open>
        <summary className="bank-section-summary">
          <span className="bank-section-icon" aria-hidden="true">▶</span>
          Content
        </summary>
        <div className="bank-section-body">
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

          {/* Instruction — optional, shell-level (Slice 1.8). Shown above
              the stem on every type. DB column is nullable; empty input
              stores as NULL. The cloze editor reads from the stem DOM
              node by id, so we expose the stem with id="bank-stem". */}
          <div className="bank-fg bank-instruction-wrap">
            <div className="bank-instruction-label">
              <span className="bank-instruction-icon">!</span>
              Instruction
              <span className="bank-instruction-optional">— optional</span>
            </div>
            <textarea
              name="instruction"
              defaultValue={initial.instruction}
              className="bank-instruction-input"
              rows={2}
              placeholder="Optional directive the student sees above the stem, e.g. 'Complete the sentence' or 'Select ALL that apply'. Leave blank if the stem is self-sufficient."
            />
            <p className="bank-instruction-hint">
              Optional. When blank, the student sees only the stem. Available on every question type.
            </p>
          </div>

          {/* Stem */}
          <div className="bank-fg">
            <label htmlFor="bank-stem" className="bank-label">Stem *</label>
            <textarea
              id="bank-stem"
              name="stem"
              rows={4}
              required
              defaultValue={initial.stem}
              placeholder="Enter the full question text…"
              className="bank-input"
            />
          </div>

          {/* Type-specific editor (options, correct-answer, SELECT_N count) */}
          {renderEditor()}

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
        </div>
      </details>

      {/* Classification — collapsed by default */}
      <details className="bank-section">
        <summary className="bank-section-summary">
          <span className="bank-section-icon" aria-hidden="true">▶</span>
          Classification
        </summary>
        <div className="bank-section-body">
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
        </div>
      </details>

      {/* Housekeeping — collapsed by default */}
      <details className="bank-section">
        <summary className="bank-section-summary">
          <span className="bank-section-icon" aria-hidden="true">▶</span>
          Housekeeping
        </summary>
        <div className="bank-section-body">
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
        </div>
      </details>
    </form>
  );
}
