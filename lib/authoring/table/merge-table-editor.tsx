'use client';

// mynclex/lib/authoring/table/merge-table-editor.tsx
//
// Rich-content relook — Slices 2a–2c.
//
// The custom-table authoring editor, built from the adopted Claude Design
// "Case Study Merge Table" prototype. A custom tab holds an ordered LIST of
// tables (Slice 2c); each table is the merge grid. The curator types rich
// content in cells, drag/shift-selects a range, and uses one shared toolbar
// (Structure + In cell) that acts on whichever cell — in whichever table —
// is focused. A per-row "Appears" gutter sets which question each row first
// shows at; a row of all-heading cells is a derived header row ("auto").
//
// Cells use the roving rich field: only the single focused cell mounts a
// live editor; the rest render static formatted text, so drag-selecting a
// range never fights an editor for the mouse.

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type {
  Surface,
  ChartTabIdentity,
  TabSaveAction,
  TabDeleteAction,
} from '../chart-tab-types';
import { RichField } from '../rich-field';
import { RichRender } from '../rich-render';
import { isEmptyRichDoc, type RichDoc } from '../rich-doc';
import { InlineTools, InlineToolsDisabled } from '../inline-tools';
import {
  type MergeTabData,
  type MergeTable,
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
  insertRowAt,
  insertColAt,
  deleteRows,
  deleteCols,
  setVisibleFrom,
  setCellContent,
  tableMeta,
  addTable,
  removeTable,
  replaceTable,
  dedupeTabCellIds,
  VF_MAX,
} from './merge-table-model';

interface Props {
  surface:         Surface;
  tab:             ChartTabIdentity;
  draftTitle:      string;
  draftTab:        MergeTabData;
  onDraftChange:   (next: { title: string; tab: MergeTabData }) => void;
  previewPosition: number | null;
  // Persistence is injected by the wrapper (case study / trend). The
  // action adds its own parent-id field (case_id / trend_id).
  saveAction:      TabSaveAction;
  deleteAction:    TabDeleteAction;
  // Trend has no progressive disclosure — hide the per-row "Appears"
  // reveal gutter and its legend when true (default: shown, for case).
  hideReveal?:     boolean;
}

// Selection carries the table index it belongs to — a range never spans
// two tables.
type Sel = { ti: number; a: CellPos; f: CellPos } | null;

