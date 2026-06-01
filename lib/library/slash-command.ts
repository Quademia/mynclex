// mynclex/lib/library/slash-command.ts
//
// Tiptap extension wiring the slash command. Uses Tiptap's
// Suggestion utility for filtering + keyboard handling and the
// React-side <SlashMenu> popover via ReactRenderer.
//
// Trigger: typing `/` anywhere in the editor opens the popover at
// the cursor. The user types to filter, Arrow keys navigate, Enter
// picks. Picking removes the slash + query text and converts the
// current block (or inserts a new block) per the item's `run`
// command from slash-menu.tsx.

import { Extension, type Editor } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { SlashMenu, type SlashMenuHandle, filterSlashItems, type SlashItem } from './slash-menu';

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        // Allow the suggestion anywhere, not just at line start —
        // matches the planning doc's UX ("/ anywhere in the
        // document opens a filtered block menu").
        startOfLine: false,
        allowSpaces: false,
        // The Suggestion utility calls this to compute the items
        // list as the user types after `/`. `editor` lets the filter
        // dynamically disable items (e.g. the embedded-questions row
        // once the note holds its max blocks — slice 11.15e).
        items: ({ query, editor }: { query: string; editor: Editor }): SlashItem[] =>
          filterSlashItems(query, editor),
        // Render the popover via Tiptap's ReactRenderer.
        render: () => {
          let component: ReactRenderer<SlashMenuHandle> | null = null;

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(SlashMenu, {
                props: {
                  items: props.items,
                  command: (item: SlashItem) => {
                    if (item.run) {
                      item.run(props.editor, props.range);
                    }
                  },
                  clientRect: props.clientRect,
                },
                editor: props.editor,
              });

              if (!component.element) return;
              document.body.appendChild(component.element);
            },

            onUpdate: (props: SuggestionProps) => {
              if (!component) return;
              component.updateProps({
                items: props.items,
                command: (item: SlashItem) => {
                  if (item.run) {
                    item.run(props.editor, props.range);
                  }
                },
                clientRect: props.clientRect,
              });
            },

            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                component?.destroy();
                component?.element?.remove();
                component = null;
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              component?.element?.remove();
              component?.destroy();
              component = null;
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

// Type sketch for Suggestion's props. The Suggestion utility doesn't
// export a fully typed `SuggestionProps`; we re-declare the bits we
// use to keep the extension file self-contained.
type SuggestionProps = {
  editor: import('@tiptap/core').Editor;
  range: import('@tiptap/core').Range;
  query: string;
  text: string;
  items: SlashItem[];
  clientRect: (() => DOMRect | null) | null;
};
