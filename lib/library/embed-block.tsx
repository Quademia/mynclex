'use client';

// mynclex/lib/library/embed-block.tsx
//
// Tiptap "Embedded questions" block for the tutor library editor
// (slice 11.15 — the last block type on the slash menu).
//
// A note can drop in 1–N of the tutor's own bank questions as inline
// practice ("now try these three"). In the EDITOR this renders as
// static reference cards — never the live question; the interactive
// inline player is student-side (slice 11.13 read view).
//
// SEALED ATOM node — same shape as the Image / Drug-card blocks. The
// only payload is `item_ids` (the referenced questions, in order) +
// `source` (forward-compat enum, fixed at TUTOR in v1). No question
// content lives in the note JSON — `getEmbedRefCards` resolves the ids
// to display data on demand.
//
// Build split:
//   • 11.15b (this file's first cut) — atom node + block shell +
//     empty state + the two-option "Add question" menu.
//   • 11.15c — the pick-from-bank modal + the filled reference-card
//     rendering (reorder / remove / Open-in-bank) + per-block caps.
//   • 11.15d — the "Create a new question" path (type picker → the
//     existing bank editor → Note-created card).

import { Node as TiptapNode } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { EMBED_BLOCK_HARD_CAP } from './types';

/** A fresh empty embedded-questions block for the slash menu / tray. */
export function freshEmbed() {
  return {
    type: 'embedded_questions',
    attrs: { item_ids: [] as string[], source: 'TUTOR' },
  };
}

export const EmbedQuestionsBlock = TiptapNode.create({
  name: 'embedded_questions',
  group: 'block',
  atom: true,
  draggable: false, // reordering goes through the global DragHandle

  addAttributes() {
    return {
      item_ids: { default: [] as string[] },
      source: { default: 'TUTOR' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-questions]' }];
  },

  renderHTML() {
    // Atom marker only — the real payload is the JSON attrs above.
    return ['div', { 'data-embed-questions': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedQuestionsView);
  },
});

function EmbedQuestionsView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const itemIds = (node.attrs.item_ids as string[]) ?? [];
  const editable = editor.isEditable;
  const isEmpty = itemIds.length === 0;

  // "Add question" menu + which add-flow is open. The actual modals
  // land in 11.15c (pick) and 11.15d (create); for now the menu opens
  // and the flows are wired through these state hooks.
  const [menuOpen, setMenuOpen] = useState(false);
  const [flow, setFlow] = useState<'pick' | 'create' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the Add menu on any outside pointerdown.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (!menuRef.current || !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menuOpen]);

  function openFlow(which: 'pick' | 'create') {
    setMenuOpen(false);
    setFlow(which);
  }

  return (
    <NodeViewWrapper
      as="div"
      className="eq-block"
      data-embed-questions=""
    >
      <span className="eq-block__tab" contentEditable={false}>
        <span aria-hidden="true">✦</span> Practice
      </span>
      {editable && (
        <button
          type="button"
          className="eq-block__remove"
          title="Remove this block"
          aria-label="Remove embedded-questions block"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => deleteNode()}
        >
          ×
        </button>
      )}

      <div contentEditable={false}>
        {isEmpty ? (
          <div className="eq-empty">
            <span className="eq-empty__icon" aria-hidden="true">✦</span>
            <div className="eq-empty__title">No questions yet</div>
            <div className="eq-empty__sub">
              Drop in 1–{EMBED_BLOCK_HARD_CAP} of your own bank questions as
              inline practice — a “now try these”.
            </div>
            {editable && (
              <div className="eq-addwrap" ref={menuRef}>
                <button
                  type="button"
                  className="eq-btn eq-btn--accent"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  <span aria-hidden="true">＋</span> Add question
                </button>
                {menuOpen && <AddMenu onPick={() => openFlow('pick')} onCreate={() => openFlow('create')} />}
              </div>
            )}
          </div>
        ) : (
          // Filled reference-card rendering lands in 11.15c.
          <FilledPlaceholder count={itemIds.length} />
        )}

        {/* Add-flow modals — built in 11.15c (pick) / 11.15d (create). */}
        {flow && (
          <FlowPlaceholder flow={flow} onClose={() => setFlow(null)} />
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** The two-option "Add question" menu. */
function AddMenu({ onPick, onCreate }: { onPick: () => void; onCreate: () => void }) {
  return (
    <div className="eq-menu" role="menu">
      <button type="button" className="eq-menu__item" role="menuitem" onClick={onPick}>
        <span className="eq-menu__ic" aria-hidden="true">▤</span>
        <span className="eq-menu__txt">
          <span className="eq-menu__nm">Pick from my bank</span>
          <span className="eq-menu__ds">Reuse questions you’ve already written</span>
        </span>
      </button>
      <div className="eq-menu__sep" />
      <button type="button" className="eq-menu__item" role="menuitem" onClick={onCreate}>
        <span className="eq-menu__ic" aria-hidden="true">✎</span>
        <span className="eq-menu__txt">
          <span className="eq-menu__nm">Create a new question</span>
          <span className="eq-menu__ds">Pick a type, then author it in the editor</span>
        </span>
      </button>
    </div>
  );
}

// ── 11.15b placeholders (replaced in 11.15c / 11.15d) ────────────────

function FilledPlaceholder({ count }: { count: number }) {
  return (
    <div className="eq-block__head">
      <span className="eq-block__count">
        <span aria-hidden="true">✦</span> {count} question{count === 1 ? '' : 's'}
      </span>
      <span className="eq-block__hint">Reference cards land in slice 11.15c</span>
    </div>
  );
}

function FlowPlaceholder({ flow, onClose }: { flow: 'pick' | 'create'; onClose: () => void }) {
  return (
    <div className="eq-flow-stub">
      {flow === 'pick'
        ? 'Pick-from-bank modal — slice 11.15c.'
        : 'Create-a-question flow — slice 11.15d.'}
      <button type="button" className="eq-btn eq-btn--ghost eq-btn--sm" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
