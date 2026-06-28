// Tests for the v1 → v2 chart-tab converters (Slice 5). Fixtures are the REAL
// dev blobs (the "careful, test-first" migration method): we prove the
// transform against actual stored data before any DB write.

import { describe, it, expect } from 'vitest';
import {
  structuredToMergeTable,
  structuredToMergeTab,
  type V1Column,
  type V1StructuredEntry,
} from './migrate-v1-tabs';
import {
  asMergeTab,
  isHeaderRow,
  cellText,
  studentRows,
  type MergeTable,
} from './table/merge-table-model';

// The Vital Signs registry columns (from tab-types.ts).
const VITALS_COLS: V1Column[] = [
  { id: 'time', label: 'Time' },
  { id: 'bp',   label: 'BP'   },
  { id: 'hr',   label: 'HR'   },
  { id: 'rr',   label: 'RR'   },
  { id: 'spo2', label: 'SpO₂' },
  { id: 'temp', label: 'Temp' },
  { id: 'pain', label: 'Pain' },
];

// Real dev blob — NCLEX_CSE_TESTCASE01 "Vital Signs" (3 rows, reveal 1/3/5).
const TESTCASE01: V1StructuredEntry[] = [
  { bp: '110/68', hr: '88',  rr: '20', pain: '2', spo2: '95%', temp: '36.7', time: '08:00', visible_from: 1 },
  { bp: '98/60',  hr: '102', rr: '24', pain: '3', spo2: '93%', temp: '36.5', time: '12:00', visible_from: 3 },
  { bp: '86/54',  hr: '118', rr: '30', pain: '4', spo2: '90%', temp: '36.4', time: '16:00', visible_from: 5 },
];

// Every cell id in the grid must be unique (React keys depend on it).
function allCellIds(t: MergeTable): string[] {
  const out: string[] = [];
  for (const row of t.grid) for (const cell of row) out.push(cell.id);
  return out;
}

describe('structuredToMergeTable — structure', () => {
  it('builds a heading row of the column titles + one data row per entry', () => {
    const t = structuredToMergeTable(VITALS_COLS, TESTCASE01);
    expect(t.cols).toBe(7);
    // 1 heading row + 3 data rows
    expect(t.rows).toHaveLength(4);
    expect(t.grid).toHaveLength(4);
    // Heading row = all-heading → detected as a header row (derived reveal).
    expect(isHeaderRow(t, 0)).toBe(true);
    expect(t.grid[0].every((c) => c.heading)).toBe(true);
    expect(t.grid[0].map((c) => cellText(c))).toEqual(
      ['Time', 'BP', 'HR', 'RR', 'SpO₂', 'Temp', 'Pain'],
    );
    // Data rows are NOT heading.
    expect(isHeaderRow(t, 1)).toBe(false);
  });

  it('carries each cell value through as rich text', () => {
    const t = structuredToMergeTable(VITALS_COLS, TESTCASE01);
    // Data row 1 (grid index 1) — values in column order.
    expect(t.grid[1].map((c) => cellText(c))).toEqual(
      ['08:00', '110/68', '88', '20', '95%', '36.7', '2'],
    );
    // Cells are real RichDocs (one paragraph), not raw strings.
    expect(t.grid[1][0].content.type).toBe('doc');
  });

  it('maps visible_from to each data row’s visibleFrom (heading row at 1)', () => {
    const t = structuredToMergeTable(VITALS_COLS, TESTCASE01);
    expect(t.rows.map((r) => r.visibleFrom)).toEqual([1, 1, 3, 5]);
  });

  it('gives every cell a unique id', () => {
    const t = structuredToMergeTable(VITALS_COLS, TESTCASE01);
    const ids = allCellIds(t);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('structuredToMergeTable — empty tab (also the new-built-in seed)', () => {
  it('produces a heading row + one blank data row when there are no entries', () => {
    const t = structuredToMergeTable(VITALS_COLS, []);
    expect(t.rows).toHaveLength(2);            // heading + 1 blank
    expect(isHeaderRow(t, 0)).toBe(true);
    expect(t.grid[1].every((c) => cellText(c) === '')).toBe(true);
    expect(t.rows[1].visibleFrom).toBe(1);
  });
});

describe('structuredToMergeTable — reveal behaviour (student view)', () => {
  it('shows only the heading + rows revealed at each question', () => {
    const t = structuredToMergeTable(VITALS_COLS, TESTCASE01);
    // Q1: heading + row@1
    expect(studentRows(t, 1)).toHaveLength(2);
    // Q2: still heading + row@1 (next reveals at 3)
    expect(studentRows(t, 2)).toHaveLength(2);
    // Q3: heading + rows@1,3
    expect(studentRows(t, 3)).toHaveLength(3);
    // Q5: heading + all 3 data rows
    expect(studentRows(t, 5)).toHaveLength(4);
  });
});

describe('structuredToMergeTab — full v2 tab', () => {
  it('wraps the table as a { v:2, tables:[…] } blob that asMergeTab accepts', () => {
    const tab = structuredToMergeTab(VITALS_COLS, TESTCASE01);
    expect(tab.v).toBe(2);
    expect(tab.tables).toHaveLength(1);
    // Round-trips through the real loader the editor/runner use.
    const round = asMergeTab(JSON.parse(JSON.stringify(tab)));
    expect(round).not.toBeNull();
    expect(round!.tables[0].rows).toHaveLength(4);
  });

  it('clamps out-of-range / non-numeric visible_from to 1..6', () => {
    const weird: V1StructuredEntry[] = [
      { time: 'a', visible_from: 0 },     // → 1
      { time: 'b', visible_from: 99 },    // → 6
      { time: 'c', visible_from: 'x' },   // → 1
      { time: 'd' },                      // missing → 1
    ];
    const t = structuredToMergeTable([{ id: 'time', label: 'Time' }], weird);
    expect(t.rows.map((r) => r.visibleFrom)).toEqual([1, 1, 6, 1, 1]);
  });
});
