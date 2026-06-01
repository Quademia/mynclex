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
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { getEmbedRefCards } from './embed-actions';
import {
  EmbedPickModal,
  EmbedTypeBadge,
  EmbedPillar,
} from './embed-pick-modal';
import { EmbedCreateFlow } from './embed-create-flow';
import {
  EMBED_BLOCK_HARD_CAP,
  EMBED_BLOCK_SOFT_CAP,
  EMBED_DEFAULT_MAX_BLOCKS,
  type EmbedQuestionRow,
} from './types';

/** A fresh empty embedded-questions block for the slash menu / tray.
 *  Stamped with a stable id so student attempts (11.13b) can attribute
 *  to this specific block. */
export function freshEmbed() {
  return {
    type: 'embedded_questions',
    attrs: {
      id: crypto.randomUUID(),
      item_ids: [] as string[],
      source: 'TUTOR',
    },
  };
}

export const EmbedQuestionsBlock = TiptapNode.create({
  name: 'embedded_questions',
  group: 'block',
  atom: true,
  draggable: false, // reordering goes through the global DragHandle

  addOptions() {
    // Set via .configure({ noteId, maxPerBlock, maxBlocks }) in
    // note-body-editor (values come from nclex_config — slice 11.15e).
    // noteId stamps parent_note_id on inline-created questions; the
    // caps drive the point-of-action limits. Defaults here are the
    // fallbacks if config wasn't threaded.
    return {
      noteId: null as string | null,
      maxPerBlock: EMBED_BLOCK_HARD_CAP,
      maxBlocks: EMBED_DEFAULT_MAX_BLOCKS,
    };
  },

  addAttributes() {
    return {
      // Stable per-block id — generated on insert (freshEmbed) + self-healed
      // in the NodeView; backfilled onto pre-existing blocks by migration
      // 20260624120000. Student embed attempts are attributed to this id
      // (slice 11.13b), so it must survive reorders/edits.
      id: { default: null as string | null },
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

// ── shared helpers for the insertion surfaces (slash menu / tray) ────

/** The live caps configured on the embed block (from nclex_config). */
export function getEmbedCapsFromEditor(editor: Editor): { maxPerBlock: number; maxBlocks: number } {
  const ext = editor.extensionManager.extensions.find((e) => e.name === 'embedded_questions');
  const opts = (ext?.options ?? {}) as { maxPerBlock?: number; maxBlocks?: number };
  return {
    maxPerBlock: opts.maxPerBlock ?? EMBED_BLOCK_HARD_CAP,
    maxBlocks: opts.maxBlocks ?? EMBED_DEFAULT_MAX_BLOCKS,
  };
}

/** How many embedded-questions blocks the note currently has. */
export function countEmbedBlocks(editor: Editor): number {
  let n = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'embedded_questions') n += 1;
  });
  return n;
}

/** True when the note is already at its max number of embed blocks. */
export function embedBlocksAtCap(editor: Editor): boolean {
  return countEmbedBlocks(editor) >= getEmbedCapsFromEditor(editor).maxBlocks;
}

function EmbedQuestionsView({ node, updateAttributes, editor, deleteNode, extension }: NodeViewProps) {
  const itemIds = (node.attrs.item_ids as string[]) ?? [];
  const editable = editor.isEditable;
  const isEmpty = itemIds.length === 0;
  const noteId = (extension.options.noteId as string | null) ?? null;
  const maxPerBlock = (extension.options.maxPerBlock as number) ?? EMBED_BLOCK_HARD_CAP;
  const blockFull = itemIds.length >= maxPerBlock;

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

  // Self-heal: ensure the block carries a stable id (insert stamps one via
  // freshEmbed; this catches odd paths like paste). Editable-only — the
  // student read view never mutates the doc.
  useEffect(() => {
    if (editable && !node.attrs.id) {
      updateAttributes({ id: crypto.randomUUID() });
    }
  }, [editable, node.attrs.id, updateAttributes]);

  function openFlow(which: 'pick' | 'create') {
    setMenuOpen(false);
    setFlow(which);
  }

  function addIds(ids: string[]) {
    const fresh = ids.filter((id) => !itemIds.includes(id));
    if (fresh.length === 0) return;
    updateAttributes({ item_ids: [...itemIds, ...fresh].slice(0, maxPerBlock) });
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
  const counterCls = total >= maxPerBlock ? ' full' : total > EMBED_BLOCK_SOFT_CAP ? ' warn' : '';

  // The Add-question control (button + menu), reused by the empty state
  // and the filled-block footer. Disabled once the block hits its max
  // — so neither Pick nor Create can push it over (no orphaned
  // questions from a full block).
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
          disabled={blockFull}
          title={blockFull ? `This block is full (max ${maxPerBlock}).` : undefined}
        >
          <span aria-hidden="true">＋</span> Add question
        </button>
        {menuOpen && !blockFull && (
          <AddMenu onPick={() => openFlow('pick')} onCreate={() => openFlow('create')} />
        )}
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
                  {total} / {maxPerBlock}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {flow === 'pick' && (
        <EmbedPickModal
          existingIds={itemIds}
          maxPerBlock={maxPerBlock}
          onAdd={addIds}
          onClose={() => setFlow(null)}
        />
      )}
      {flow === 'create' && (
        <EmbedCreateFlow
          noteId={noteId}
          onCreated={(id) => addIds([id])}
          onClose={() => setFlow(null)}
        />
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
