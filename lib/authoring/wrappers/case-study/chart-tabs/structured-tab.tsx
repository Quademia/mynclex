// mynclex/lib/authoring/wrappers/case-study/chart-tabs/structured-tab.tsx
//
// Table editor for structured chart tabs — the shape shared by:
//   - Built-in structured tabs: vital_signs, lab_results. Columns come
//     from the tab-types.ts registry and are fixed.
//   - Custom grid tabs:         tab_key = 'custom_grid'. Columns come
//     from the tab row's columns_def JSONB and are curator-editable
//     via the pinned ColumnBuilder row at the top of the pane.
//
// Visible-from is always the right-most (logical) column, rendered as
// the segmented control. For custom_grid it also appears as a locked
// pill in the ColumnBuilder row, since curators can't rename or delete it.
//
// Slice 12c-2: vendored from lib/bank/case-study/structured-tab.tsx
// unchanged except local import paths.

'use client';

import { useState, useTransition } from 'react';
import { VisibleFromSegmented } from './vf-segmented';
import { deleteTabAction, upsertTabAction } from '../actions';
import type { BuiltInTabType, BuiltInColumn } from './tab-types';
import type {
  CaseStudyEntry,
  CaseStudyTabColumn,
  CaseStudyTabRow,
  Surface,
} from '../types';
import {
  CUSTOM_GRID_MAX_COLUMNS,
  CUSTOM_GRID_MIN_COLUMNS,
  VF_DEFAULT,
} from '../types';

interface Props {
  surface:     Surface;
  case_id:     string;
  tab:         CaseStudyTabRow;
  // null when this is a custom_grid tab (columns come from draftColumns
  // instead of the built-in registry).
  builtIn:     BuiltInTabType | null;
  draftTitle:   string;
  draftEntries: CaseStudyEntry[];
  // Ignored for built-in structured tabs; editable for custom_grid.
  draftColumns: CaseStudyTabColumn[];
  onDraftChange: (next: {
    title:       string;
    entries:     CaseStudyEntry[];
    columns_def: CaseStudyTabColumn[];
  }) => void;
  // Slice 1.11c — preview-as-position. null = Off; 1-6 = rows with
  // visible_from > N render with cs-entry--hidden + a "hidden until
  // Qx" label in the visible-from cell.
  previewPosition: number | null;
}

type EffectiveColumn = BuiltInColumn | CaseStudyTabColumn;

