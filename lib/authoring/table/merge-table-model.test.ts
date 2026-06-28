// Smoke tests for the merge-table grid algebra (Slice 2a). These guard the
// bug-prone parts — span bookkeeping across merge / un-merge / subdivide /
// delete, and derived header-row detection.

import { describe, it, expect } from 'vitest';
import {
  emptyTable,
  selRect,
  merge,
  unmerge,
  subdivideCols,
  subdivideRows,
  toggleHeading,
  addRow,
  addCol,
  deleteRows,
  deleteCols,
  isHeaderRow,
  setVisibleFrom,
  setCellContent,
  cellText,
  plainToCellContent,
  asMergeTable,
  isTableEmpty,
  type MergeTableData,
} from './merge-table-model';

// Count non-covered (rendered) cells.
function rendered(t: MergeTableData): number {
  let n = 0;
  for (const row of t.grid) for (const c of row) if (!c.covered) n++;
  return n;
}

// Every cell id in the grid must be unique (React keys depend on it).
function allCellIdsUnique(t: MergeTableData): boolean {
  const ids = t.grid.flat().map((c) => c.id);
  return new Set(ids).size === ids.length;
}

describe('emptyTable', () => {
  it('is a uniform grid of blank 1×1 cells at Q1', () => {
    const t = emptyTable(2, 3);
    expect(t.v).toBe(2);
    expect(t.cols).toBe(3);
    expect(t.rows).toHaveLength(2);
    expect(t.grid.flat()).toHaveLength(6);
    expect(rendered(t)).toBe(6);
    expect(t.rows.every((r) => r.visibleFrom === 1)).toBe(true);
    expect(isTableEmpty(t)).toBe(true);
  });
});

describe('merge / unmerge', () => {
  it('merges a 2×2 block into one spanning cell and covers the rest', () => {
    const t0 = emptyTable(2, 3);
    const rect = selRect(t0, { a: { r: 0, c: 0 }, f: { r: 1, c: 1 } })!;
    const t = merge(t0, rect);
    const tl = t.grid[0][0];
    expect(tl.colspan).toBe(2);
    expect(tl.rowspan).toBe(2);
    // 6 cells - (the 3 absorbed) = 3 rendered (the span + the two col-2 cells)
    expect(rendered(t)).toBe(3);
  });

  it('un-merges back to a full grid of 1×1 cells', () => {
    const t0 = emptyTable(2, 3);
    const merged = merge(t0, selRect(t0, { a: { r: 0, c: 0 }, f: { r: 1, c: 1 } })!);
    const t = unmerge(merged, 0, 0);
    expect(rendered(t)).toBe(6);
    expect(t.grid[0][0].colspan).toBe(1);
    expect(t.grid[0][0].rowspan).toBe(1);
  });

  it('does not merge a single-cell selection', () => {
    const t0 = emptyTable(2, 2);
    const rect = selRect(t0, { a: { r: 0, c: 0 }, f: { r: 0, c: 0 } })!;
    const t = merge(t0, rect);
    expect(rendered(t)).toBe(4);
  });
});

describe('subdivide', () => {
  it('subdivides one cell into 2 columns, keeping other rows aligned', () => {
    const t0 = emptyTable(2, 2);
    const t = subdivideCols(t0, 0, 0, 2);
    expect(t.cols).toBe(3);
    // row 0 has 3 real cells; row 1 keeps 2 real cells (one bumped to colspan 2)
    const row1Real = t.grid[1].filter((c) => !c.covered);
    expect(row1Real).toHaveLength(2);
    const bumped = row1Real.find((c) => c.colspan === 2);
    expect(bumped).toBeTruthy();
  });

  it('subdivides one cell into 2 rows', () => {
    const t0 = emptyTable(2, 2);
    const t = subdivideRows(t0, 0, 0, 2);
    expect(t.rows.length).toBe(3);
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('keeps cell ids unique after repeated subdivides (React-key safety)', () => {
    let t = emptyTable(2, 3);
    t = subdivideRows(t, 0, 1, 3);
    t = subdivideCols(t, 1, 0, 2);
    t = subdivideRows(t, 0, 0, 2);
    expect(allCellIdsUnique(t)).toBe(true);
  });
});

describe('header-row detection (derived)', () => {
  it('a row of all-heading cells is a header row', () => {
    let t = emptyTable(2, 2);
    const rect = selRect(t, { a: { r: 0, c: 0 }, f: { r: 0, c: 1 } })!;
    t = toggleHeading(t, rect);
    expect(isHeaderRow(t, 0)).toBe(true);
    expect(isHeaderRow(t, 1)).toBe(false);
  });

  it('a row with a mix of heading + data cells is NOT a header row', () => {
    let t = emptyTable(1, 2);
    t = toggleHeading(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 0, c: 0 } })!);
    expect(isHeaderRow(t, 0)).toBe(false);
  });
});

describe('add / delete', () => {
  it('adds a row and a column', () => {
    let t = emptyTable(2, 2);
    t = addRow(t);
    t = addCol(t);
    expect(t.rows.length).toBe(3);
    expect(t.cols).toBe(3);
    expect(rendered(t)).toBe(9);
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('keeps cell ids unique across repeated addRow / addCol', () => {
    let t = emptyTable(2, 3);
    for (let i = 0; i < 4; i++) t = addRow(t);
    for (let i = 0; i < 2; i++) t = addCol(t);
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('deletes a row band but never the last row', () => {
    let t = emptyTable(2, 2);
    t = deleteRows(t, { top: 0, left: 0, bot: 0, right: 1 });
    expect(t.rows.length).toBe(1);
    // can't delete the final remaining row
    t = deleteRows(t, { top: 0, left: 0, bot: 0, right: 1 });
    expect(t.rows.length).toBe(1);
  });

  it('deletes a column band but never the last column', () => {
    let t = emptyTable(2, 2);
    t = deleteCols(t, { top: 0, left: 0, bot: 1, right: 0 });
    expect(t.cols).toBe(1);
    t = deleteCols(t, { top: 0, left: 0, bot: 1, right: 0 });
    expect(t.cols).toBe(1);
  });

  it('splits a merge that crosses a deleted row band', () => {
    let t = emptyTable(3, 2);
    t = merge(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 2, c: 0 } })!); // col 0 spans all 3 rows
    expect(t.grid[0][0].rowspan).toBe(3);
    t = deleteRows(t, { top: 1, left: 0, bot: 1, right: 1 }); // delete middle row
    expect(t.rows.length).toBe(2);
    // the merge was split, so col 0 is back to 1×1 cells
    expect(t.grid[0][0].rowspan).toBe(1);
    expect(rendered(t)).toBe(4);
  });
});

describe('cell content + reveal', () => {
  it('round-trips plain text through cell content', () => {
    let t = emptyTable(1, 1);
    t = setCellContent(t, 0, 0, plainToCellContent('Penicillin\nNo food allergies'));
    expect(cellText(t.grid[0][0])).toBe('Penicillin\nNo food allergies');
    expect(isTableEmpty(t)).toBe(false);
  });

  it('sets a row visibleFrom', () => {
    let t = emptyTable(2, 2);
    t = setVisibleFrom(t, 1, 3);
    expect(t.rows[1].visibleFrom).toBe(3);
  });
});

describe('asMergeTable guard', () => {
  it('accepts a v2 object, rejects an array or junk', () => {
    expect(asMergeTable(emptyTable())).toBeTruthy();
    expect(asMergeTable([{ visible_from: 1 }])).toBeNull();
    expect(asMergeTable(null)).toBeNull();
    expect(asMergeTable({ v: 1 })).toBeNull();
  });
});
