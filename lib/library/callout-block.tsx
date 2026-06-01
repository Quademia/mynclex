'use client';

// mynclex/lib/library/callout-block.tsx
//
// Tiptap "Callout" block for the tutor library editor (slice 11.7).
// The first of the three NCLEX-domain "nursing-shaped" blocks.
//
// A callout is a tinted, boxed-off region of emphasis — the "⚠ Warning"
// or "💡 Tip" box you see in good study material. Unlike the Image /
// PDF / Video blocks (sealed atom nodes), a callout HOLDS editable rich
// text: the tutor types inside it, with the usual inline marks (bold /
// italic / underline / link). It is emphasis, not a container — no
// nested blocks (headings, lists, images) are allowed inside.
//
// Stored shape:
//   { type: 'callout', attrs: { tone }, content: [ …inline spans… ] }
//
// • `tone` is one of CALLOUT_TONES. It drives the box's whole colour
//   (background + border + text) plus the header icon + label. There
//   is NO custom title — the label IS the tone, which keeps a small
//   scannable vocabulary across the whole library.
// • `content: 'inline*'` matches the paragraph shape the slice-11.1
//   search helper `nclex_extract_body_text` already walks for
//   `callout` blocks — so callout text is full-text searchable with
//   no DB change.
//
// The tone switcher lives in the box's own header: click the icon +
// label to open a 5-tone menu; pick one and the box re-colours
// instantly (Tiptap's generic `updateAttributes` — no bespoke
// command). The `tone` attr is a plain string, so it survives the
// `tiptapToBody` deep-clone that guards the Server Action boundary
// (see CLAUDE.md → Known Workarounds).
//
// Student read-mode rendering reuses the `.lib-callout` tints and
// lands in slice 11.13; this slice is editor-only.

import { Node as TiptapNode, mergeAttributes } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

export const CALLOUT_TONES = [
  'note',
  'tip',
  'warning',
  'critical',
  'memory',
] as const;

export type CalloutTone = (typeof CALLOUT_TONES)[number];

/** Fixed icon + label per tone. The label is not editable. */
export const CALLOUT_TONE_META: Record<
  CalloutTone,
  { icon: string; label: string }
> = {
  note: { icon: 'ℹ️', label: 'Note' },
  tip: { icon: '💡', label: 'Tip' },
  warning: { icon: '⚠️', label: 'Warning' },
  critical: { icon: '⛔', label: 'Critical' },
  memory: { icon: '🧠', label: 'Memory' },
};

const DEFAULT_TONE: CalloutTone = 'note';

function normaliseTone(raw: unknown): CalloutTone {
  return (CALLOUT_TONES as readonly string[]).includes(raw as string)
    ? (raw as CalloutTone)
    : DEFAULT_TONE;
}

export const CalloutBlock = TiptapNode.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  // `defining` keeps the callout intact across edits at its
  // boundaries (backspace at the start, paste) — the content stays
  // wrapped rather than dissolving into a bare paragraph.
  defining: true,
  draggable: false, // reordering goes through the global DragHandle

  addAttributes() {
    return {
      tone: {
        default: DEFAULT_TONE,
        parseHTML: (el) => normaliseTone(el.getAttribute('data-tone')),
        renderHTML: (attrs) => ({ 'data-tone': normaliseTone(attrs.tone) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // `0` is the content hole — the editable inline region. data-tone
    // rides through HTMLAttributes; data-callout marks the wrapper so
    // copy/paste round-trips and a future read renderer can match it.
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

function CalloutView({
  node,
  updateAttributes,
  editor,
  deleteNode,
}: NodeViewProps) {
  const tone = normaliseTone(node.attrs.tone);
  const meta = CALLOUT_TONE_META[tone];
  const editable = editor.isEditable;

  const [menuOpen, setMenuOpen] = useState(false);
  const headRef = useRef<HTMLDivElement | null>(null);

  // Close the tone menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (headRef.current && !headRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <NodeViewWrapper className="lib-callout" data-callout="" data-tone={tone}>
      <div className="lib-callout-tab-wrap" contentEditable={false} ref={headRef}>
        <button
          type="button"
          className="lib-callout-tab"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (editable) setMenuOpen((o) => !o);
          }}
          disabled={!editable}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={editable ? 'Change tone' : undefined}
        >
          <span className="lib-callout-ic" aria-hidden="true">
            {meta.icon}
          </span>
          <span className="lib-callout-label">{meta.label}</span>
          {editable && (
            <span className="lib-callout-caret" aria-hidden="true">
              ▾
            </span>
          )}
        </button>

        {menuOpen && (
          <div className="lib-callout-menu" role="menu">
            {CALLOUT_TONES.map((t) => {
              const m = CALLOUT_TONE_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  role="menuitemradio"
                  aria-checked={t === tone}
                  className={
                    t === tone
                      ? 'lib-callout-menu-item is-active'
                      : 'lib-callout-menu-item'
                  }
                  data-tone={t}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    updateAttributes({ tone: t });
                    setMenuOpen(false);
                  }}
                >
                  <span className="lib-callout-ic" aria-hidden="true">
                    {m.icon}
                  </span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {editable && (
        <button
          type="button"
          className="lib-callout-remove"
          contentEditable={false}
          title="Remove callout"
          aria-label="Remove callout"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => deleteNode()}
        >
          ×
        </button>
      )}

      <NodeViewContent className="lib-callout-body" />
    </NodeViewWrapper>
  );
}