export function StructuredTabEditor({
  surface, case_id, tab, builtIn,
  draftTitle, draftEntries, draftColumns, onDraftChange,
  previewPosition,
}: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isGrid = tab.tab_key === 'custom_grid';

  // Columns the editor actually renders — from registry for built-ins,
  // from draftColumns for custom_grid.
  const columns: EffectiveColumn[] = isGrid
    ? draftColumns
    : (builtIn?.columns ?? []);

  // All mutators funnel through here so a stale error message from a
  // prior failed save gets cleared the moment the user starts editing.
  function mutate(patch: Partial<{
    title:       string;
    entries:     CaseStudyEntry[];
    columns_def: CaseStudyTabColumn[];
  }>) {
    if (err) setErr(null);
    onDraftChange({
      title:       patch.title       ?? draftTitle,
      entries:     patch.entries     ?? draftEntries,
      columns_def: patch.columns_def ?? draftColumns,
    });
  }

  function updateCell(idx: number, colId: string, value: string) {
    const next = draftEntries.slice();
    next[idx] = { ...next[idx], [colId]: value };
    mutate({ entries: next });
  }

  function updateVF(idx: number, v: number) {
    const next = draftEntries.slice();
    next[idx] = { ...next[idx], visible_from: v };
    mutate({ entries: next });
  }

  function addRow() {
    const row: CaseStudyEntry = { visible_from: VF_DEFAULT };
    for (const c of columns) row[c.id] = '';
    mutate({ entries: [...draftEntries, row] });
  }

  function removeRow(idx: number) {
    const next = draftEntries.slice();
    next.splice(idx, 1);
    mutate({ entries: next });
  }

  // ── Column-builder operations (custom_grid only) ──

  function addColumn() {
    if (draftColumns.length >= CUSTOM_GRID_MAX_COLUMNS) return;
    // Generate a fresh column id. Use c1, c2, ... pattern, skipping any
    // already in use so deleted ids aren't recycled into stale data.
    const used = new Set(draftColumns.map((c) => c.id));
    let n = 1;
    while (used.has(`c${n}`)) n++;
    const id = `c${n}`;
    mutate({
      columns_def: [...draftColumns, { id, label: `Column ${draftColumns.length + 1}` }],
    });
  }

  function renameColumn(idx: number, label: string) {
    const next = draftColumns.slice();
    next[idx] = { ...next[idx], label };
    mutate({ columns_def: next });
  }

  function moveColumn(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= draftColumns.length) return;
    const next = draftColumns.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    mutate({ columns_def: next });
  }

  function deleteColumn(idx: number) {
    if (draftColumns.length <= CUSTOM_GRID_MIN_COLUMNS) return;
    const col = draftColumns[idx];
    const hasData = draftEntries.some((e) => {
      const v = e[col.id];
      return v != null && String(v).length > 0;
    });
    if (hasData) {
      const ok = window.confirm(
        `Delete column "${col.label}"? Data in this column across ` +
        `${draftEntries.length} ${draftEntries.length === 1 ? 'row' : 'rows'} will be lost.`
      );
      if (!ok) return;
    }
    const nextCols = draftColumns.slice();
    nextCols.splice(idx, 1);
    const nextEntries = draftEntries.map((e) => {
      const copy = { ...e };
      delete copy[col.id];
      return copy;
    });
    mutate({ columns_def: nextCols, entries: nextEntries });
  }

  // ── Save / delete ──

  function onSave(fd: FormData) {
    startTransition(async () => {
      const res = await upsertTabAction(fd);
      if (!res.ok) setErr(res.error);
    });
  }

  function onDelete(fd: FormData) {
    if (draftEntries.length > 0) {
      const ok = window.confirm(
        `Delete the "${draftTitle}" tab? It has ${draftEntries.length} ` +
        `${draftEntries.length === 1 ? 'row' : 'rows'} that will be lost.`
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await deleteTabAction(fd);
      if (!res.ok) setErr(res.error);
    });
  }

  const columnsForSubmit: CaseStudyTabColumn[] = isGrid ? draftColumns : [];
  const atColumnMax = draftColumns.length >= CUSTOM_GRID_MAX_COLUMNS;
  const atColumnMin = draftColumns.length <= CUSTOM_GRID_MIN_COLUMNS;

  return (
    <div className="cs-entries-pane">
      <div className="cs-entries-head">
        <div className="cs-entries-title-group">
          <div className="cs-entries-title">
            <input
              className="cs-rename-input"
              type="text"
              value={draftTitle}
              onChange={(e) => mutate({ title: e.target.value })}
              placeholder="Tab title"
              aria-label="Tab title"
            />
          </div>
          <div className="cs-entries-desc">
            {isGrid
              ? <>Custom tab · rows &amp; columns · {draftEntries.length} {draftEntries.length === 1 ? 'row' : 'rows'}</>
              : <>Built-in tab <code>{tab.tab_key}</code> · structured · {draftEntries.length} {draftEntries.length === 1 ? 'row' : 'rows'}</>}
          </div>
        </div>
        <div className="cs-entries-actions">
          <form action={onDelete}>
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="case_id" value={case_id} />
            <input type="hidden" name="tab_id"  value={tab.tab_id} />
            <button type="submit" className="cs-btn danger" disabled={pending}>
              Delete tab
            </button>
          </form>
          <form action={onSave}>
            <input type="hidden" name="surface"       value={surface} />
            <input type="hidden" name="case_id"       value={case_id} />
            <input type="hidden" name="tab_id"        value={tab.tab_id} />
            <input type="hidden" name="tab_key"       value={tab.tab_key} />
            <input type="hidden" name="is_custom"     value={tab.is_custom ? 'true' : 'false'} />
            {tab.custom_shape && (
              <input type="hidden" name="custom_shape" value={tab.custom_shape} />
            )}
            <input type="hidden" name="display_order" value={String(tab.display_order)} />
            <input type="hidden" name="title"         value={draftTitle} />
            <input type="hidden" name="entries"       value={JSON.stringify(draftEntries)} />
            <input type="hidden" name="columns_def"   value={JSON.stringify(columnsForSubmit)} />
            <button type="submit" className="cs-btn primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save tab'}
            </button>
          </form>
        </div>
      </div>

      {err && <div className="cs-error">{err}</div>}

      {isGrid && (
        <div className="cs-col-builder">
          <span className="cs-col-builder-label">Columns</span>
          {draftColumns.map((col, idx) => (
            <span key={col.id} className="cs-col-pill">
              <input
                type="text"
                value={col.label}
                onChange={(e) => renameColumn(idx, e.target.value)}
                aria-label={`Column ${idx + 1} label`}
              />
              <span className="cs-col-reorder">
                <button
                  type="button"
                  onClick={() => moveColumn(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move column left"
                >◂</button>
                <button
                  type="button"
                  onClick={() => moveColumn(idx, 1)}
                  disabled={idx === draftColumns.length - 1}
                  aria-label="Move column right"
                >▸</button>
              </span>
              <button
                type="button"
                className="cs-col-del"
                onClick={() => deleteColumn(idx)}
                disabled={atColumnMin}
                aria-label={`Delete column ${col.label}`}
                title={atColumnMin ? `Minimum ${CUSTOM_GRID_MIN_COLUMNS} columns` : 'Delete column'}
              >×</button>
            </span>
          ))}
          <span className="cs-col-pill locked" aria-label="Locked column">
            Visible from <small>· fixed</small>
          </span>
          <button
            type="button"
            className="cs-col-add-btn"
            onClick={addColumn}
            disabled={atColumnMax}
            title={atColumnMax ? `Maximum ${CUSTOM_GRID_MAX_COLUMNS} columns` : 'Add column'}
          >
            + Add column
          </button>
          <span className={atColumnMax ? 'cs-col-bounds warn' : 'cs-col-bounds'}>
            {draftColumns.length} of {CUSTOM_GRID_MAX_COLUMNS} columns
          </span>
        </div>
      )}

      {columns.length === 0 ? (
        <div className="cs-entries-empty">
          <h4>No columns yet</h4>
          <p>Add at least {CUSTOM_GRID_MIN_COLUMNS} columns before adding rows.</p>
        </div>
      ) : draftEntries.length === 0 ? (
        <div className="cs-entries-empty">
          <h4>No rows yet</h4>
          <p>Add the first row to start populating this tab.</p>
        </div>
      ) : (
        <table className="cs-entries-table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.id}>{c.label}</th>)}
              <th className="cs-col-vf">Visible from</th>
              <th className="cs-col-del"></th>
            </tr>
          </thead>
          <tbody>
            {draftEntries.map((entry, idx) => {
              const vf = Number(entry.visible_from) || VF_DEFAULT;
              const entryHidden =
                previewPosition !== null && vf > previewPosition;
              return (
              <tr key={idx} className={entryHidden ? 'cs-entry--hidden' : ''}>
                {columns.map((c) => (
                  <td key={c.id}>
                    <input
                      type="text"
                      value={String(entry[c.id] ?? '')}
                      onChange={(e) => updateCell(idx, c.id, e.target.value)}
                      aria-label={`Row ${idx + 1} ${c.label}`}
                    />
                  </td>
                ))}
                <td>
                  {entryHidden && (
                    <span className="cs-entry-hidden-label">
                      hidden until Q{vf}
                    </span>
                  )}
                  <VisibleFromSegmented
                    value={vf}
                    onChange={(v) => updateVF(idx, v)}
                  />
                </td>
                <td className="cs-col-del">
                  <button
                    type="button"
                    className="cs-row-del-btn"
                    onClick={() => removeRow(idx)}
                    aria-label={`Remove row ${idx + 1}`}
                    title="Remove row"
                  >×</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {columns.length > 0 && (
        <div className="cs-entry-add-row">
          <button type="button" className="cs-add-entry-btn" onClick={addRow}>
            + Add row
          </button>
        </div>
      )}
    </div>
  );
}
