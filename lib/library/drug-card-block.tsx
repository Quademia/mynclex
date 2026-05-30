'use client';

// mynclex/lib/library/drug-card-block.tsx
//
// Tiptap "Drug card" block for the tutor library editor (slice 11.8).
// Second of the three NCLEX-domain "nursing-shaped" blocks.
//
// A structured reference card for one drug: a header (name + class)
// over an ordered list of labelled fields. Unlike the Callout (a
// rich-text content node), the Drug card is a SEALED ATOM node — all
// data lives in the node's attributes and a React form inside the box
// does the editing (every input writes back via `updateAttributes`).
// Same shape as the Image block, just a bigger form.
//
// Stored shape (Tiptap-native — attrs nested):
//   { type: 'drug_card',
//     attrs: { name, drug_class, fields: [ { label, value }, … ] } }
//
// • New cards pre-populate with the 4 NCLEX-canonical fields
//   (Indications · Typical dose · Side effects · Nursing considerations);
//   the tutor can rename, reorder (▲▼), add, or remove any field.
// • Field values are plain multi-line text — no inline marks (V1
//   decision; the labels carry the emphasis). Line breaks survive via
//   the value being a plain string + `white-space: pre-line` on render.
// • `fields` is a plain JSON array, so it survives the `tiptapToBody`
//   deep-clone that guards the Server Action boundary (CLAUDE.md →
//   Known Workarounds).
//
// Validation is SOFT here (placeholders / required cues only); the
// hard gate (name required, ≥1 field, labels required) lands with the
// publish preflight in slice 11.10 — same as image alt-text.
//
// Search note: the slice-11.1 `nclex_extract_body_text` helper has a
// `drug_card` branch but reads the fields at the JSON top level,
// whereas Tiptap nests them under `attrs`. So drug-card text is NOT
// indexed yet — folded into the holistic search-sync cleanup, same
// gap the image/pdf/table blocks already have. (Decision logged with
// Sam, 2026-05-30.)
//
// CD design: the card visual (gradient header, serif name, Rx
// flourish, label-column / value grid) is adopted from Sam's CD
// handoff, mapped onto our app tokens (teal accent + navy + Georgia
// serif — not the mock's indigo).

import { Node as TiptapNode } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useRef, type ChangeEvent } from 'react';

export type DrugField = { label: string; value: string };

/** The 4 NCLEX-canonical fields a fresh card pre-populates with. */
export const CANONICAL_DRUG_FIELDS: DrugField[] = [
  { label: 'Indications', value: '' },
  { label: 'Typical dose', value: '' },
  { label: 'Side effects', value: '' },
  { label: 'Nursing considerations', value: '' },
];

export const DrugCardBlock = TiptapNode.create({
  name: 'drug_card',
  group: 'block',
  atom: true,
  draggable: false, // reordering goes through the global DragHandle

  addAttributes() {
    // Data-only attrs — no parse/renderHTML, so they live in the JSON
    // doc (getJSON keeps them) but never serialize onto the marker DOM.
    return {
      name: { default: '' },
      drug_class: { default: '' },
      fields: { default: [] as DrugField[] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-drug-card]' }];
  },

  renderHTML() {
    // Atom marker only — the real payload is the JSON attrs above.
    return ['div', { 'data-drug-card': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrugCardView);
  },
});

function DrugCardView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const name = (node.attrs.name as string) ?? '';
  const drugClass = (node.attrs.drug_class as string) ?? '';
  const fields = (node.attrs.fields as DrugField[]) ?? [];
  const editable = editor.isEditable;

  function patchField(i: number, patch: Partial<DrugField>) {
    updateAttributes({
      fields: fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    });
  }

  function addField() {
    updateAttributes({ fields: [...fields, { label: '', value: '' }] });
  }

  function removeField(i: number) {
    updateAttributes({ fields: fields.filter((_, idx) => idx !== i) });
  }

  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[i], next[j]] = [next[j], next[i]];
    updateAttributes({ fields: next });
  }

  return (
    <NodeViewWrapper className="lib-drug" data-drug-card="">
      <div className="lib-drug-inner" contentEditable={false}>
        {editable && (
          <button
            type="button"
            className="lib-drug-remove"
            title="Remove drug card"
            aria-label="Remove drug card"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => deleteNode()}
          >
            ×
          </button>
        )}

        <div className="lib-drug-head">
          <div className="lib-drug-title-row">
            <span className="lib-drug-pill" aria-hidden="true">
              💊
            </span>
            <input
              type="text"
              className="lib-drug-name"
              value={name}
              placeholder="Drug name"
              disabled={!editable}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => updateAttributes({ name: e.target.value })}
            />
          </div>
          <input
            type="text"
            className="lib-drug-class"
            value={drugClass}
            placeholder="Drug class (optional)"
            disabled={!editable}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => updateAttributes({ drug_class: e.target.value })}
          />
        </div>

        <div className="lib-drug-fields">
          {fields.map((f, i) => (
            <div className="lib-drug-field" key={i}>
              <div className="lib-drug-label-cell">
                <AutoGrowTextarea
                  className="lib-drug-label"
                  value={f.label}
                  placeholder="Label"
                  disabled={!editable}
                  singleLine
                  onChange={(e) =>
                    // Labels are single logical lines — they wrap
                    // visually but never carry literal newlines (also
                    // guards against multi-line paste).
                    patchField(i, { label: e.target.value.replace(/\n/g, ' ') })
                  }
                />
              </div>
              <div className="lib-drug-value-cell">
                <AutoGrowTextarea
                  className="lib-drug-value"
                  value={f.value}
                  placeholder="Value…"
                  disabled={!editable}
                  onChange={(e) => patchField(i, { value: e.target.value })}
                />
                {editable && (
                  <span className="lib-drug-row-tools">
                    <button
                      type="button"
                      title="Move up"
                      aria-label="Move field up"
                      disabled={i === 0}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => moveField(i, -1)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      aria-label="Move field down"
                      disabled={i === fields.length - 1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => moveField(i, 1)}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="rm"
                      title="Remove field"
                      aria-label="Remove field"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => removeField(i)}
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {editable && (
          <button
            type="button"
            className="lib-drug-add"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addField}
          >
            + Add field
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Textarea that grows to fit its content so multi-line field values
// aren't trapped behind an inner scrollbar.
function AutoGrowTextarea({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  singleLine = false,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Wrap visually but reject Enter — used for the field label. */
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (el) resize(el);
      }}
      className={className}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') e.preventDefault();
      }}
      onChange={(e) => {
        resize(e.currentTarget);
        onChange(e);
      }}
    />
  );
}
