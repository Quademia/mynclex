// mynclex/lib/library/block-gap.ts
//
// Tiptap extension that adds a hover-revealed "+ Add block"
// affordance in the gap between every pair of top-level blocks.
// Click the affordance to insert a new block at that position via
// the slash menu.
//
// Implemented as a ProseMirror plugin that maintains a set of
// widget decorations, one per inter-block gap. The widget is a
// real DOM button rendered outside React's tree (decorations have
// to be DOM, not React) — the click handler bubbles a custom
// event the NoteBodyEditor listens to and uses to open its
// controlled SlashMenu.
//
// We deliberately don't use ReactRenderer here. The widget is
// purely presentational + a click handler; mounting React for
// every gap on every doc change would be wasteful.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

const BLOCK_GAP_KEY = new PluginKey('libBlockGap');

/**
 * Custom event the gap button dispatches when clicked. The
 * NoteBodyEditor listens for this on the editor's root element
 * and opens its controlled SlashMenu anchored to `rect` with the
 * insertion `position`.
 */
export const BLOCK_GAP_CLICK_EVENT = 'lib:block-gap-click';

export type BlockGapClickDetail = {
  position: number;
  rect: DOMRect;
};

export const BlockGap = Extension.create({
  name: 'libBlockGap',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: BLOCK_GAP_KEY,
        state: {
          init: (_config, state) => buildGapDecorations(state.doc),
          apply: (tr, old, _oldState, newState) => {
            if (!tr.docChanged) return old;
            return buildGapDecorations(newState.doc);
          },
        },
        props: {
          decorations(state: EditorState) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

function buildGapDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.forEach((node, offset, index) => {
    // No gap before the very first block — the block tray below
    // the editor handles "insert at end". And no gap before non-
    // block content (text nodes, etc. — though top-level should
    // always be block).
    if (index === 0) return;
    if (!node.isBlock) return;

    decorations.push(
      Decoration.widget(offset, () => buildGapWidget(offset), {
        side: -1,
        // ignoreSelection: render even when the cursor is at this
        // position. Without this the widget vanishes on cursor-
        // adjacency, which is jarring.
        ignoreSelection: true,
        // key: stable identity for ProseMirror's decoration diff —
        // prevents re-creating the DOM node on every transaction.
        key: `block-gap-${offset}`,
      }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

function buildGapWidget(position: number): HTMLElement {
  const root = document.createElement('div');
  root.className = 'lib-tiptap-gap';
  root.setAttribute('contenteditable', 'false');
  root.setAttribute('data-position', String(position));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lib-tiptap-gap-btn';
  btn.setAttribute('aria-label', 'Insert block here');
  btn.title = 'Add a block here';
  btn.innerHTML =
    '<span class="lib-tiptap-gap-line" aria-hidden="true"></span>' +
    '<span class="lib-tiptap-gap-label"><span class="lib-tiptap-gap-plus" aria-hidden="true">+</span> Add block</span>' +
    '<span class="lib-tiptap-gap-line" aria-hidden="true"></span>';

  // Prevent the editor from stealing focus / starting a drag when
  // the gap button is clicked.
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = btn.getBoundingClientRect();
    const detail: BlockGapClickDetail = { position, rect };
    root.dispatchEvent(
      new CustomEvent<BlockGapClickDetail>(BLOCK_GAP_CLICK_EVENT, {
        detail,
        bubbles: true,
      }),
    );
  });

  root.appendChild(btn);
  return root;
}
