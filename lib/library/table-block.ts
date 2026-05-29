// mynclex/lib/library/table-block.ts
//
// Table block for the tutor library editor (slice 11.6c). Built on
// Tiptap's official table extension (@tiptap/extension-table, v3),
// with two custom attributes layered on:
//
//   • `colorTheme` on the table node — one of TABLE_COLOR_THEMES.
//     Rendered as `data-color` on the <table>; styles/library.css
//     turns that into the header band + zebra-body tint.
//   • `isSubheader` on a table row — marks a row as a "sub-header"
//     (one shade lighter than the header row). Rendered as
//     `data-subheader="true"` on the <tr>.
//
// The standard header row uses Tiptap's built-in header-cell
// mechanism (toggleHeaderRow → <th>); the sub-header is our own
// row-level flag because the extension has no concept of a second
// styled row. Neither custom attr needs a bespoke command — the
// table toolbar drives both through Tiptap's generic
// `updateAttributes('table' | 'tableRow', …)`.
//
// Both attrs are plain JSON-serialisable scalars, so they survive the
// `tiptapToBody` deep-clone that guards the Server Action boundary
// (see CLAUDE.md → Known Workarounds).
//
// No bonded title / subtitle: a tutor who wants a heading band merges
// the top row instead — keeps the table to the strict prosemirror-
// tables structure with nothing layered above the grid.

import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';

export const TABLE_COLOR_THEMES = [
  'none',
  'blue',
  'green',
  'red',
  'amber',
  'slate',
] as const;

export type TableColorTheme = (typeof TABLE_COLOR_THEMES)[number];

/** Human label for each theme — used by the toolbar swatch titles. */
export const TABLE_COLOR_THEME_LABEL: Record<TableColorTheme, string> = {
  none: 'None',
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  amber: 'Amber',
  slate: 'Slate',
};

export const LibTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colorTheme: {
        default: 'none',
        parseHTML: (el) => el.getAttribute('data-color') ?? 'none',
        renderHTML: (attrs) => {
          const theme = attrs.colorTheme as string | null;
          if (!theme || theme === 'none') return {};
          return { 'data-color': theme };
        },
      },
    };
  },

  // Disable the stock TableView node view. prosemirror-tables' TableView
  // builds the <table> element by hand and copies ONLY `style` onto it —
  // it ignores our `colorTheme` attribute's renderHTML, so `data-color`
  // never reaches the DOM and the colour-theme CSS can't match. The node
  // view exists only for live column resizing, which we've turned off
  // (resizable: false). Returning null falls back to ProseMirror rendering
  // the table from renderHTML, which DOES emit our `data-color` attribute.
  addNodeView() {
    return null;
  },
}).configure({
  // Column resizing is deferred — auto-width columns keep v1 simple
  // and sidestep the resize-handle CSS. Revisit if tutors ask.
  resizable: false,
});

export const LibTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      isSubheader: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-subheader') === 'true',
        renderHTML: (attrs) =>
          attrs.isSubheader ? { 'data-subheader': 'true' } : {},
      },
    };
  },
});

export const LibTableHeader = TableHeader;
export const LibTableCell = TableCell;

/** All four table extensions, in the order Tiptap expects them. */
export const TABLE_EXTENSIONS = [
  LibTable,
  LibTableRow,
  LibTableHeader,
  LibTableCell,
];
