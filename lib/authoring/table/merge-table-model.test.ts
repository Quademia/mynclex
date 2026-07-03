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
  insertRowAt,
  insertColAt,
  deleteRows,
  deleteCols,
  isHeaderRow,
  setVisibleFrom,
  setCellContent,
  cellText,
  plainToCellContent,
  asMergeTab,
  emptyTab,
  addTable,
  removeTable,
  isTableEmpty,
  isTabEmpty,
  studentRows,
  type MergeTable,
} from './merge-table-model';

// Count non-covered (rendered) cells.
function rendered(t: MergeTable): number {
  let n = 0;
  for (const row of t.grid) for (const c of row) if (!c.covered) n++;
  return n;
}

// Every cell id in the grid must be unique (React keys depend on it).
function allCellIdsUnique(t: MergeTable): boolean {
  const ids = t.grid.flat().map((c) => c.id);
  return new Set(ids).size === ids.length;
}

describe('emptyTable', () => {
  it('is a uniform grid of blank 1×1 cells at Q1', () => {
    const t = emptyTable(2, 3);
    expect(t.id).toBeTruthy();
    expect(t.cols).toBe(3);
    expect(t.rows).toHaveLength(2);
    expect(t.grid.flat()).toHaveLength(6);
    expect(rendered(t)).toBe(6);
    expect(t.rows.every((r) => r.visibleFrom === 1)).toBe(true);
    expect(isTableEmpty(t)).toBe(true);
  });
});

