// mynclex/lib/authoring/table/merge-table-model.ts
//
// Rich-content relook — Slice 2a.
//
// The data model + pure grid algebra for the custom merge table (the
// case-study "Phase Sheet" shape). One tab = one table. A table is a
// uniform grid of cells; merging lets a cell SPAN rows/columns (the
// neighbours it covers are marked `covered` and skipped on render).
//
// Storage (Slice 0 decision 2): this object is stamped `v: 2` and stored
// in the EXISTING `nclex_case_study_tabs.entries` JSONB on a `custom_grid`
// tab — no new column, no migration. The `v` stamp lets old (v1) custom
// grids and new (v2) merge tables coexist.
//
// Reveal (decisions 6-8): each ROW carries a `visibleFrom` (Q1-6). A header
// row (every non-covered cell is a heading) is DERIVED — it shows whenever
// its data rows show, so it has no independent `visibleFrom`.
//
// The operations are pure: each returns a NEW table (the caller holds the
// table in React state and replaces it). Algorithms adapted from the adopted
// Claude Design "Case Study Merge Table" prototype.

import type { RichDoc } from '../rich-doc';
import { EMPTY_RICH_DOC, parseRichDoc, richDocToPlain } from '../rich-doc';

export interface MergeCell {
  id:       string;
  content:  RichDoc;   // rich cell body (Slice 2a edits it as plain text)
  heading:  boolean;   // structural role — heading cell (label / column head)
  colspan:  number;
  rowspan:  number;
  covered:  boolean;   // true = absorbed by a merge; not rendered
}

export interface MergeRow {
  id:          string;
  visibleFrom: number; // 1..6 — the question this row first appears at
}

export interface MergeTableData {
  v:    2;
  cols: number;
  rows: MergeRow[];
  grid: MergeCell[][]; // rows.length × cols (covered cells included)
}

export interface CellPos { r: number; c: number }
export interface SelRect { top: number; left: number; bot: number; right: number }

export const MT_VERSION = 2 as const;
export const VF_MIN = 1;
export const VF_MAX = 6;

