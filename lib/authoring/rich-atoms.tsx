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
import { richDocToPlain, type RichDoc } from './rich-doc';
import { BankImageBlock } from './bank-image-block';
import { curatorBankImageRenderer } from './bank-image-render';
import { docHasFilledBankImage } from './bank-image-doc';

// Slice 8 — the stem may carry `bankImage` block nodes. Stable module
// const (RichField requires a stable extensions reference); the static
// (non-focused) stem view splices the image via the shared curator
// renderer. Only the stem gets this — instruction / options / feedback /
// rationale stay inline-only.
const STEM_EXTENSIONS = [BankImageBlock];

// The image-capable field keys, for RovingToolbar's imageFieldKeys prop.
// Lives here beside RichStemField (which owns fieldKey="stem") so the
// toolbar's enable-check can never drift from the actual field key.
export const STEM_IMAGE_KEYS = ['stem'];

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
  // Advisory, not a block (advise > block): an image-only stem is valid —
  // the image can BE the question — but usually wants a question sentence.
  // Marker types (Cloze / Highlight / drag-cloze) are unaffected: their own
  // structural rules already require marker text in the stem.
  const imageOnly =
    docHasFilledBankImage(value) && richDocToPlain(value).trim() === '';

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
        extensions={STEM_EXTENSIONS}
        custom={curatorBankImageRenderer}
      />
      {imageOnly && (
        <p className="auth-stem-advisory">
          Image-only stem — that&apos;s allowed, but consider adding the
          question text so students know what&apos;s being asked.
        </p>
      )}
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
