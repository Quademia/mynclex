'use client';

// mynclex/lib/authoring/table/merge-table-editor.tsx
//
// Rich-content relook — Slice 2a (structure mechanics).
//
// The custom merge-table authoring editor, built from the adopted Claude
// Design "Case Study Merge Table" prototype. One tab = one table. The
// curator types in cells, drag- or shift-selects a range, and uses the
// Structure toolbar to Merge / Split (subdivide + un-merge) / Heading /
// +Row / +Col / Delete. A per-row "Appears" gutter sets which question each
// row first shows at; header rows derive their visibility and show "auto".
//
// Slice 2a scope: the structure + plain-text cells. Slice 2b swaps the cell
// editor to the roving rich field and wires the "In cell" toolbar group
// (rendered here disabled so the final toolbar shape is visible now).
//
// Cells are edited with a roving plain <textarea>: only the single selected
// cell shows the editable field; every other cell renders static text, so
// drag-selecting a range never fights an editor for the mouse.

import { useEffect, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { deleteTabAction, upsertTabAction } from '../../bank/wrappers/case-study/actions';
import type { CaseStudyTabRow, Surface } from '../../bank/wrappers/case-study/types';
import { RichField, ColorMarkButtons } from '../rich-field';
import { RichRender } from '../rich-render';
import { isEmptyRichDoc, type RichDoc } from '../rich-doc';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import type { NavIcon as NavIconName } from '@/lib/nav/types';
import {
  type MergeTableData,
  type CellPos,
  type SelRect,
  selRect,
  isSelected,
  isHeaderRow,
  originsIn,
  isMerged,
  merge,
  unmerge,
  subdivideCols,
  subdivideRows,
  toggleHeading,
  addRow,
  addCol,
  deleteRows,
  deleteCols,
  setVisibleFrom,
  setCellContent,
  tableMeta,
  VF_MAX,
} from './merge-table-model';

interface Props {
  surface:         Surface;
  case_id:         string;
  tab:             CaseStudyTabRow;
  draftTitle:      string;
  draftTable:      MergeTableData;
  onDraftChange:   (next: { title: string; table: MergeTableData }) => void;
  previewPosition: number | null;
}

type Sel = { a: CellPos; f: CellPos } | null;

export function MergeTableEditor({
  surface, case_id, tab,
  draftTitle, draftTable, onDraftChange,
  previewPosition,
}: Props) {
  const [sel, setSel] = useState<Sel>(null);
  const [dragging, setDragging] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The focused cell's live Tiptap editor — drives the in-cell toolbar.
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  // End any drag when the mouse releases anywhere (so a single-cell select
  // settles and its editable field can mount).
  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const t = draftTable;
  const rect = selRect(t, sel);

  function clearErr() {
    if (err) setErr(null);
  }
  function pushTitle(title: string) {
    clearErr();
    onDraftChange({ title, table: t });
  }
  function pushTable(next: MergeTableData, nextSel?: Sel) {
    clearErr();
    onDraftChange({ title: draftTitle, table: next });
    if (nextSel !== undefined) setSel(nextSel);
    setSplitOpen(false);
  }

  // ── selection gestures ──
  function onCellDown(e: React.MouseEvent, r: number, c: number) {
    setDragging(true);
    setSplitOpen(false);
    if (e.shiftKey && sel) setSel({ a: sel.a, f: { r, c } });
    else setSel({ a: { r, c }, f: { r, c } });
  }
  function onCellEnter(r: number, c: number) {
    if (!dragging) return;
    setSel((s) => (s ? { a: s.a, f: { r, c } } : { a: { r, c }, f: { r, c } }));
  }

  // The single cell currently in edit mode (sole selection, settled).
  const activePos: CellPos | null =
    !dragging && sel && sel.a.r === sel.f.r && sel.a.c === sel.f.c ? sel.a : null;
  const activeCell =
    activePos && !t.grid[activePos.r]?.[activePos.c]?.covered
      ? t.grid[activePos.r][activePos.c]
      : null;

  // ── toolbar enable flags ──
  const hasSel = !!rect;
  const area = rect ? (rect.bot - rect.top + 1) * (rect.right - rect.left + 1) : 0;
  const origins = rect ? originsIn(t, rect) : [];
  const canMerge = !!rect && area > 1 && origins.length >= 2;
  const single = !!rect && rect.bot === rect.top && rect.right === rect.left;
  const singleCell = single && rect ? t.grid[rect.top][rect.left] : null;
  const merged = !!singleCell && isMerged(singleCell);
  const splitEnabled = !!singleCell;

  // ── structural op handlers ──
  function doMerge() {
    if (!rect) return;
    pushTable(merge(t, rect), { a: { r: rect.top, c: rect.left }, f: { r: rect.top, c: rect.left } });
  }
  function doSplit() {
    if (!singleCell || !rect) return;
    if (merged) {
      pushTable(unmerge(t, rect.top, rect.left));
    } else {
      setSplitOpen((o) => !o);
    }
  }
  function doSubdivideCols(n: number) {
    if (!rect) return;
    pushTable(subdivideCols(t, rect.top, rect.left, n));
  }
  function doSubdivideRows(n: number) {
    if (!rect) return;
    pushTable(subdivideRows(t, rect.top, rect.left, n));
  }
  function doHeading() {
    if (!rect) return;
    pushTable(toggleHeading(t, rect));
  }
  function doAddRow() {
    pushTable(addRow(t), { a: { r: t.rows.length, c: 0 }, f: { r: t.rows.length, c: 0 } });
  }
  function doAddCol() {
    pushTable(addCol(t));
  }
  function doDelRows() {
    if (!rect) return;
    pushTable(deleteRows(t, rect), null);
  }
  function doDelCols() {
    if (!rect) return;
    pushTable(deleteCols(t, rect), null);
  }
  function onVF(r: number, v: number) {
    pushTable(setVisibleFrom(t, r, v));
  }
  function onCellInput(r: number, c: number, doc: RichDoc) {
    pushTable(setCellContent(t, r, c, doc));
  }

  // ── save / delete ──
  function onSave(fd: FormData) {
    setErr(null);
    setPending(true);
    upsertTabAction(fd)
      .then((res) => { if (!res.ok) setErr(res.error); })
      .finally(() => setPending(false));
  }
  function onDelete(fd: FormData) {
    if (!confirmDelete(draftTitle, t.rows.length)) return;
    setErr(null);
    setPending(true);
    deleteTabAction(fd)
      .then((res) => { if (!res.ok) setErr(res.error); })
      .finally(() => setPending(false));
  }

  const meta = tableMeta(t);
  const hint = selectionHint({ rect, canMerge, merged, single, singleCell });

  return (
    <div className="cs-entries-pane mt-pane">
      {/* head: title + save/delete */}
      <div className="cs-entries-head">
        <div className="cs-entries-title-group">
          <div className="cs-entries-title">
            <span className="mt-kind-tag">Custom table</span>
            <input
              className="cs-rename-input"
              type="text"
              value={draftTitle}
              onChange={(e) => pushTitle(e.target.value)}
              placeholder="Tab title"
              aria-label="Tab title"
            />
          </div>
          <div className="cs-entries-desc">
            {meta.rows} {meta.rows === 1 ? 'row' : 'rows'} · {meta.merged} merged · {meta.headings} headings
          </div>
        </div>
        <div className="cs-entries-actions">
          <form action={onDelete}>
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="case_id" value={case_id} />
            <input type="hidden" name="tab_id"  value={tab.tab_id} />
            <button type="submit" className="cs-btn danger" disabled={pending}>Delete tab</button>
          </form>
          <form action={onSave}>
            <input type="hidden" name="surface"       value={surface} />
            <input type="hidden" name="case_id"       value={case_id} />
            <input type="hidden" name="tab_id"        value={tab.tab_id} />
            <input type="hidden" name="tab_key"       value="custom_grid" />
            <input type="hidden" name="is_custom"     value="true" />
            <input type="hidden" name="custom_shape"  value="rows_cols" />
            <input type="hidden" name="display_order" value={String(tab.display_order)} />
            <input type="hidden" name="title"         value={draftTitle} />
            <input type="hidden" name="entries"       value={JSON.stringify(t)} />
            <input type="hidden" name="columns_def"   value="[]" />
            <button type="submit" className="cs-btn primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save tab'}
            </button>
          </form>
        </div>
      </div>

      {err && <div className="cs-error">{err}</div>}

      {/* toolbar */}
      <div className="mt-toolbar">
        <span className="mt-tb-group-label">Structure</span>
        <button type="button" className="mt-tb-btn" disabled={!canMerge}
          onClick={doMerge} title="Combine the selected cells into one">⊞ Merge</button>
        <span className="mt-tb-split">
          <button type="button" className={`mt-tb-btn${splitOpen ? ' is-open' : ''}`} disabled={!splitEnabled}
            onClick={doSplit} title="Split a merged cell apart, or subdivide a plain cell into columns / rows">
            ⊟ Split{!merged && ' ▾'}
          </button>
          {splitOpen && splitEnabled && !merged && (
            <div className="mt-split-menu">
              <div className="mt-split-menu-title">Subdivide this cell</div>
              <div className="mt-split-row">
                <span className="mt-split-row-label">Columns</span>
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" className="mt-split-opt" onClick={() => doSubdivideCols(n)}>{n}</button>
                ))}
              </div>
              <div className="mt-split-row">
                <span className="mt-split-row-label">Rows</span>
                {[2, 3].map((n) => (
                  <button key={n} type="button" className="mt-split-opt" onClick={() => doSubdivideRows(n)}>{n}</button>
                ))}
              </div>
              <div className="mt-split-menu-note">Splits 1 cell into several; other rows keep their look.</div>
            </div>
          )}
        </span>
        <button type="button" className="mt-tb-btn" disabled={!hasSel}
          onClick={doHeading} title="Mark the selected cells as headings (a role — left labels too, not only the top row)">⬚ Heading</button>
        <button type="button" className="mt-tb-btn" onClick={doAddRow} title="Add a row at the bottom">+ Row</button>
        <button type="button" className="mt-tb-btn" onClick={doAddCol} title="Add a column at the right">+ Col</button>
        <button type="button" className="mt-tb-btn danger" disabled={!hasSel}
          onClick={doDelRows} title="Delete the selected row(s)">Delete row</button>
        <button type="button" className="mt-tb-btn danger" disabled={!hasSel}
          onClick={doDelCols} title="Delete the selected column(s)">Delete col</button>

        <span className="mt-tb-sep" />
        <span className="mt-tb-group-label">In cell</span>
        {/* In-cell rich tools drive the focused cell's editor; greyed when
            no cell is being edited. */}
        {activeEditor ? <InCellTools editor={activeEditor} /> : <InCellToolsDisabled />}
      </div>

      {/* selection hint */}
      <div className={`mt-hint${hint.tone ? ' ' + hint.tone : ''}`}>{hint.text}</div>

      {/* grid */}
      <div className="mt-grid-scroll">
        <table className="mt-grid">
          <tbody>
            {t.rows.map((row, r) => {
              const headerRow = isHeaderRow(t, r);
              const rowHidden = previewPosition !== null && !headerRow && row.visibleFrom > previewPosition;
              const tds: React.ReactNode[] = [];
              // gutter
              tds.push(
                <td key="g" className="mt-gutter">
                  {headerRow ? (
                    <span className="mt-gutter-auto" title="Header row — visibility is derived from its data rows">auto</span>
                  ) : (
                    <select
                      className={`mt-gutter-vf${row.visibleFrom > 1 ? ' is-later' : ''}`}
                      value={row.visibleFrom}
                      onChange={(e) => onVF(r, Number(e.target.value))}
                      title="Which question this row first appears at"
                    >
                      {Array.from({ length: VF_MAX }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>Q{n}</option>
                      ))}
                    </select>
                  )}
                </td>,
              );
              for (let c = 0; c < t.cols; c++) {
                const cell = t.grid[r][c];
                if (cell.covered) continue;
                const selected = isSelected(t, r, c, rect);
                const isActive = activeCell !== null && activePos!.r === r && activePos!.c === c;
                tds.push(
                  <td
                    key={cell.id}
                    colSpan={cell.colspan}
                    rowSpan={cell.rowspan}
                    className={
                      'mt-cell' +
                      (cell.heading ? ' is-head' : '') +
                      (selected ? ' is-sel' : '') +
                      (rowHidden ? ' is-hidden' : '')
                    }
                    onMouseDown={(e) => { if (!isActive) onCellDown(e, r, c); }}
                    onMouseEnter={() => onCellEnter(r, c)}
                  >
                    {isActive ? (
                      <div className="mt-cell-edit">
                        <RichField
                          key={cell.id}
                          value={cell.content}
                          hideToolbar
                          onEditor={setActiveEditor}
                          onChange={(doc) => onCellInput(r, c, doc)}
                          placeholder={cell.heading ? 'Label' : 'Type…'}
                          ariaLabel={`Cell row ${r + 1} column ${c + 1}`}
                        />
                      </div>
                    ) : (
                      <div className="mt-cell-static">
                        {isEmptyRichDoc(cell.content) ? (
                          <span className="mt-cell-ph">{cell.heading ? 'Label' : '—'}</span>
                        ) : (
                          <RichRender doc={cell.content} />
                        )}
                      </div>
                    )}
                  </td>,
                );
              }
              return <tr key={row.id}>{tds}</tr>;
            })}
          </tbody>
        </table>
      </div>

      {/* footer add buttons + legend */}
      <div className="mt-foot-actions">
        <button type="button" className="mt-foot-btn" onClick={doAddRow}>+ Row</button>
        <button type="button" className="mt-foot-btn" onClick={doAddCol}>+ Column</button>
      </div>
      <div className="mt-legend">
        <span className="mt-legend-item"><span className="mt-swatch is-head" /> Heading cell</span>
        <span className="mt-legend-item"><span className="mt-swatch" /> Data cell</span>
        <span className="mt-legend-item"><code>Appears</code> = which question the row first shows at · header rows are derived</span>
      </div>
    </div>
  );
}

