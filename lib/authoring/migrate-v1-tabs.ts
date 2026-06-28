// mynclex/lib/authoring/migrate-v1-tabs.ts
//
// Rich-content relook — Slice 5 (built-in templates → v2).
//
// Pure converters that lift a v1 chart-tab's stored `entries` into the v2
// blob shape the new editors + student views already understand. Routing is
// shape-based (asMergeTab / asNarrativeTab key on the `{ v:2 }` object, not
// tab_key), so once a tab's entries become a v2 object it auto-opens in the
// new editor and renders through the new view — no per-tab_key special-casing.
//
// This module is the DATA half of Slice 5. It is deliberately generic: it
// takes plain column/entry data, never a bank type, so lib/authoring/ keeps
// its decoupling from lib/bank/ (the bank layer maps its registry/columns
// onto these). Pure + unit-tested against real dev blobs before any DB write
// (the "careful, test-first" migration method).
//
// Slice 5.1 ships the STRUCTURED → merge-table converter (Vital Signs first,
// reused by Labs + custom grids). The narrative converter lands in 5.3.

import {
  type MergeCell,
  type MergeRow,
  type MergeTable,
  type MergeTabData,
  MT_VERSION,
  VF_MIN,
  VF_MAX,
} from './table/merge-table-model';
import { parseRichDoc, type RichDoc } from './rich-doc';

// ── shared helpers ────────────────────────────────────────────

/** A column definition — structurally what both BuiltInColumn and the
 *  custom-grid CaseStudyTabColumn already are ({ id, label }). */
export interface V1Column {
  id:    string;
  label: string;
}

/** A v1 structured row: per-column string values keyed by column id, plus a
 *  `visible_from` reveal position. (Values may arrive as numbers in old data.) */
export type V1StructuredEntry = Record<string, unknown> & {
  visible_from?: unknown;
};

function buildCell(id: string, content: RichDoc, heading: boolean): MergeCell {
  return { id, content, heading, colspan: 1, rowspan: 1, covered: false };
}

/** Coerce any stored `visible_from` to a valid 1..6 reveal position. */
function clampVf(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return VF_MIN;
  return Math.min(VF_MAX, Math.max(VF_MIN, Math.trunc(n)));
}

// ── structured → merge table ──────────────────────────────────

/**
 * Convert a v1 structured tab (built-in Vitals/Labs, or a custom grid) into a
 * single v2 merge table:
 *   - the column titles become a HEADING ROW (all-heading → isHeaderRow true,
 *     so its visibility is derived from the data rows, never gated itself);
 *   - each entry becomes one data row; its per-column value becomes a rich
 *     cell (a plain string wrapped as a one-paragraph RichDoc);
 *   - `visible_from` carries to the row's `visibleFrom`.
 *
 * When `entries` is empty, one blank data row is produced so the tab opens
 * with somewhere to type — this doubles as the SEED for a brand-new built-in
 * (call with []). Ids are deterministic (c0,c1,… / r0,r1,…), matching the
 * model's id scheme so later adds never collide.
 */
export function structuredToMergeTable(
  columns: readonly V1Column[],
  entries: readonly V1StructuredEntry[],
): MergeTable {
  const cols = columns.length;
  let cid = 0;
  const grid: MergeCell[][] = [];
  const rows: MergeRow[] = [];

  // Heading row — column titles as heading cells.
  rows.push({ id: 'r0', visibleFrom: VF_MIN });
  grid.push(columns.map((c) => buildCell('c' + cid++, parseRichDoc(c.label), true)));

  // Data rows — one per entry, or a single blank row when there are none.
  const dataRows: (V1StructuredEntry | null)[] =
    entries.length > 0 ? [...entries] : [null];
  dataRows.forEach((entry, i) => {
    rows.push({
      id: 'r' + (i + 1),
      visibleFrom: entry ? clampVf(entry.visible_from) : VF_MIN,
    });
    grid.push(
      columns.map((c) =>
        buildCell(
          'c' + cid++,
          parseRichDoc(entry ? String(entry[c.id] ?? '') : ''),
          false,
        ),
      ),
    );
  });

  return { id: 't0', cols, rows, grid };
}

/** Wrap {@link structuredToMergeTable} as a full v2 merge-table TAB
 *  (a one-element list of tables), ready to store in `entries`. */
export function structuredToMergeTab(
  columns: readonly V1Column[],
  entries: readonly V1StructuredEntry[],
): MergeTabData {
  return { v: MT_VERSION, tables: [structuredToMergeTable(columns, entries)] };
}
