// mynclex/lib/authoring/editors/mcq/editor.tsx
//
// McqEditor — first of the 9 self-contained question editors. Owns
// its own component-box, three-tab structure, and two-view layout.
// Composes shared primitives for Classification and Housekeeping.
//
// Controlled component: value + onChange, no internal state for the
// question content. Tab selection is local UI state and stays here.

'use client';

import { useState } from 'react';
import { ClassificationFields } from '../../primitives/classification-fields';
import { HousekeepingFields } from '../../primitives/housekeeping-fields';
import { McqPreview } from './preview';
import type { McqOption, McqValue } from './value';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

type Tab = 'content' | 'classification' | 'housekeeping';

export function McqEditor({
  value,
  onChange,
}: {
  value: McqValue;
  onChange: (next: McqValue) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('content');

  function setField<K extends keyof McqValue>(key: K, v: McqValue[K]) {
    onChange({ ...value, [key]: v });
  }

  function setOption(idx: number, patch: Partial<McqOption>) {
    onChange({
      ...value,
      options: value.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    });
  }

  function setCorrect(idx: number) {
    onChange({
      ...value,
      options: value.options.map((o, i) => ({ ...o, correct: i === idx })),
    });
  }

  function addOption() {
    if (value.options.length >= MAX_OPTIONS) return;
    const nextLetter = OPTION_LETTERS[value.options.length];
    onChange({
      ...value,
      options: [
        ...value.options,
        { id: nextLetter, text: '', correct: false, feedback: '' },
      ],
    });
  }

  function removeOption(idx: number) {
    if (value.options.length <= MIN_OPTIONS) return;
    const filtered = value.options.filter((_, i) => i !== idx);
    // Relabel A..F so option IDs stay sequential after a remove.
    const relabelled = filtered.map((o, i) => ({ ...o, id: OPTION_LETTERS[i] }));
    onChange({ ...value, options: relabelled });
  }

  return (
    <div className="aut-component-box">
      <div className="aut-component-label">McqEditor · self-contained</div>
      <div className="aut-two-view">
        <div className="aut-editor-pane">
          <div className="aut-top-tabs">
            <button
              type="button"
              className={`aut-tab ${activeTab === 'content' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('content')}
            >
              Content
            </button>
            <button
              type="button"
              className={`aut-tab ${activeTab === 'classification' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('classification')}
            >
              Classification
            </button>
            <button
              type="button"
              className={`aut-tab ${activeTab === 'housekeeping' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('housekeeping')}
            >
              Housekeeping
            </button>
            <span className="aut-type-pill">MCQ</span>
          </div>

          <div className="aut-tab-body">
            {activeTab === 'content' && (
              <ContentTab
                value={value}
                setField={setField}
                setOption={setOption}
                setCorrect={setCorrect}
                addOption={addOption}
                removeOption={removeOption}
              />
            )}
            {activeTab === 'classification' && (
              <ClassificationFields
                value={value.classification}
                onChange={(next) => setField('classification', next)}
              />
            )}
            {activeTab === 'housekeeping' && (
              <HousekeepingFields
                value={value.housekeeping}
                onChange={(next) => setField('housekeeping', next)}
                meta={value.meta}
              />
            )}
          </div>
        </div>

        <div className="aut-preview-pane">
          <div className="aut-pane-label">Preview · student view</div>
          <McqPreview value={value} />
        </div>
      </div>
    </div>
  );
}

function ContentTab({
  value,
  setField,
  setOption,
  setCorrect,
  addOption,
  removeOption,
}: {
  value: McqValue;
  setField: <K extends keyof McqValue>(key: K, v: McqValue[K]) => void;
  setOption: (idx: number, patch: Partial<McqOption>) => void;
  setCorrect: (idx: number) => void;
  addOption: () => void;
  removeOption: (idx: number) => void;
}) {
  return (
    <>
      <div className="aut-instruction-wrap">
        <div className="aut-field-label aut-instruction-label">
          ! Instruction <span className="aut-optional">— optional, shown above the stem</span>
        </div>
        <textarea
          className="aut-textarea"
          rows={2}
          value={value.instruction}
          onChange={(e) => setField('instruction', e.target.value)}
          placeholder="Optional directive shown above the stem, e.g. 'Select ALL that apply'."
        />
      </div>

      <div className="aut-field-label">
        Stem <span className="aut-optional">— required</span>
      </div>
      <textarea
        className="aut-textarea"
        rows={3}
        value={value.stem}
        onChange={(e) => setField('stem', e.target.value)}
        placeholder="Enter the full question text…"
      />

      <div className="aut-field-label">
        Options <span className="aut-optional">— 2 to 6, mark exactly one correct</span>
      </div>
      <div className="aut-options-list">
        {value.options.map((opt, idx) => (
          <div
            key={opt.id}
            className={`aut-option-row ${opt.correct ? 'is-correct' : ''}`}
          >
            <span className="aut-option-letter">{opt.id}</span>
            <button
              type="button"
              className="aut-option-radio"
              onClick={() => setCorrect(idx)}
              title="Mark as correct"
              aria-label={`Mark option ${opt.id} as correct`}
            />
            <div className="aut-option-fields">
              <input
                type="text"
                className="aut-option-text"
                value={opt.text}
                onChange={(e) => setOption(idx, { text: e.target.value })}
                placeholder={`Option ${opt.id} text…`}
              />
              <input
                type="text"
                className="aut-option-feedback"
                value={opt.feedback}
                onChange={(e) => setOption(idx, { feedback: e.target.value })}
                placeholder="Per-option feedback (optional)…"
              />
            </div>
            <button
              type="button"
              className="aut-option-remove"
              onClick={() => removeOption(idx)}
              disabled={value.options.length <= MIN_OPTIONS}
              title="Remove option"
              aria-label={`Remove option ${opt.id}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="aut-add-option"
        onClick={addOption}
        disabled={value.options.length >= MAX_OPTIONS}
      >
        + Add option
      </button>

      <div className="aut-field-label">
        Overall rationale <span className="aut-optional">— optional, revealed after answer</span>
      </div>
      <textarea
        className="aut-textarea"
        rows={3}
        value={value.rationale}
        onChange={(e) => setField('rationale', e.target.value)}
        placeholder="Explain why the correct answer is correct…"
      />

      <div className="aut-field-label">
        Rationale image URL <span className="aut-optional">— optional</span>
      </div>
      <input
        type="url"
        className="aut-input"
        value={value.rationaleImg}
        onChange={(e) => setField('rationaleImg', e.target.value)}
        placeholder="https://… (paste a hosted image URL)"
      />
      <div className="aut-field-hint">
        Paste a hosted URL for now. Direct upload lands in a later slice.
      </div>
    </>
  );
}
