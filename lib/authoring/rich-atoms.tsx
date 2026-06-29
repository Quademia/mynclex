'use client';

// mynclex/lib/authoring/rich-atoms.tsx
//
// Rich-content relook — Slice 6 foundation.
//
// Rich variants of the three shared question-editor field atoms
// (instruction / stem / rationale). They mirror the plain atoms in
// lib/bank/atoms/ (same labels, same FormData names) but render a
// <RovingRichField> instead of a <textarea>, so the editor-level roving
// toolbar drives them.
//
// Built ALONGSIDE the plain atoms, not replacing them: an editor migrates to
// rich one at a time (Slice 6a = MCQ first), so the un-migrated editors keep
// the plain atoms until their turn. The plain atoms get deleted once all 9
// editors are rich.
//
// Each must be rendered inside a <RovingProvider> (the editor's Content tab).

import { RovingRichField } from './roving-rich';
import type { RichDoc } from './rich-doc';

// ── Instruction ──
// Optional directive shown above the stem ("Select all that apply.").
export function RichInstructionField({
  value,
  onChange,
  name = 'instruction',
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  name?: string;
}) {
  return (
    <div className="auth-fg auth-instruction-wrap">
      <div className="auth-instruction-label">
        <span className="auth-instruction-icon">!</span>
        Instruction
        <span className="auth-instruction-optional">— optional</span>
      </div>
      <RovingRichField
        fieldKey="instruction"
        name={name}
        value={value}
        onChange={onChange}
        inline
        className="auth-rrf-instruction"
        ariaLabel="Instruction"
        placeholder="Optional directive above the stem, e.g. 'Select ALL that apply.'"
      />
      <p className="auth-instruction-hint">
        Optional. When blank, the student sees only the stem. Available on every question type.
      </p>
    </div>
  );
}

// ── Stem ──
export function RichStemField({
  value,
  onChange,
  name = 'stem',
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  name?: string;
}) {
  return (
    <div className="auth-fg">
      <label className="auth-label">Stem *</label>
      <RovingRichField
        fieldKey="stem"
        name={name}
        value={value}
        onChange={onChange}
        className="auth-rrf-stem"
        ariaLabel="Stem"
        placeholder="Enter the full question text…"
      />
    </div>
  );
}

// ── Rationale ──
// Rich overall rationale + a plain rationale-image URL (URLs stay plain).
export function RichRationaleFields({
  rationale,
  onRationaleChange,
  defaultRationaleImg,
  rationaleName = 'rationale',
  rationaleImgName = 'rationale_img',
}: {
  rationale: RichDoc;
  onRationaleChange: (doc: RichDoc) => void;
  defaultRationaleImg: string;
  rationaleName?: string;
  rationaleImgName?: string;
}) {
  return (
    <>
      <div className="auth-fg">
        <label className="auth-label">Overall rationale</label>
        <RovingRichField
          fieldKey="rationale"
          name={rationaleName}
          value={rationale}
          onChange={onRationaleChange}
          className="auth-rrf-rationale"
          ariaLabel="Overall rationale"
          placeholder="Explain why the correct answer is correct…"
        />
      </div>
      <div className="auth-fg">
        <label htmlFor="rationale_img" className="auth-label">Rationale image URL</label>
        <input
          id="rationale_img"
          name={rationaleImgName}
          type="url"
          defaultValue={defaultRationaleImg}
          placeholder="https://… (paste a hosted image URL)"
          className="auth-input"
        />
        <p className="auth-hint">
          Paste a hosted URL for now. Direct upload lands in a later slice.
        </p>
      </div>
    </>
  );
}