// ── id generation ─────────────────────────────────────────────
// Deterministic per-table counter (no Date.now/Math.random — those are
// unavailable in some runtimes and break replay). Ids only need to be
// unique within one table; we seed from the current max so adds never
// collide with loaded cells.
function maxNumericSuffix(prefix: string, ids: string[]): number {
  let max = 0;
  for (const id of ids) {
    if (id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

function allCellIds(t: MergeTableData): string[] {
  const out: string[] = [];
  for (const row of t.grid) for (const cell of row) out.push(cell.id);
  return out;
}

function nextCellId(t: MergeTableData): string {
  return 'c' + (maxNumericSuffix('c', allCellIds(t)) + 1);
}

function nextRowId(t: MergeTableData): string {
  return 'r' + (maxNumericSuffix('r', t.rows.map((r) => r.id)) + 1);
}

// ── construction ──────────────────────────────────────────────
function blankCell(id: string, heading = false): MergeCell {
  return {
    id,
    content: { ...EMPTY_RICH_DOC },
    heading,
    colspan: 1,
    rowspan: 1,
    covered: false,
  };
}

/** A fresh blank table — `rows × cols` of empty 1×1 cells, all at Q1. */
export function emptyTable(rows = 2, cols = 3): MergeTableData {
  let cid = 0;
  const grid: MergeCell[][] = [];
  const rowList: MergeRow[] = [];
  for (let r = 0; r < rows; r++) {
    rowList.push({ id: 'r' + r, visibleFrom: 1 });
    const rowCells: MergeCell[] = [];
    for (let c = 0; c < cols; c++) rowCells.push(blankCell('c' + cid++));
    grid.push(rowCells);
  }
  return { v: MT_VERSION, cols, rows: rowList, grid };
}

function clone(t: MergeTableData): MergeTableData {
  return JSON.parse(JSON.stringify(t)) as MergeTableData;
}

// ── header-row detection (derived) ────────────────────────────
/** A row is a header row when every non-covered cell in it is a heading. */
export function isHeaderRow(t: MergeTableData, r: number): boolean {
  let count = 0;
  for (let c = 0; c < t.cols; c++) {
    const cell = t.grid[r]?.[c];
    if (!cell || cell.covered) continue;
    count++;
    if (!cell.heading) return false;
  }
  return count > 0;
}

// ── selection rectangle (expanded to cover full merged spans) ──
export function selRect(t: MergeTableData, sel: { a: CellPos; f: CellPos } | null): SelRect | null {
  if (!sel) return null;
  const safe = (p: CellPos): CellPos | null => {
    const cc = t.grid[p.r]?.[p.c];
    return cc && !cc.covered ? p : null;
  };
  const a = safe(sel.a) ?? { r: 0, c: 0 };
  const f = safe(sel.f) ?? a;
  const ga = t.grid[a.r][a.c];
  const gf = t.grid[f.r][f.c];
  let top = Math.min(a.r, f.r);
  let left = Math.min(a.c, f.c);
  let bot = Math.max(a.r + ga.rowspan - 1, f.r + gf.rowspan - 1);
  let right = Math.max(a.c + ga.colspan - 1, f.c + gf.colspan - 1);

  // Grow the rectangle until it fully contains every merge it touches.
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let r = 0; r < t.rows.length; r++) {
      for (let c = 0; c < t.cols; c++) {
        const cell = t.grid[r][c];
        if (cell.covered) continue;
        const r0 = r, c0 = c, r1 = r + cell.rowspan - 1, c1 = c + cell.colspan - 1;
        const overlaps = !(r1 < top || r0 > bot || c1 < left || c0 > right);
        const inside = r0 >= top && r1 <= bot && c0 >= left && c1 <= right;
        if (overlaps && !inside) {
          top = Math.min(top, r0); left = Math.min(left, c0);
          bot = Math.max(bot, r1); right = Math.max(right, c1);
          changed = true;
        }
      }
    }
  }
  return { top, left, bot, right };
}

export function isSelected(t: MergeTableData, r: number, c: number, rect: SelRect | null): boolean {
  if (!rect) return false;
  const cell = t.grid[r][c];
  return (
    r >= rect.top &&
    r + cell.rowspan - 1 <= rect.bot &&
    c >= rect.left &&
    c + cell.colspan - 1 <= rect.right
  );
}

/** The origin (non-covered) cells inside a selection rectangle. */
export function originsIn(t: MergeTableData, rect: SelRect): Array<{ r: number; c: number; cell: MergeCell }> {
  const out: Array<{ r: number; c: number; cell: MergeCell }> = [];
  for (let r = rect.top; r <= rect.bot; r++) {
    for (let c = rect.left; c <= rect.right; c++) {
      const cell = t.grid[r][c];
      if (cell.covered) continue;
      out.push({ r, c, cell });
    }
  }
  return out;
}

// Origin cell covering logical position (ri, col) — walks the spans.
function findOrigin(t: MergeTableData, ri: number, col: number): { cell: MergeCell; r: number; c: number } | null {
  for (let r = 0; r <= ri; r++) {
    for (let c = 0; c <= col; c++) {
      const cell = t.grid[r][c];
      if (cell.covered) continue;
      if (r + cell.rowspan - 1 >= ri && c + cell.colspan - 1 >= col) return { cell, r, c };
    }
  }
  return null;
}

// ── structural ops (all pure — return a new table) ────────────

/** Merge the cells in `rect` into the top-left origin. */
export function merge(prev: MergeTableData, rect: SelRect): MergeTableData {
  if (rect.bot === rect.top && rect.right === rect.left) return prev; // nothing to merge
  const t = clone(prev);
  const tl = t.grid[rect.top][rect.left];
  for (let r = rect.top; r <= rect.bot; r++) {
    for (let c = rect.left; c <= rect.right; c++) {
      if (r === rect.top && c === rect.left) continue;
      t.grid[r][c] = { ...t.grid[r][c], covered: true };
    }
  }
  tl.colspan = rect.right - rect.left + 1;
  tl.rowspan = rect.bot - rect.top + 1;
  return t;
}

/** Un-merge a merged cell back into a plain grid of 1×1 cells. */
export function unmerge(prev: MergeTableData, r: number, c: number): MergeTableData {
  const t = clone(prev);
  const cell = t.grid[r]?.[c];
  if (!cell || cell.covered) return prev;
  for (let dr = 0; dr < cell.rowspan; dr++) {
    for (let dc = 0; dc < cell.colspan; dc++) {
      if (dr === 0 && dc === 0) continue;
      t.grid[r + dr][c + dc] = blankCell(nextCellId(t));
    }
  }
  cell.colspan = 1;
  cell.rowspan = 1;
  return t;
}

export function isMerged(cell: MergeCell): boolean {
  return cell.colspan > 1 || cell.rowspan > 1;
}

// Subdivide one cell horizontally by inserting a fine sub-column. Other
// rows keep their look: the cell covering the boundary bumps colspan +1.
function insertSubColumn(t: MergeTableData, targetRow: number, cellCol: number): void {
  const cell = t.grid[targetRow][cellCol];
  const insAt = cellCol + cell.colspan;
  const bumped = new Set<MergeCell>();
  for (let ri = 0; ri < t.rows.length; ri++) {
    if (ri === targetRow) {
      t.grid[ri].splice(insAt, 0, blankCell(nextCellId(t)));
    } else {
      const o = findOrigin(t, ri, insAt - 1);
      const cv = blankCell(nextCellId(t));
      cv.covered = true;
      t.grid[ri].splice(insAt, 0, cv);
      if (o && o.cell !== cell && !bumped.has(o.cell)) { o.cell.colspan += 1; bumped.add(o.cell); }
    }
  }
  t.cols += 1;
}

// Subdivide one cell vertically by inserting a fine sub-row.
function insertSubRow(t: MergeTableData, targetRow: number, cellCol: number): void {
  const cell = t.grid[targetRow][cellCol];
  const insAt = targetRow + cell.rowspan;
  // The new row's cells are built into `newRow` and spliced in only after
  // the loop, so they aren't yet in the grid — seed a running id counter
  // from the current max so each cell gets a unique id (not all the same).
  let nextNum = maxNumericSuffix('c', allCellIds(t)) + 1;
  const newId = (): string => 'c' + nextNum++;
  const newRow: MergeCell[] = [];
  const bumped = new Set<MergeCell>();
  for (let k = 0; k < t.cols; k++) {
    if (k === cellCol) {
      const nc = blankCell(newId());
      nc.colspan = cell.colspan;
      newRow.push(nc);
    } else if (k > cellCol && k < cellCol + cell.colspan) {
      const cv = blankCell(newId());
      cv.covered = true;
      newRow.push(cv);
    } else {
      const cv = blankCell(newId());
      cv.covered = true;
      newRow.push(cv);
      const o = findOrigin(t, targetRow, k);
      if (o && o.cell !== cell && !bumped.has(o.cell)) { o.cell.rowspan += 1; bumped.add(o.cell); }
    }
  }
  t.grid.splice(insAt, 0, newRow);
  t.rows.splice(insAt, 0, { id: nextRowId(t), visibleFrom: t.rows[targetRow].visibleFrom });
}

/** Subdivide a plain cell into `n` columns. */
export function subdivideCols(prev: MergeTableData, r: number, c: number, n: number): MergeTableData {
  const t = clone(prev);
  const cell = t.grid[r]?.[c];
  if (!cell || cell.covered) return prev;
  for (let i = 0; i < n - 1; i++) insertSubColumn(t, r, c);
  return t;
}

/** Subdivide a plain cell into `n` rows. */
export function subdivideRows(prev: MergeTableData, r: number, c: number, n: number): MergeTableData {
  const t = clone(prev);
  const cell = t.grid[r]?.[c];
  if (!cell || cell.covered) return prev;
  for (let i = 0; i < n - 1; i++) insertSubRow(t, r, c);
  return t;
}

/** Toggle the heading role on the origin cells in `rect`. */
export function toggleHeading(prev: MergeTableData, rect: SelRect): MergeTableData {
  const t = clone(prev);
  const origins = originsIn(t, rect);
  if (origins.length === 0) return prev;
  const allHead = origins.every((o) => o.cell.heading);
  const target = !allHead;
  for (const o of origins) o.cell.heading = target;
  return t;
}

export function addRow(prev: MergeTableData): MergeTableData {
  const t = clone(prev);
  const cells: MergeCell[] = [];
  for (let c = 0; c < t.cols; c++) cells.push(blankCell(nextCellId(t)));
  t.rows.push({ id: nextRowId(t), visibleFrom: 1 });
  t.grid.push(cells);
  return t;
}

export function addCol(prev: MergeTableData): MergeTableData {
  const t = clone(prev);
  for (let r = 0; r < t.rows.length; r++) t.grid[r].push(blankCell(nextCellId(t)));
  t.cols += 1;
  return t;
}

/** Delete the row band in `rect` (splits any merge crossing the band). Keeps ≥1 row. */
export function deleteRows(prev: MergeTableData, rect: SelRect): MergeTableData {
  const t = clone(prev);
  if (t.rows.length - (rect.bot - rect.top + 1) < 1) return prev;
  for (let r = 0; r < t.rows.length; r++) {
    for (let c = 0; c < t.cols; c++) {
      const cell = t.grid[r][c];
      if (cell.covered) continue;
      if (cell.rowspan > 1 && !(r + cell.rowspan - 1 < rect.top || r > rect.bot)) {
        splitInPlace(t, r, c);
      }
    }
  }
  for (let r = rect.bot; r >= rect.top; r--) { t.rows.splice(r, 1); t.grid.splice(r, 1); }
  return t;
}

/** Delete the column band in `rect`. Keeps ≥1 column. */
export function deleteCols(prev: MergeTableData, rect: SelRect): MergeTableData {
  const t = clone(prev);
  if (t.cols - (rect.right - rect.left + 1) < 1) return prev;
  for (let r = 0; r < t.rows.length; r++) {
    for (let c = 0; c < t.cols; c++) {
      const cell = t.grid[r][c];
      if (cell.covered) continue;
      if (cell.colspan > 1 && !(c + cell.colspan - 1 < rect.left || c > rect.right)) {
        splitInPlace(t, r, c);
      }
    }
  }
  for (let r = 0; r < t.rows.length; r++) t.grid[r].splice(rect.left, rect.right - rect.left + 1);
  t.cols -= rect.right - rect.left + 1;
  return t;
}

// In-place un-merge (used by delete-row/col before removing the band).
function splitInPlace(t: MergeTableData, r: number, c: number): void {
  const cell = t.grid[r][c];
  for (let dr = 0; dr < cell.rowspan; dr++) {
    for (let dc = 0; dc < cell.colspan; dc++) {
      if (dr === 0 && dc === 0) continue;
      t.grid[r + dr][c + dc] = blankCell(nextCellId(t));
    }
  }
  cell.colspan = 1;
  cell.rowspan = 1;
}

export function setVisibleFrom(prev: MergeTableData, r: number, v: number): MergeTableData {
  const t = clone(prev);
  if (!t.rows[r]) return prev;
  t.rows[r].visibleFrom = v;
  return t;
}

/** Replace a single cell's content. */
export function setCellContent(prev: MergeTableData, r: number, c: number, content: RichDoc): MergeTableData {
  const t = clone(prev);
  const cell = t.grid[r]?.[c];
  if (!cell || cell.covered) return prev;
  cell.content = content;
  return t;
}

// ── summaries / guards ────────────────────────────────────────
export function tableMeta(t: MergeTableData): { rows: number; merged: number; headings: number } {
  let merged = 0;
  let headings = 0;
  for (const row of t.grid) {
    for (const cell of row) {
      if (cell.covered) continue;
      if (isMerged(cell)) merged++;
      if (cell.heading) headings++;
    }
  }
  return { rows: t.rows.length, merged, headings };
}

/** True when no non-covered cell has any typed content. */
export function isTableEmpty(t: MergeTableData): boolean {
  for (const row of t.grid) {
    for (const cell of row) {
      if (cell.covered) continue;
      if (richDocToPlain(cell.content).trim().length > 0) return false;
    }
  }
  return true;
}

// ── type guard / parse ────────────────────────────────────────
/** Narrow an unknown `entries` JSONB value to a v2 merge table, else null. */
export function asMergeTable(entries: unknown): MergeTableData | null {
  if (
    entries &&
    typeof entries === 'object' &&
    !Array.isArray(entries) &&
    (entries as { v?: unknown }).v === MT_VERSION &&
    Array.isArray((entries as { grid?: unknown }).grid) &&
    Array.isArray((entries as { rows?: unknown }).rows)
  ) {
    return entries as MergeTableData;
  }
  return null;
}

// ── plain-text cell helpers (Slice 2a edits cells as plain text) ──
/** A cell's content as a single plain-text string. */
export function cellText(cell: MergeCell): string {
  return richDocToPlain(cell.content);
}

/** Wrap a plain-text string as a cell RichDoc (one paragraph per line). */
export function plainToCellContent(text: string): RichDoc {
  return parseRichDoc(text);
}
