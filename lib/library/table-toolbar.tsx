'use client';

// mynclex/lib/library/table-toolbar.tsx
//
// Contextual toolbar for the library Table block (slice 11.6c). It is
// a floating bar (Tiptap BubbleMenu + Floating UI) that appears while
// the cursor sits inside a table and is anchored to the *table
// element*, not the text selection — so it sits steadily on the table
// instead of hopping cell-to-cell.
//
// Why floating rather than an in-flow bar: the main formatting toolbar
// is sticky, but a contextual bar parked under it scrolls off on a long
// page, leaving the table controls out of reach when you edit a table
// far down the note. Anchoring to the table + Floating UI's `shift`
// keeps the bar reachable: it hugs the table top, and once that scrolls
// behind the sticky toolbar it slides down to stay on screen (clamped
// by `scrollTarget` = the `.product-content` scroller, the region the
// page actually scrolls in).
//
// All custom behaviour rides on Tiptap's generic `updateAttributes`:
//   • colour theme → updateAttributes('table',   { colorTheme })
//   • sub-header   → updateAttributes('tableRow', { isSubheader })
// The structural ops (add/remove row & column, merge/split, header
// row, delete table) are the stock prosemirror-tables commands.

import { useCallback, useMemo, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  TABLE_COLOR_THEMES,
  TABLE_COLOR_THEME_LABEL,
  type TableColorTheme,
} from './table-block';

export function TableToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      inHeaderCell: editor.isActive('tableHeader'),
      isSubheader: Boolean(editor.getAttributes('tableRow').isSubheader),
      colorTheme:
        (editor.getAttributes('table').colorTheme as TableColorTheme) ??
        'none',
      canMerge: editor.can().mergeCells(),
      canSplit: editor.can().splitCell(),
    }),
  });

  // The page scrolls inside `.product-content`; Floating UI must listen
  // to that element (it defaults to window) or the bar drifts on scroll.
  // This is a client-only editor mounted well after the shell renders,
  // so the element is already in the DOM at first render — a lazy
  // initialiser finds it without an effect.
  const [scrollTarget] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>('.product-content'),
  );

  // Anchor to the table the cursor is in, not the selection.
  const getReferencedVirtualElement = useCallback(() => {
    const { from } = editor.state.selection;
    const at = editor.view.domAtPos(from)?.node ?? null;
    const el =
      at instanceof HTMLElement ? at : (at?.parentElement ?? null);
    const table = el?.closest('table') ?? null;
    if (!table) return null;
    return { getBoundingClientRect: () => table.getBoundingClientRect() };
  }, [editor]);

  const options = useMemo(
    () => ({
      strategy: 'fixed' as const,
      placement: 'top-start' as const,
      offset: 8,
      // No flip — we never want the bar to drop into the table body.
      // `shift` (main + cross axis) slides it to stay reachable: once
      // the table top scrolls behind the sticky toolbar it parks just
      // below it (top padding ≈ breadcrumb 46 + toolbar height).
      flip: false,
      shift: {
        crossAxis: true,
        padding: { top: 96, bottom: 12, left: 12, right: 12 },
        ...(scrollTarget ? { boundary: scrollTarget } : {}),
      },
      ...(scrollTarget ? { scrollTarget } : {}),
    }),
    [scrollTarget],
  );

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="libTableToolbar"
      shouldShow={({ editor }) => editor.isEditable && editor.isActive('table')}
      getReferencedVirtualElement={getReferencedVirtualElement}
      options={options}
      appendTo={() => document.body}
      className="lib-table-toolbar"
      role="toolbar"
      aria-label="Table controls"
    >
      {/* Rows */}
      <TbBtn
        label="Add row above"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      >
        ↥ Row
      </TbBtn>
      <TbBtn
        label="Add row below"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        ↧ Row
      </TbBtn>
      <TbBtn
        label="Delete row"
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        ✕ Row
      </TbBtn>

      <span className="lib-table-tb-sep" aria-hidden="true" />

      {/* Columns */}
      <TbBtn
        label="Add column left"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        ↤ Col
      </TbBtn>
      <TbBtn
        label="Add column right"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        ↦ Col
      </TbBtn>
      <TbBtn
        label="Delete column"
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        ✕ Col
      </TbBtn>

      <span className="lib-table-tb-sep" aria-hidden="true" />

      {/* Cell merge / split — for full-width heading bands etc. */}
      <TbBtn
        label="Merge selected cells"
        onClick={() => editor.chain().focus().mergeCells().run()}
        disabled={!state.canMerge}
      >
        Merge
      </TbBtn>
      <TbBtn
        label="Split cell"
        onClick={() => editor.chain().focus().splitCell().run()}
        disabled={!state.canSplit}
      >
        Split
      </TbBtn>

      <span className="lib-table-tb-sep" aria-hidden="true" />

      {/* Styled-row toggles */}
      <TbBtn
        label="Toggle header row (top row)"
        pressed={state.inHeaderCell}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        Header
      </TbBtn>
      <TbBtn
        label="Toggle sub-header on this row"
        pressed={state.isSubheader}
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes('tableRow', {
              isSubheader: !state.isSubheader,
            })
            .run()
        }
      >
        Sub-header
      </TbBtn>

      <span className="lib-table-tb-sep" aria-hidden="true" />

      {/* Colour theme swatches */}
      <span className="lib-table-swatches" aria-label="Table colour">
        {TABLE_COLOR_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            className={[
              'lib-table-swatch',
              `is-${theme}`,
              state.colorTheme === theme ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={TABLE_COLOR_THEME_LABEL[theme]}
            aria-label={`${TABLE_COLOR_THEME_LABEL[theme]} theme`}
            aria-pressed={state.colorTheme === theme}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes('table', { colorTheme: theme })
                .run()
            }
          />
        ))}
      </span>

      <span className="lib-table-tb-sep" aria-hidden="true" />

      <TbBtn
        label="Delete table"
        danger
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        Delete table
      </TbBtn>
    </BubbleMenu>
  );
}

function TbBtn({
  label,
  pressed,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={[
        'lib-table-tb-btn',
        pressed ? 'is-on' : '',
        danger ? 'is-danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
    >
      {children}
    </button>
  );
}