export function MergeTableEditor({
  surface, tab,
  draftTitle, draftTab, onDraftChange,
  previewPosition,
  saveAction, deleteAction,
  hideReveal = false,
}: Props) {
  const [sel, setSel] = useState<Sel>(null);
  const [dragging, setDragging] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  // End any drag when the mouse releases anywhere.
  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // One-time heal on open: re-id duplicate cell ids from tables saved before
  // the id-batch bug was fixed (no-op when ids are clean).
  useEffect(() => {
    const fixed = dedupeTabCellIds(draftTab);
    if (fixed !== draftTab) onDraftChange({ title: draftTitle, tab: fixed });
    // Mount-only heal; deps intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tables = draftTab.tables;
  const activeTi = sel?.ti ?? null;
  const activeTable = activeTi !== null ? tables[activeTi] ?? null : null;
  const rect = activeTable && sel ? selRect(activeTable, { a: sel.a, f: sel.f }) : null;

  function clearErr() {
    if (err) setErr(null);
  }
  function pushTab(nextTab: MergeTabData, nextSel?: Sel) {
    clearErr();
    onDraftChange({ title: draftTitle, tab: nextTab });
    if (nextSel !== undefined) setSel(nextSel);
    setSplitOpen(false);
    setInsertOpen(false);
  }
  // Apply a grid op (which returns a new table) to a given table index.
  function pushTable(ti: number, nextTable: MergeTable, nextSel?: Sel) {
    pushTab(replaceTable(draftTab, ti, nextTable), nextSel);
  }

  // ── selection gestures (table-aware) ──
  function onCellDown(e: React.MouseEvent, ti: number, r: number, c: number) {
    setDragging(true);
    setSplitOpen(false);
    setInsertOpen(false);
    if (e.shiftKey && sel && sel.ti === ti) setSel({ ti, a: sel.a, f: { r, c } });
    else setSel({ ti, a: { r, c }, f: { r, c } });
  }
  function onCellEnter(ti: number, r: number, c: number) {
    if (!dragging) return;
    // Only extend within the anchor's table — no cross-table ranges.
    setSel((s) => (s && s.ti === ti ? { ti, a: s.a, f: { r, c } } : s));
  }

  // The single cell currently in edit mode (sole selection, settled).
  const activePos: CellPos | null =
    !dragging && sel && sel.a.r === sel.f.r && sel.a.c === sel.f.c ? sel.a : null;

  // ── toolbar enable flags (against the active table) ──
  const hasSel = !!rect;
  const area = rect ? (rect.bot - rect.top + 1) * (rect.right - rect.left + 1) : 0;
  const origins = rect && activeTable ? originsIn(activeTable, rect) : [];
  const canMerge = !!rect && area > 1 && origins.length >= 2;
  const single = !!rect && rect.bot === rect.top && rect.right === rect.left;
  const singleCell = single && rect && activeTable ? activeTable.grid[rect.top][rect.left] : null;
  const merged = !!singleCell && isMerged(singleCell);
  const splitEnabled = !!singleCell;

  // ── structure ops (act on the active table) ──
  function doMerge() {
    if (!rect || activeTi === null || !activeTable) return;
    pushTable(activeTi, merge(activeTable, rect), {
      ti: activeTi, a: { r: rect.top, c: rect.left }, f: { r: rect.top, c: rect.left },
    });
  }
  function doSplit() {
    if (!singleCell || !rect || activeTi === null || !activeTable) return;
    if (merged) pushTable(activeTi, unmerge(activeTable, rect.top, rect.left));
    else { setInsertOpen(false); setSplitOpen((o) => !o); }
  }

  // ── positional insert (Slice 1b) ──
  // Boundary comes from the selection's edge; the new row inherits the
  // reference row's "Appears from". Post-insert, the selection moves into
  // the first real (non-covered) cell of the new row/column so the curator
  // can type immediately; a fully-covered line (inserted inside a merge
  // spanning everything) just clears the selection.
  function doInsertRow(side: 'above' | 'below') {
    if (!rect || activeTi === null || !activeTable) return;
    const at = side === 'above' ? rect.top : rect.bot + 1;
    const inheritFrom = side === 'above' ? rect.top : rect.bot;
    const next = insertRowAt(activeTable, at, inheritFrom);
    const c0 = next.grid[at].findIndex((cell) => !cell.covered);
    pushTable(activeTi, next,
      c0 >= 0 ? { ti: activeTi, a: { r: at, c: c0 }, f: { r: at, c: c0 } } : null);
  }
  function doInsertCol(side: 'left' | 'right') {
    if (!rect || activeTi === null || !activeTable) return;
    const at = side === 'left' ? rect.left : rect.right + 1;
    const next = insertColAt(activeTable, at);
    const r0 = next.grid.findIndex((row) => !row[at].covered);
    pushTable(activeTi, next,
      r0 >= 0 ? { ti: activeTi, a: { r: r0, c: at }, f: { r: r0, c: at } } : null);
  }
  // Hover-⊕ gutter inserts (Slice 1c) — boundary index straight from the
  // marker; the new row inherits from the row above the line (default).
  function onInsertRowBoundary(ti: number, at: number) {
    const next = insertRowAt(tables[ti], at);
    const c0 = next.grid[at].findIndex((cell) => !cell.covered);
    pushTable(ti, next,
      c0 >= 0 ? { ti, a: { r: at, c: c0 }, f: { r: at, c: c0 } } : null);
  }
  function onInsertColBoundary(ti: number, at: number) {
    const next = insertColAt(tables[ti], at);
    const r0 = next.grid.findIndex((row) => !row[at].covered);
    pushTable(ti, next,
      r0 >= 0 ? { ti, a: { r: r0, c: at }, f: { r: r0, c: at } } : null);
  }
  function doSubdivideCols(n: number) {
    if (!rect || activeTi === null || !activeTable) return;
    pushTable(activeTi, subdivideCols(activeTable, rect.top, rect.left, n));
  }
  function doSubdivideRows(n: number) {
    if (!rect || activeTi === null || !activeTable) return;
    pushTable(activeTi, subdivideRows(activeTable, rect.top, rect.left, n));
  }
  function doHeading() {
    if (!rect || activeTi === null || !activeTable) return;
    pushTable(activeTi, toggleHeading(activeTable, rect));
  }
  function doDelRows() {
    if (!rect || activeTi === null || !activeTable) return;
    pushTable(activeTi, deleteRows(activeTable, rect), null);
  }
  function doDelCols() {
    if (!rect || activeTi === null || !activeTable) return;
    pushTable(activeTi, deleteCols(activeTable, rect), null);
  }

  // ── per-table ops ──
  function onAddRow(ti: number) {
    const next = addRow(tables[ti]);
    pushTable(ti, next, { ti, a: { r: next.rows.length - 1, c: 0 }, f: { r: next.rows.length - 1, c: 0 } });
  }
  function onAddCol(ti: number) {
    pushTable(ti, addCol(tables[ti]));
  }
  function onVF(ti: number, r: number, v: number) {
    pushTable(ti, setVisibleFrom(tables[ti], r, v));
  }
  function onCellInput(ti: number, r: number, c: number, doc: RichDoc) {
    pushTable(ti, setCellContent(tables[ti], r, c, doc));
  }

  // ── tab-level ops ──
  function onAddTable() {
    pushTab(addTable(draftTab), null);
  }
  function onRemoveTable(ti: number) {
    if (!window.confirm(`Remove table ${ti + 1} from this tab? Its content will be lost.`)) return;
    pushTab(removeTable(draftTab, ti), null);
  }

  // ── save / delete ──
  function onSave(fd: FormData) {
    setErr(null);
    setPending(true);
    saveAction(fd)
      .then((res) => { if (!res.ok) setErr(res.error); })
      .finally(() => setPending(false));
  }
  function onDelete(fd: FormData) {
    if (!confirmDeleteTab(draftTitle)) return;
    setErr(null);
    setPending(true);
    deleteAction(fd)
      .then((res) => { if (!res.ok) setErr(res.error); })
      .finally(() => setPending(false));
  }

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
              onChange={(e) => { clearErr(); onDraftChange({ title: e.target.value, tab: draftTab }); }}
              placeholder="Tab title"
              aria-label="Tab title"
            />
          </div>
          <div className="cs-entries-desc">
            {tables.length} {tables.length === 1 ? 'table' : 'tables'}
          </div>
        </div>
        <div className="cs-entries-actions">
          <form action={onDelete}>
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="tab_id"  value={tab.tab_id} />
            <button type="submit" className="cs-btn danger" disabled={pending}>Delete tab</button>
          </form>
          <form action={onSave}>
            <input type="hidden" name="surface"       value={surface} />
            <input type="hidden" name="tab_id"        value={tab.tab_id} />
            {/* Post the tab's OWN identity, not a hardcoded custom one — a
                built-in (Vital Signs / Lab Results) routed into this v2 editor
                must stay a built-in on save, not become a custom tab. */}
            <input type="hidden" name="tab_key"       value={tab.tab_key} />
            <input type="hidden" name="is_custom"     value={tab.is_custom ? 'true' : 'false'} />
            {tab.custom_shape && (
              <input type="hidden" name="custom_shape" value={tab.custom_shape} />
            )}
            <input type="hidden" name="display_order" value={String(tab.display_order)} />
            <input type="hidden" name="title"         value={draftTitle} />
            <input type="hidden" name="entries"       value={JSON.stringify(draftTab)} />
            <input type="hidden" name="columns_def"   value="[]" />
            <button type="submit" className="cs-btn primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save tab'}
            </button>
          </form>
        </div>
      </div>

      {err && <div className="cs-error">{err}</div>}

      {/* toolbar — one shared bar acting on the focused cell, in any table */}
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
        <span className="mt-tb-split">
          <button type="button" className={`mt-tb-btn${insertOpen ? ' is-open' : ''}`} disabled={!hasSel}
            onClick={() => { setSplitOpen(false); setInsertOpen((o) => !o); }}
            title="Insert a whole row or column next to the selected cell">
            ⊕ Insert ▾
          </button>
          {insertOpen && hasSel && (
            <div className="mt-split-menu">
              <div className="mt-split-menu-title">Insert at the selection</div>
              <div className="mt-split-row">
                <span className="mt-split-row-label">Row</span>
                <button type="button" className="mt-split-opt" onClick={() => doInsertRow('above')}>Above</button>
                <button type="button" className="mt-split-opt" onClick={() => doInsertRow('below')}>Below</button>
              </div>
              <div className="mt-split-row">
                <span className="mt-split-row-label">Column</span>
                <button type="button" className="mt-split-opt" onClick={() => doInsertCol('left')}>Left</button>
                <button type="button" className="mt-split-opt" onClick={() => doInsertCol('right')}>Right</button>
              </div>
              <div className="mt-split-menu-note">A merge crossing the line grows to include the new row / column.</div>
            </div>
          )}
        </span>
        <button type="button" className="mt-tb-btn" disabled={!hasSel}
          onClick={doHeading} title="Mark the selected cells as headings (a role — left labels too, not only the top row)">⬚ Heading</button>
        <button type="button" className="mt-tb-btn danger" disabled={!hasSel}
          onClick={doDelRows} title="Delete the selected row(s)">Delete row</button>
        <button type="button" className="mt-tb-btn danger" disabled={!hasSel}
          onClick={doDelCols} title="Delete the selected column(s)">Delete col</button>

        <span className="mt-tb-sep" />
        <span className="mt-tb-group-label">In cell</span>
        {activeEditor
          ? <InlineTools editor={activeEditor} buttonClassName="mt-tb-btn mt-tb-rich" />
          : <InlineToolsDisabled buttonClassName="mt-tb-btn mt-tb-rich" hint="Click into a cell to format its text" />}
      </div>

      {/* selection hint */}
      <div className={`mt-hint${hint.tone ? ' ' + hint.tone : ''}`}>{hint.text}</div>

      {/* the tables */}
      {tables.map((tbl, ti) => (
        <TableBlock
          key={tbl.id}
          table={tbl}
          index={ti}
          single={tables.length === 1}
          rect={ti === activeTi ? rect : null}
          activePos={ti === activeTi ? activePos : null}
          previewPosition={previewPosition}
          hideReveal={hideReveal}
          onCellDown={onCellDown}
          onCellEnter={onCellEnter}
          onCellInput={onCellInput}
          onVF={onVF}
          onEditor={setActiveEditor}
          onAddRow={onAddRow}
          onAddCol={onAddCol}
          onInsertRowBoundary={onInsertRowBoundary}
          onInsertColBoundary={onInsertColBoundary}
          onRemove={onRemoveTable}
        />
      ))}

      {/* add a table to this tab */}
      <div className="mt-add-table-row">
        <button type="button" className="mt-add-table-btn" onClick={onAddTable}>
          + Add another table
        </button>
      </div>

      <div className="mt-legend">
        <span className="mt-legend-item"><span className="mt-swatch is-head" /> Heading cell</span>
        <span className="mt-legend-item"><span className="mt-swatch" /> Data cell</span>
        {!hideReveal && (
          <span className="mt-legend-item"><code>Appears</code> = which question the row first shows at · header rows are derived</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// One table — its header (label + remove), grid, and add row/col footer.
// ─────────────────────────────────────────────────────────────

function TableBlock({
  table, index, single, rect, activePos, previewPosition, hideReveal,
  onCellDown, onCellEnter, onCellInput, onVF, onEditor, onAddRow, onAddCol,
  onInsertRowBoundary, onInsertColBoundary, onRemove,
}: {
  table:           MergeTable;
  index:           number;
  single:          boolean;
  rect:            SelRect | null;
  activePos:       CellPos | null;
  previewPosition: number | null;
  hideReveal:      boolean;
  onCellDown:      (e: React.MouseEvent, ti: number, r: number, c: number) => void;
  onCellEnter:     (ti: number, r: number, c: number) => void;
  onCellInput:     (ti: number, r: number, c: number, doc: RichDoc) => void;
  onVF:            (ti: number, r: number, v: number) => void;
  onEditor:        (e: Editor | null) => void;
  onAddRow:        (ti: number) => void;
  onAddCol:        (ti: number) => void;
  onInsertRowBoundary: (ti: number, at: number) => void;
  onInsertColBoundary: (ti: number, at: number) => void;
  onRemove:        (ti: number) => void;
}) {
  const t = table;
  const meta = tableMeta(t);
  const activeCell =
    activePos && !t.grid[activePos.r]?.[activePos.c]?.covered
      ? t.grid[activePos.r][activePos.c]
      : null;

  // ── hover-⊕ insert markers (Slice 1c) ──────────────────────
  // Thin hover strips sit over the table's top edge (column boundaries)
  // and left edge (row boundaries). Moving inside a strip snaps a ⊕ dot
  // to the nearest grid-line boundary and draws a preview line; clicking
  // inserts there via the same tested ops the toolbar uses. The layer
  // only READS layout (cell rects → boundary positions), so it can't
  // corrupt the grid; it lives INSIDE the scroll container so markers
  // stay glued to their boundaries when a wide table scrolls.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [ins, setIns] = useState<{ kind: 'row' | 'col'; at: number; px: number } | null>(null);

  function onStripMove(e: React.MouseEvent, kind: 'row' | 'col') {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const pos = kind === 'col' ? e.clientX - wrapRect.left : e.clientY - wrapRect.top;
    // Boundary positions from the rendered data cells: a cell at (r, c)
    // anchors boundary c (its left edge) and c + colspan (its right edge)
    // — rows likewise. A boundary running entirely inside merges has no
    // anchoring edge and simply isn't offered (inserting there is still
    // possible via the toolbar).
    const best = { at: -1, px: 0, d: Number.POSITIVE_INFINITY };
    const seen = new Set<number>();
    const tds = wrap.querySelectorAll<HTMLTableCellElement>('td[data-c]');
    for (const td of Array.from(tds)) {
      const cellRect = td.getBoundingClientRect();
      const edges: Array<[number, number]> =
        kind === 'col'
          ? [
              [Number(td.dataset.c), cellRect.left - wrapRect.left],
              [Number(td.dataset.c) + (td.colSpan || 1), cellRect.right - wrapRect.left],
            ]
          : [
              [Number(td.dataset.r), cellRect.top - wrapRect.top],
              [Number(td.dataset.r) + (td.rowSpan || 1), cellRect.bottom - wrapRect.top],
            ];
      for (const [at, px] of edges) {
        if (seen.has(at)) continue;
        seen.add(at);
        const d = Math.abs(px - pos);
        if (d < best.d) { best.at = at; best.px = px; best.d = d; }
      }
    }
    setIns(best.at >= 0 ? { kind, at: best.at, px: best.px } : null);
  }

  function onInsClick() {
    if (!ins) return;
    if (ins.kind === 'col') onInsertColBoundary(index, ins.at);
    else onInsertRowBoundary(index, ins.at);
    setIns(null);
  }

  return (
    <div className="mt-table-block">
      <div className="mt-table-head">
        <span className="mt-table-label">
          {single ? 'Table' : `Table ${index + 1}`}
          <span className="mt-table-meta"> · {meta.rows} {meta.rows === 1 ? 'row' : 'rows'} · {meta.merged} merged · {meta.headings} headings</span>
        </span>
        {!single && (
          <button type="button" className="mt-table-remove" onClick={() => onRemove(index)} title="Remove this table">
            Remove table
          </button>
        )}
      </div>

      <div className="mt-grid-scroll">
        <div className="mt-inswrap" ref={wrapRef} onMouseLeave={() => setIns(null)}>
          <div className="mt-insgut mt-insgut-top" onMouseMove={(e) => onStripMove(e, 'col')}>
            {ins?.kind === 'col' && (
              <button
                type="button" className="mt-ins-dot" style={{ left: ins.px }}
                onClick={onInsClick} title="Insert a column here"
              >+</button>
            )}
          </div>
          <div className="mt-insgut mt-insgut-left" onMouseMove={(e) => onStripMove(e, 'row')}>
            {ins?.kind === 'row' && (
              <button
                type="button" className="mt-ins-dot" style={{ top: ins.px }}
                onClick={onInsClick} title="Insert a row here"
              >+</button>
            )}
          </div>
          {ins?.kind === 'col' && <div className="mt-ins-line is-v" style={{ left: ins.px }} />}
          {ins?.kind === 'row' && <div className="mt-ins-line is-h" style={{ top: ins.px }} />}
          <table className="mt-grid" onMouseMove={ins ? () => setIns(null) : undefined}>
          <tbody>
            {t.rows.map((row, r) => {
              const headerRow = isHeaderRow(t, r);
              const rowHidden = previewPosition !== null && !headerRow && row.visibleFrom > previewPosition;
              const tds: React.ReactNode[] = [];
              // Reveal gutter — omitted entirely when hideReveal (trend has
              // no progressive disclosure).
              if (!hideReveal) {
                tds.push(
                  <td key="g" className="mt-gutter">
                    {headerRow ? (
                      <span className="mt-gutter-auto" title="Header row — visibility is derived from its data rows">auto</span>
                    ) : (
                      <select
                        className={`mt-gutter-vf${row.visibleFrom > 1 ? ' is-later' : ''}`}
                        value={row.visibleFrom}
                        onChange={(e) => onVF(index, r, Number(e.target.value))}
                        title="Which question this row first appears at"
                      >
                        {Array.from({ length: VF_MAX }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>Q{n}</option>
                        ))}
                      </select>
                    )}
                  </td>,
                );
              }
              for (let c = 0; c < t.cols; c++) {
                const cell = t.grid[r][c];
                if (cell.covered) continue;
                const selected = isSelected(t, r, c, rect);
                const isActive = activeCell !== null && activePos!.r === r && activePos!.c === c;
                tds.push(
                  <td
                    key={cell.id}
                    data-r={r}
                    data-c={c}
                    colSpan={cell.colspan}
                    rowSpan={cell.rowspan}
                    className={
                      'mt-cell' +
                      (cell.heading ? ' is-head' : '') +
                      (selected ? ' is-sel' : '') +
                      (rowHidden ? ' is-hidden' : '')
                    }
                    onMouseDown={(e) => { if (!isActive) onCellDown(e, index, r, c); }}
                    onMouseEnter={() => onCellEnter(index, r, c)}
                  >
                    {isActive ? (
                      <div className="mt-cell-edit">
                        <RichField
                          key={cell.id}
                          value={cell.content}
                          hideToolbar
                          onEditor={onEditor}
                          onChange={(doc) => onCellInput(index, r, c, doc)}
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
      </div>

      <div className="mt-foot-actions">
        <button type="button" className="mt-foot-btn" onClick={() => onAddRow(index)}>+ Row</button>
        <button type="button" className="mt-foot-btn" onClick={() => onAddCol(index)}>+ Column</button>
      </div>
    </div>
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

function confirmDeleteTab(title: string): boolean {
  return window.confirm(`Delete the "${title || 'Untitled'}" tab? Everything in it will be lost.`);
}
