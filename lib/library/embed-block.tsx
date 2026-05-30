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
//   • 11.15b — atom node + block shell + empty state + Add menu.
//   • 11.15c (this cut) — pick-from-bank modal + filled reference-card
//     rendering (reorder / remove / Open-in-bank) + per-block caps.
//   • 11.15d — the "Create a new question" path.

import { Node as TiptapNode } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { getEmbedRefCards } from './embed-actions';
import {
  EmbedPickModal,
  EmbedTypeBadge,
  EmbedPillar,
} from './embed-pick-modal';
import { EMBED_BLOCK_HARD_CAP, EMBED_BLOCK_SOFT_CAP, type EmbedQuestionRow } from './types';

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

  const [menuOpen, setMenuOpen] = useState(false);
  const [flow, setFlow] = useState<'pick' | 'create' | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // Resolved reference-card data for the current item_ids (in order).
  const [refs, setRefs] = useState<EmbedQuestionRow[]>([]);
  const idsKey = itemIds.join(',');
  useEffect(() => {
    let cancelled = false;
    if (itemIds.length === 0) {
      setRefs([]);
      return;
    }
    getEmbedRefCards(itemIds).then((data) => {
      if (!cancelled) setRefs(data);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Close the Add menu on any outside pointerdown.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (!menuWrapRef.current || !menuWrapRef.current.contains(e.target as Node)) {
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

  function addIds(ids: string[]) {
    const fresh = ids.filter((id) => !itemIds.includes(id));
    if (fresh.length === 0) return;
    updateAttributes({ item_ids: [...itemIds, ...fresh].slice(0, EMBED_BLOCK_HARD_CAP) });
    setFlow(null);
  }

  function moveCard(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= itemIds.length) return;
    const next = itemIds.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setRefs((r) => {
      const rn = r.slice();
      [rn[i], rn[j]] = [rn[j], rn[i]];
      return rn;
    });
    updateAttributes({ item_ids: next });
  }

  function removeCard(i: number) {
    setRefs((r) => r.filter((_, idx) => idx !== i));
    updateAttributes({ item_ids: itemIds.filter((_, idx) => idx !== i) });
  }

  const total = itemIds.length;
  const counterCls = total > EMBED_BLOCK_HARD_CAP ? ' full' : total > EMBED_BLOCK_SOFT_CAP ? ' warn' : '';

  // The Add-question control (button + menu), reused by the empty state
  // and the filled-block footer.
  function AddControl({ variant }: { variant: 'accent' | 'ghost' }) {
    return (
      <div className="eq-addwrap" ref={menuWrapRef}>
        <button
          type="button"
          className={
            variant === 'accent'
              ? 'eq-btn eq-btn--accent'
              : 'eq-btn eq-btn--ghost eq-btn--sm'
          }
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span aria-hidden="true">＋</span> Add question
        </button>
        {menuOpen && <AddMenu onPick={() => openFlow('pick')} onCreate={() => openFlow('create')} />}
      </div>
    );
  }

  return (
    <NodeViewWrapper as="div" className="eq-block" data-embed-questions="">
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
            {editable && <AddControl variant="accent" />}
          </div>
        ) : (
          <>
            <div className="eq-block__head">
              <span className="eq-block__count">
                <span aria-hidden="true">✦</span> {total} question{total === 1 ? '' : 's'}
              </span>
              <span className="eq-block__hint">
                Reference cards · the live question shows for students only
              </span>
            </div>
            <div className="eq-cards">
              {refs.map((q, i) => (
                <RefCard
                  key={q.item_id}
                  q={q}
                  ord={i + 1}
                  total={total}
                  editable={editable}
                  onUp={() => moveCard(i, -1)}
                  onDown={() => moveCard(i, 1)}
                  onRemove={() => removeCard(i)}
                />
              ))}
            </div>
            {editable && (
              <div className="eq-block__foot">
                <AddControl variant="ghost" />
                <span className={`eq-counter${counterCls}`} style={{ marginLeft: 'auto' }}>
                  <span className="lbl">block</span>
                  {total} / {EMBED_BLOCK_HARD_CAP}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {flow === 'pick' && (
        <EmbedPickModal existingIds={itemIds} onAdd={addIds} onClose={() => setFlow(null)} />
      )}
      {flow === 'create' && (
        <div className="eq-flow-stub">
          Create-a-question flow — slice 11.15d.
          <button type="button" className="eq-btn eq-btn--ghost eq-btn--sm" onClick={() => setFlow(null)}>
            Close
          </button>
        </div>
      )}
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

/** One reference card in a filled block. */
function RefCard({
  q,
  ord,
  total,
  editable,
  onUp,
  onDown,
  onRemove,
}: {
  q: EmbedQuestionRow;
  ord: number;
  total: number;
  editable: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={`eq-card${q.is_note_created ? ' eq-card--note' : ''}`}>
      <span className="eq-card__ord" aria-hidden="true">{ord}</span>
      <div className="eq-card__top">
        <span className="eq-id">{q.item_id}</span>
        <EmbedTypeBadge type={q.question_type} />
        <EmbedPillar name={q.pillar} />
        {q.is_note_created && (
          <span className="eq-chip-note">
            <span aria-hidden="true">✎</span> Note-created
          </span>
        )}
        {editable && (
          <div className="eq-card__ctrl">
            <button type="button" title="Move up" disabled={ord === 1} onClick={onUp}>↑</button>
            <button type="button" title="Move down" disabled={ord === total} onClick={onDown}>↓</button>
            <span className="eq-card__sep" />
            <button type="button" className="rm" title="Remove from block" onClick={onRemove}>×</button>
          </div>
        )}
      </div>
      <div className="eq-card__bot">
        <span className="eq-card__stem">{q.stem}</span>
        <a
          className="eq-open"
          href="/tutor/bank/all"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in bank →
        </a>
      </div>
    </div>
  );
}
