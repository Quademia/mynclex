'use client';

// mynclex/lib/library/lab-values-block.tsx
//
// Tiptap "Lab values" block for the tutor library editor (slice 11.9).
// Last of the three NCLEX-domain "nursing-shaped" blocks.
//
// An editable reference TABLE — a titled grid of flexible columns and
// rows. Like the Drug card it's a SEALED ATOM node (all data in attrs,
// edited via a React form), but 2-D: columns × rows.
//
// Stored shape (Tiptap-native — attrs nested):
//   { type: 'lab_values',
//     attrs: { title, columns: [{ label }], rows: [[cell, …], …] } }
//
// • New tables pre-populate the 4 NCLEX-canonical columns
//   (Test · Normal · If high · If low); the tutor can rename, add, or
//   remove columns and add/remove rows.
// • Column removal warns (it wipes that column's values across every
//   row); row removal is immediate (matches drug-card field removal).
//   The last column / last row can't be removed (≥1 each — the × hides).
// • Cells + column labels are plain text. Cells wrap (multi-line OK);
//   column labels wrap but stay one logical line (Enter suppressed).
// • `columns`/`rows` are plain JSON, so they survive the `tiptapToBody`
//   deep-clone guarding the Server Action boundary (CLAUDE.md →
//   Known Workarounds).
//
// Validation is SOFT here (placeholders only); the hard gate (title
// required, ≥1 column, ≥1 row, column labels required) lands with the
// publish preflight in slice 11.10.
//
// Search note: same as the drug card — the slice-11.1 search helper
// reads `lab_values` fields at the JSON top level but Tiptap nests them
// under `attrs`, so this text isn't indexed yet. Folded into the
// holistic search-sync cleanup.
//
// CD design (gradient header + 🧪 + serif title, grey column headers,
// emphasised first column) mapped onto our app tokens.

import { Node as TiptapNode } from '@tiptap/core';
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import { useState } from 'react';
import { AutoGrowTextarea } from './auto-grow-textarea';

export type LabColumn = { label: string };

/** The 4 NCLEX-canonical columns a fresh table pre-populates with. */
export const CANONICAL_LAB_COLUMNS: LabColumn[] = [
  { label: 'Test' },
  { label: 'Normal' },
  { label: 'If high' },
  { label: 'If low' },
];

export const LabValuesBlock = TiptapNode.create({
  name: 'lab_values',
  group: 'block',
  atom: true,
  draggable: false, // reordering goes through the global DragHandle

  addAttributes() {
    return {
      title: { default: '' },
      columns: { default: [] as LabColumn[] },
      rows: { default: [] as string[][] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-lab-values]' }];
  },

  renderHTML() {
    return ['div', { 'data-lab-values': '' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LabValuesView);
  },
});

function LabValuesView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const title = (node.attrs.title as string) ?? '';
  const columns = (node.attrs.columns as LabColumn[]) ?? [];
  const rows = (node.attrs.rows as string[][]) ?? [];
  const editable = editor.isEditable;

  // Index of the column pending a removal confirm (null = none).
  const [confirmCol, setConfirmCol] = useState<number | null>(null);

  function setColLabel(ci: number, label: string) {
    updateAttributes({
      columns: columns.map((c, i) => (i === ci ? { ...c, label } : c)),
    });
  }

  function addColumn() {
    updateAttributes({
      columns: [...columns, { label: '' }],
      rows: rows.map((r) => [...r, '']),
    });
  }

  function doRemoveColumn() {
    if (confirmCol === null) return;
    const ci = confirmCol;
    updateAttributes({
      columns: columns.filter((_, i) => i !== ci),
      rows: rows.map((r) => r.filter((_, i) => i !== ci)),
    });
    setConfirmCol(null);
  }

  function setCell(ri: number, ci: number, value: string) {
    updateAttributes({
      rows: rows.map((r, i) =>
        i === ri ? r.map((cell, j) => (j === ci ? value : cell)) : r,
      ),
    });
  }

  function addRow() {
    updateAttributes({ rows: [...rows, Array(columns.length).fill('')] });
  }

  function removeRow(ri: number) {
    updateAttributes({ rows: rows.filter((_, i) => i !== ri) });
  }

  return (
    <NodeViewWrapper className="lib-lab" data-lab-values="">
      <div className="lib-lab-inner" contentEditable={false}>
        {editable && (
          <button
            type="button"
            className="lib-lab-remove"
            title="Remove lab values"
            aria-label="Remove lab values"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => deleteNode()}
          >
            ×
          </button>
        )}

        <div className="lib-lab-head">
          <span className="lib-lab-icon" aria-hidden="true">
            🧪
          </span>
          <input
            type="text"
            className="lib-lab-title"
            value={title}
            placeholder="Table title"
            disabled={!editable}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => updateAttributes({ title: e.target.value })}
          />
        </div>

        <table className="lib-lab-table">
          <thead>
            <tr>
              {columns.map((c, ci) => (
                <th key={ci}>
                  <AutoGrowTextarea
                    className="lib-lab-col"
                    value={c.label}
                    placeholder="Column"
                    disabled={!editable}
                    singleLine
                    onChange={(e) =>
                      setColLabel(ci, e.target.value.replace(/\n/g, ' '))
                    }
                  />
                  {editable && columns.length > 1 && (
                    <button
                      type="button"
                      className="lib-lab-col-x"
                      title="Remove column"
                      aria-label="Remove column"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setConfirmCol(ci)}
                    >
                      ×
                    </button>
                  )}
                </th>
              ))}
              {editable && (
                <th className="lib-lab-actions-col">
                  <button
                    type="button"
                    className="lib-lab-col-add"
                    title="Add column"
                    aria-label="Add column"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={addColumn}
                  >
                    ＋
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => (
                  <td key={ci}>
                    <AutoGrowTextarea
                      className="lib-lab-cell"
                      value={row[ci] ?? ''}
                      placeholder="…"
                      disabled={!editable}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                    />
                  </td>
                ))}
                {editable && (
                  <td className="lib-lab-actions-col lib-lab-row-x-cell">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        className="lib-lab-row-x"
                        title="Remove row"
                        aria-label="Remove row"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => removeRow(ri)}
                      >
                        ×
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {editable && (
          <button
            type="button"
            className="lib-lab-add-row"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addRow}
          >
            + Add row
          </button>
        )}
      </div>

      {confirmCol !== null && (
        <div
          className="lib-lab-confirm-back"
          contentEditable={false}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmCol(null);
          }}
        >
          <div className="lib-lab-confirm" role="dialog" aria-modal="true">
            <h3>
              Remove the “{columns[confirmCol]?.label?.trim() || 'untitled'}”
              column?
            </h3>
            <p>
              This will delete the values in this column for all {rows.length}{' '}
              {rows.length === 1 ? 'row' : 'rows'}. This can’t be undone.
            </p>
            <div className="lib-lab-confirm-actions">
              <button
                type="button"
                className="lib-lab-btn-ghost"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setConfirmCol(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="lib-lab-btn-danger"
                onMouseDown={(e) => e.preventDefault()}
                onClick={doRemoveColumn}
              >
                Remove column
              </button>
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