// ── in-cell rich tools (drive the focused cell's editor) ──

interface InCellTool {
  icon:  NavIconName;
  label: string;
  mark:  string;                       // editor.isActive(mark) key
  run:   (e: Editor) => void;
}

const IN_CELL_TOOLS: InCellTool[] = [
  { icon: 'bold',          label: 'Bold',          mark: 'bold',          run: (e) => e.chain().focus().toggleBold().run() },
  { icon: 'italic',        label: 'Italic',        mark: 'italic',        run: (e) => e.chain().focus().toggleItalic().run() },
  { icon: 'underline',     label: 'Underline',     mark: 'underline',     run: (e) => e.chain().focus().toggleUnderline().run() },
  { icon: 'strikethrough', label: 'Strikethrough', mark: 'strike',        run: (e) => e.chain().focus().toggleStrike().run() },
  { icon: 'superscript',   label: 'Superscript',   mark: 'superscript',   run: (e) => e.chain().focus().toggleSuperscript().run() },
  { icon: 'subscript',     label: 'Subscript',     mark: 'subscript',     run: (e) => e.chain().focus().toggleSubscript().run() },
  { icon: 'list-bulleted', label: 'Bullet list',   mark: 'bulletList',    run: (e) => e.chain().focus().toggleBulletList().run() },
  { icon: 'list-numbered', label: 'Numbered list', mark: 'orderedList',   run: (e) => e.chain().focus().toggleOrderedList().run() },
];

