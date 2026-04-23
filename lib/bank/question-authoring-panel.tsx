// mynclex/lib/bank/question-authoring-panel.tsx
//
// Reusable question-authoring surface extracted from EditorShell in
// Slice 1.11b so the same body can appear in two places:
//   1. Standalone bank editor (EditorShell wraps this in a form +
//      topbar + save/delete buttons).
//   2. Case Study editor's right pane — one panel per active slot,
//      nested inside the case editor's own form (Phase 3 work).
//
// What the panel owns
//   - The three accordions (Content / Classification / Housekeeping).
//   - Question-type select + hidden `question_type` input mirroring it.
//   - Category → subcategory cascade state (controlled <select>s need
//     this because the subcategory option list depends on the chosen
//     category).
//   - The hidden `item_id` input in edit mode.
//
// What the panel does NOT own
//   - Any <form> wrapper.
//   - Topbar / Save / Delete / Cancel buttons.
//   - Server-action wiring.
//   - Flash / error display.
//   - The `surface` hidden input (shell-level — one surface for the
//     whole form, not per-panel).
//
// Mode-aware rendering
//   - 'standalone': every accordion field renders normally. Housekeeping
//     shows all four checkboxes (is_published, is_free_sample,
//     is_builder_visible, shuffle_options).
//   - 'case-child': is_published and is_builder_visible are NOT shown.
//     The case editor's server action sets them centrally (builder
//     always TRUE; published follows the parent case's flag). Every
//     other field renders the same way as standalone.
//
// fieldPrefix
//   Optional. When empty (standalone) it's a no-op. When populated
//   ('q1_', 'q2_', etc. — the case editor sets this per slot in
//   Phase 3) it prefixes every `name=` attribute the panel emits so
//   six panels can coexist in one form without clobbering each other.
//   Per-type editors in `lib/bank/editors/` are NOT yet prefix-aware
//   — Phase 3 adds that via a prop. For Phase 2 (standalone-only
//   refactor) fieldPrefix stays '' and the editors work unchanged.

'use client';

import { useState } from 'react';
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
} from './classifications';
import { McqEditor } from './editors/mcq-editor';
import { TfEditor } from './editors/tf-editor';
import { SataEditor } from './editors/sata-editor';
import { SelectNEditor } from './editors/select-n-editor';
import { MatrixEditor } from './editors/matrix-editor';
import { BowtieEditor } from './editors/bowtie-editor';
import { ClozeEditor } from './editors/cloze-editor';
import { HighlightEditor } from './editors/highlight-editor';
import { DragDropEditor } from './editors/drag-drop-editor';
import type { BankFormInitial } from './form-shape';

export type PanelMode = 'standalone' | 'case-child';

export interface QuestionAuthoringPanelProps {
  mode: PanelMode;
  fieldPrefix?: string;
  initial: BankFormInitial;
}

export function QuestionAuthoringPanel({
  mode,
  fieldPrefix = '',
  initial,
}: QuestionAuthoringPanelProps) {
  const isEdit = initial.item_id !== null;

  const [type, setType] = useState<QuestionType>(initial.question_type);
  const [category, setCategory] = useState<string>(initial.client_needs_category);

  // Name-prefixing helper. Placed next to state so the rendering code
  // stays a thin wrapper: `name={fn('stem')}` reads as `name="stem"`.
  // Returns the original name when fieldPrefix is '' — zero behaviour
  // change for standalone callers.
  const fn = (name: string) => `${fieldPrefix}${name}`;

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
    <>
      {/* Hidden inputs the panel owns — question_type mirrors the
          visible select (which has no name= attribute), and item_id is
          needed by the update action when editing. */}
      <input type="hidden" name={fn('question_type')} value={type} />
      {isEdit && initial.item_id && (
        <input type="hidden" name={fn('item_id')} value={initial.item_id} />
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
              name={fn('instruction')}
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
              name={fn('stem')}
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
              name={fn('rationale')}
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
              name={fn('rationale_img')}
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
                name={fn('client_needs_category')}
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
                name={fn('client_needs_subcategory')}
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
              <select id="ns" name={fn('nursing_subject')} defaultValue={initial.nursing_subject} className="bank-input">
                <option value="">— Select —</option>
                {NURSING_SUBJECTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="bank-fg">
              <label htmlFor="bs" className="bank-label">Body system</label>
              <select id="bs" name={fn('body_system')} defaultValue={initial.body_system} className="bank-input">
                <option value="">— Select —</option>
                {BODY_SYSTEMS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="bank-fg">
              <label htmlFor="diff" className="bank-label">Difficulty</label>
              <select id="diff" name={fn('difficulty')} defaultValue={initial.difficulty} className="bank-input">
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
              <input id="topic" name={fn('topic')} type="text" defaultValue={initial.topic} placeholder="e.g. Fall prevention" className="bank-input" />
            </div>
            <div className="bank-fg">
              <label htmlFor="subtopic" className="bank-label">Subtopic</label>
              <input id="subtopic" name={fn('subtopic')} type="text" defaultValue={initial.subtopic} placeholder="e.g. Restraint alternatives" className="bank-input" />
            </div>
          </div>

          <div className="bank-grid-2">
            <div className="bank-fg">
              <label htmlFor="bloom" className="bank-label">Bloom&apos;s level</label>
              <select id="bloom" name={fn('bloom_level')} defaultValue={initial.bloom_level} className="bank-input">
                <option value="">— Select —</option>
                {BLOOM_LEVELS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="bank-fg">
              <label htmlFor="tags" className="bank-label">Tags</label>
              <input id="tags" name={fn('tags')} type="text" defaultValue={initial.tags} placeholder="comma, separated, tags" className="bank-input" />
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
              <input id="marks" name={fn('marks')} type="number" min={0.5} step={0.5} defaultValue={initial.marks} className="bank-input" />
            </div>
            <div className="bank-fg">
              <label htmlFor="qref" className="bank-label">Question ref</label>
              <input id="qref" name={fn('question_ref')} type="text" defaultValue={initial.question_ref} placeholder="e.g. CARDIO-Q12" className="bank-input" />
            </div>
            <div className="bank-fg">
              <label htmlFor="batch" className="bank-label">Batch ID</label>
              <input id="batch" name={fn('batch_id')} type="text" defaultValue={initial.batch_id} placeholder="e.g. BATCH_2026_05" className="bank-input" />
            </div>
          </div>

          <div className="bank-checks">
            {/* is_published + is_builder_visible are standalone-only —
                case-linked children inherit published from the parent
                case and always have is_builder_visible = TRUE (filtered
                by parent_case_id in the student builder query). */}
            {mode === 'standalone' && (
              <label className="bank-check">
                <input type="checkbox" name={fn('is_published')} defaultChecked={initial.is_published} />
                <span>Published (visible to students)</span>
              </label>
            )}
            <label className="bank-check">
              <input type="checkbox" name={fn('is_free_sample')} defaultChecked={initial.is_free_sample} />
              <span>Free sample</span>
            </label>
            {mode === 'standalone' && (
              <label className="bank-check">
                <input
                  type="checkbox"
                  name={fn('is_builder_visible')}
                  defaultChecked={initial.is_builder_visible}
                  value="on"
                />
                <span>Visible in student quiz builder</span>
              </label>
            )}
            <label className="bank-check">
              <input
                type="checkbox"
                name={fn('shuffle_options')}
                defaultChecked={initial.shuffle_options}
                value="on"
              />
              <span>Shuffle options when shown to students</span>
            </label>
          </div>
        </div>
      </details>
    </>
  );
}