describe('tab (list of tables)', () => {
  it('emptyTab starts with one table and is empty', () => {
    const tab = emptyTab();
    expect(tab.v).toBe(2);
    expect(tab.tables).toHaveLength(1);
    expect(isTabEmpty(tab)).toBe(true);
  });

  it('addTable appends a table with a fresh id; removeTable keeps ≥1', () => {
    let tab = emptyTab();
    tab = addTable(tab);
    expect(tab.tables).toHaveLength(2);
    expect(tab.tables[0].id).not.toBe(tab.tables[1].id);
    tab = removeTable(tab, 0);
    expect(tab.tables).toHaveLength(1);
    tab = removeTable(tab, 0);
    expect(tab.tables).toHaveLength(1); // never removes the last table
  });

  it('asMergeTab upgrades the legacy single-table shape into a one-table list', () => {
    const legacy = { v: 2, cols: 2, rows: [{ id: 'r0', visibleFrom: 1 }], grid: [[{ id: 'c0', content: { type: 'doc', content: [] }, heading: false, colspan: 1, rowspan: 1, covered: false }, { id: 'c1', content: { type: 'doc', content: [] }, heading: false, colspan: 1, rowspan: 1, covered: false }]] };
    const tab = asMergeTab(legacy);
    expect(tab).toBeTruthy();
    expect(tab!.tables).toHaveLength(1);
    expect(tab!.tables[0].id).toBe('t0');
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

describe('positional insert (insertRowAt / insertColAt)', () => {
  it('inserts a row mid-grid: all new cells real, ids unique', () => {
    let t = emptyTable(3, 2);
    t = insertRowAt(t, 1);
    expect(t.rows.length).toBe(4);
    expect(t.grid[1].every((c) => !c.covered)).toBe(true);
    expect(rendered(t)).toBe(8);
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('inserts at the edges (0 and rows.length)', () => {
    let t = emptyTable(2, 2);
    t = insertRowAt(t, 0);
    t = insertRowAt(t, t.rows.length);
    expect(t.rows.length).toBe(4);
    expect(rendered(t)).toBe(8);
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('a merge crossing the row line expands instead of breaking', () => {
    let t = emptyTable(3, 2);
    t = merge(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 2, c: 0 } })!); // col 0 spans rows 0-2
    t = insertRowAt(t, 1); // line inside the merge
    expect(t.rows.length).toBe(4);
    expect(t.grid[0][0].rowspan).toBe(4);       // expanded
    expect(t.grid[1][0].covered).toBe(true);    // filler under the merge
    expect(t.grid[1][1].covered).toBe(false);   // real cell outside it
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('inserting ABOVE a merge does not expand it', () => {
    let t = emptyTable(3, 2);
    t = merge(t, selRect(t, { a: { r: 1, c: 0 }, f: { r: 2, c: 0 } })!); // col 0 spans rows 1-2
    t = insertRowAt(t, 1); // line at the merge's top edge
    expect(t.grid[2][0].rowspan).toBe(2);       // merge moved down, unchanged
    expect(t.grid[1].every((c) => !c.covered)).toBe(true);
  });

  it('the new row inherits visibleFrom from the reference row', () => {
    let t = emptyTable(3, 1);
    t = setVisibleFrom(t, 1, 4);
    // "Row below row 1" → boundary 2, inherit row 1
    const below = insertRowAt(t, 2, 1);
    expect(below.rows[2].visibleFrom).toBe(4);
    // "Row above row 1" → boundary 1, inherit row 1
    const above = insertRowAt(t, 1, 1);
    expect(above.rows[1].visibleFrom).toBe(4);
    // default (no reference): the row above the line
    const dflt = insertRowAt(t, 2);
    expect(dflt.rows[2].visibleFrom).toBe(4);
  });

  it('new cells never inherit the heading role', () => {
    let t = emptyTable(2, 2);
    t = toggleHeading(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 0, c: 1 } })!);
    t = insertRowAt(t, 1);
    expect(t.grid[1].every((c) => !c.heading)).toBe(true);
  });

  it('inserts a column mid-grid: every row gains one real cell', () => {
    let t = emptyTable(2, 3);
    t = insertColAt(t, 1);
    expect(t.cols).toBe(4);
    expect(t.grid.every((row) => row.length === 4)).toBe(true);
    expect(rendered(t)).toBe(8);
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('a merge crossing the column line expands instead of breaking', () => {
    let t = emptyTable(2, 3);
    t = merge(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 0, c: 2 } })!); // row 0 spans cols 0-2
    t = insertColAt(t, 1); // line inside the merge
    expect(t.cols).toBe(4);
    expect(t.grid[0][0].colspan).toBe(4);       // expanded
    expect(t.grid[0][1].covered).toBe(true);    // filler inside the span
    expect(t.grid[1][1].covered).toBe(false);   // real cell in the other row
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('a block merge (rowspan × colspan) crossing the column line bumps once', () => {
    let t = emptyTable(3, 3);
    t = merge(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 1, c: 1 } })!); // 2×2 block
    t = insertColAt(t, 1); // line inside the block, crosses both its rows
    expect(t.grid[0][0].colspan).toBe(3);       // bumped exactly once
    expect(t.grid[0][0].rowspan).toBe(2);
    expect(t.grid[0][1].covered).toBe(true);
    expect(t.grid[1][1].covered).toBe(true);
    expect(t.grid[2][1].covered).toBe(false);   // row outside the block: real cell
    expect(allCellIdsUnique(t)).toBe(true);
  });

  it('column insert at the edges (0 and cols)', () => {
    let t = emptyTable(2, 2);
    t = insertColAt(t, 0);
    t = insertColAt(t, t.cols);
    expect(t.cols).toBe(4);
    expect(rendered(t)).toBe(8);
    expect(allCellIdsUnique(t)).toBe(true);
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

describe('studentRows (reveal + span correction)', () => {
  it('hides a header row until its data appears, then shows both', () => {
    let t = emptyTable(2, 2);
    t = toggleHeading(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 0, c: 1 } })!); // row 0 = header
    t = setVisibleFrom(t, 1, 3); // the data row appears at Q3
    expect(studentRows(t, 1)).toHaveLength(0);        // nothing yet (header derived-hidden)
    const at3 = studentRows(t, 3);
    expect(at3).toHaveLength(2);                       // header + data
    // the data row's cells are flagged just-revealed at Q3
    expect(at3[1].cells[0].justRevealed).toBe(true);
  });

  it('shrinks a merged cell that spans a hidden row to the visible span', () => {
    let t = emptyTable(3, 2);
    t = merge(t, selRect(t, { a: { r: 0, c: 0 }, f: { r: 2, c: 0 } })!); // col 0 spans 3 rows
    t = setVisibleFrom(t, 1, 5); // middle row hidden until Q5
    const rows = studentRows(t, 1);
    expect(rows).toHaveLength(2);                      // rows 0 and 2 visible
    const spanned = rows[0].cells.find((c) => c.rowSpan === 2);
    expect(spanned).toBeTruthy();                      // 3-row merge → effective 2 visible rows
  });

  it('reveals later rows as the question advances', () => {
    let t = emptyTable(3, 1);
    t = setVisibleFrom(t, 1, 2);
    t = setVisibleFrom(t, 2, 4);
    expect(studentRows(t, 1)).toHaveLength(1);
    expect(studentRows(t, 2)).toHaveLength(2);
    expect(studentRows(t, 4)).toHaveLength(3);
  });
});

describe('asMergeTab guard', () => {
  it('accepts a v2 tab, rejects an array or junk', () => {
    expect(asMergeTab(emptyTab())).toBeTruthy();
    expect(asMergeTab([{ visible_from: 1 }])).toBeNull();
    expect(asMergeTab(null)).toBeNull();
    expect(asMergeTab({ v: 1 })).toBeNull();
  });
});