// Highlight + Text colour live in <ColorMarkButtons>; these stubs mirror
// them in the disabled (no-cell-focused) state so the toolbar keeps shape.
const COLOR_STUBS: Array<{ icon: NavIconName; label: string }> = [
  { icon: 'highlight',  label: 'Highlight' },
  { icon: 'text-color', label: 'Text colour' },
];

function InCellTools({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => {
      const m: Record<string, boolean> = {};
      for (const tool of IN_CELL_TOOLS) m[tool.mark] = editor.isActive(tool.mark);
      return m;
    },
  });
  return (
    <>
      {IN_CELL_TOOLS.map((tool) => (
        <button
          key={tool.label}
          type="button"
          className={`mt-tb-btn mt-tb-rich${active[tool.mark] ? ' is-active' : ''}`}
          title={tool.label}
          aria-label={tool.label}
          aria-pressed={active[tool.mark]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => tool.run(editor)}
        >
          <NavIcon name={tool.icon} />
        </button>
      ))}
      <ColorMarkButtons editor={editor} buttonClassName="mt-tb-btn mt-tb-rich" />
    </>
  );
}

function InCellToolsDisabled() {
  return (
    <>
      {[...IN_CELL_TOOLS, ...COLOR_STUBS].map((tool) => (
        <button
          key={tool.label}
          type="button"
          className="mt-tb-btn mt-tb-rich"
          disabled
          title="Click into a cell to format its text"
          aria-label={tool.label}
        >
          <NavIcon name={tool.icon} />
        </button>
      ))}
    </>
  );
}

// ── helpers ──

function selectionHint(o: {
  rect: SelRect | null;
  canMerge: boolean;
  merged: boolean;
  single: boolean;
  singleCell: { heading: boolean } | null;
}): { text: string; tone: '' | 'accent' } {
  if (o.canMerge) return { text: 'Multiple cells selected — Merge to combine them into one.', tone: 'accent' };
  if (o.merged) return { text: 'Merged cell selected — Split to un-merge it back into a grid.', tone: 'accent' };
  if (o.single && o.singleCell) {
    return {
      text: o.singleCell.heading
        ? 'Heading cell selected. Type a label, or toggle Heading off to make it a normal cell.'
        : 'Cell selected — type, or Split to subdivide it into columns / rows.',
      tone: '',
    };
  }
  return { text: 'Click a cell to type. Drag across cells (or shift-click) to select a range, then Merge.', tone: '' };
}

function confirmDelete(title: string, rowCount: number): boolean {
  if (rowCount === 0) return true;
  return window.confirm(
    `Delete the "${title || 'Untitled'}" tab? Its ${rowCount} ${rowCount === 1 ? 'row' : 'rows'} will be lost.`,
  );
}
