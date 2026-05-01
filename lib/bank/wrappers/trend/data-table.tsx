// mynclex/lib/bank/wrappers/trend/data-table.tsx
//
// Editable trend data-table. Renders the rows × timepoints grid with:
//   - per-cell text input
//   - per-cell flag cycle button (null → 'abnormal' → 'borderline' → null)
//   - row add/remove; column (timepoint) add/remove
//   - in-place rename of metric labels (left column) and timepoint headers
//   - ref-range column toggle (header-level button) + per-row ref_range input
//
// Controlled component — all state lives in the parent (wrapper-page.tsx).
// The wrapper mirrors state to hidden <input name="…" value={JSON.stringify(…)}>
// fields on the form for submit.
//
// Class names use the `tr-*` prefix (not `auth-tr-*`); the matching
// styles live in styles/dashboards.css.

'use client';

import type { TrendFlag, TrendRow } from './types';

interface Props {
  timepoints:        string[];
  rows:              TrendRow[];
  rowLabel:          string;
  onChange:          (next: { timepoints: string[]; rows: TrendRow[] }) => void;
  onRowLabelChange:  (next: string) => void;
}

// Fallback when the curator hasn't set a row-axis label.
// "Metric" matches the original hard-coded header so existing
// datasets render identically until edited.
const ROW_LABEL_FALLBACK = 'Metric';

// Cycle order for the per-cell flag button. null → abnormal → borderline → null.
const FLAG_CYCLE: TrendFlag[] = [null, 'abnormal', 'borderline'];

function nextFlag(current: TrendFlag): TrendFlag {
  const idx = FLAG_CYCLE.indexOf(current);
  return FLAG_CYCLE[(idx + 1) % FLAG_CYCLE.length] ?? null;
}

// Human label for the flag cycle button. Empty = no flag, shown as a
// dashed outline so it's discoverable.
function flagLabel(f: TrendFlag): string {
  if (f === 'abnormal')   return 'abn';
  if (f === 'borderline') return 'bdr';
  return '—';
}

// Class for the flag button + the containing cell.
function flagClass(f: TrendFlag): string {
  if (f === 'abnormal')   return 'tr-flag-btn tr-flag--abnormal';
  if (f === 'borderline') return 'tr-flag-btn tr-flag--borderline';
  return 'tr-flag-btn';
}

export function TrendDataTable({
  timepoints,
  rows,
  rowLabel,
  onChange,
  onRowLabelChange,
}: Props) {
  const refRangeEnabled = rows.some((r) => r.ref_range !== undefined);
  const rowLabelDisplay = rowLabel.trim() || ROW_LABEL_FALLBACK;

  // ── Mutators ──────────────────────────────────────────────────

  function addTimepoint() {
    const next = [...timepoints, ''];
    // Extend every existing row's values + flags to match.
    const rowsNext = rows.map((r) => ({
      ...r,
      values: [...r.values, ''],
      flags:  [...r.flags, null as TrendFlag],
    }));
    onChange({ timepoints: next, rows: rowsNext });
  }

  function removeTimepoint(idx: number) {
    const label = timepoints[idx] || `column ${idx + 1}`;
    const hasData = rows.some((r) => {
      const v = r.values[idx];
      return v !== undefined && v.trim() !== '';
    });
    if (hasData) {
      const ok = window.confirm(
        `Remove "${label}"? Data in this column across ` +
        `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} will be lost.`,
      );
      if (!ok) return;
    }
    const tps = timepoints.slice();
    tps.splice(idx, 1);
    const rowsNext = rows.map((r) => {
      const values = r.values.slice();
      const flags  = r.flags.slice();
      values.splice(idx, 1);
      flags.splice(idx, 1);
      return { ...r, values, flags };
    });
    onChange({ timepoints: tps, rows: rowsNext });
  }

  function renameTimepoint(idx: number, value: string) {
    const tps = timepoints.slice();
    tps[idx] = value;
    onChange({ timepoints: tps, rows });
  }

  function addRow() {
    const blank: TrendRow = {
      metric: '',
      values: timepoints.map(() => ''),
      flags:  timepoints.map(() => null as TrendFlag),
    };
    if (refRangeEnabled) blank.ref_range = '';
    onChange({ timepoints, rows: [...rows, blank] });
  }

  function removeRow(idx: number) {
    const label = rows[idx]?.metric || `row ${idx + 1}`;
    const hasData =
      rows[idx]?.values.some((v) => v.trim() !== '') ||
      (rows[idx]?.ref_range ?? '').trim() !== '';
    if (hasData) {
      const ok = window.confirm(`Remove "${label}"? Its cells will be lost.`);
      if (!ok) return;
    }
    const next = rows.slice();
    next.splice(idx, 1);
    onChange({ timepoints, rows: next });
  }

  function renameMetric(idx: number, value: string) {
    const next = rows.slice();
    next[idx] = { ...next[idx], metric: value };
    onChange({ timepoints, rows: next });
  }

  function setCell(rIdx: number, cIdx: number, value: string) {
    const next = rows.slice();
    const row = next[rIdx];
    if (!row) return;
    const values = row.values.slice();
    values[cIdx] = value;
    next[rIdx] = { ...row, values };
    onChange({ timepoints, rows: next });
  }

  function cycleFlag(rIdx: number, cIdx: number) {
    const next = rows.slice();
    const row = next[rIdx];
    if (!row) return;
    const flags = row.flags.slice();
    flags[cIdx] = nextFlag(flags[cIdx] ?? null);
    next[rIdx] = { ...row, flags };
    onChange({ timepoints, rows: next });
  }

  function setRefRange(rIdx: number, value: string) {
    const next = rows.slice();
    const row = next[rIdx];
    if (!row) return;
    next[rIdx] = { ...row, ref_range: value };
    onChange({ timepoints, rows: next });
  }

  function toggleRefRangeColumn() {
    if (refRangeEnabled) {
      // Warn if any row has ref-range data about to be dropped.
      const anyData = rows.some((r) => (r.ref_range ?? '').trim() !== '');
      if (anyData) {
        const ok = window.confirm(
          'Disable the ref-range column? Values entered on each row will be lost.',
        );
        if (!ok) return;
      }
      const next = rows.map((r) => {
        const copy = { ...r };
        delete copy.ref_range;
        return copy;
      });
      onChange({ timepoints, rows: next });
    } else {
      const next = rows.map((r) => ({ ...r, ref_range: r.ref_range ?? '' }));
      onChange({ timepoints, rows: next });
    }
  }

  // ── Render ────────────────────────────────────────────────────

  const hasCols = timepoints.length > 0;
  const hasRows = rows.length > 0;

  return (
    <section className="tr-data-section">
      <div className="tr-data-head">
        <div>
          <div className="tr-data-title">Data table</div>
          <div className="tr-data-sub">
            {hasRows
              ? <>{rows.length} {rows.length === 1 ? 'row' : 'rows'} × {timepoints.length} {timepoints.length === 1 ? 'timepoint' : 'timepoints'}.</>
              : 'No rows yet — pick a kind above for a starting template, or add rows below.'}
          </div>
        </div>
        <div className="tr-data-actions">
          <button
            type="button"
            className="tr-refrange-toggle"
            onClick={toggleRefRangeColumn}
            aria-pressed={refRangeEnabled}
          >
            {refRangeEnabled ? '✓ Ref-range' : '+ Ref-range'}
          </button>
          <button
            type="button"
            className="tr-col-add"
            onClick={addTimepoint}
          >
            + Timepoint
          </button>
        </div>
      </div>

      {!hasCols && !hasRows ? (
        <div className="tr-data-empty">
          <h4>Empty data table</h4>
          <p>
            Add at least one timepoint (column) and one row, or pick a kind
            above to seed a starting template.
          </p>
        </div>
      ) : (
        <div className="tr-table-scroll">
          <table className="tr-table">
            <thead>
              <tr>
                <th className="tr-col-metric">
                  <input
                    type="text"
                    value={rowLabel}
                    onChange={(e) => onRowLabelChange(e.target.value)}
                    placeholder={ROW_LABEL_FALLBACK}
                    aria-label="Row-axis label"
                    maxLength={40}
                  />
                </th>
                {timepoints.map((tp, cIdx) => (
                  <th key={cIdx} className="tr-col-tp">
                    <input
                      type="text"
                      value={tp}
                      onChange={(e) => renameTimepoint(cIdx, e.target.value)}
                      placeholder={`TP${cIdx + 1}`}
                      aria-label={`Timepoint ${cIdx + 1} label`}
                    />
                    <button
                      type="button"
                      className="tr-col-remove"
                      onClick={() => removeTimepoint(cIdx)}
                      aria-label={`Remove timepoint ${cIdx + 1}`}
                      title="Remove column"
                    >×</button>
                  </th>
                ))}
                {refRangeEnabled && (
                  <th className="tr-col-refrange">Ref range</th>
                )}
                <th className="tr-col-rowdel" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={rIdx}>
                  <td className="tr-col-metric">
                    <input
                      type="text"
                      value={r.metric}
                      onChange={(e) => renameMetric(rIdx, e.target.value)}
                      placeholder={rowLabelDisplay}
                      aria-label={`Row ${rIdx + 1} ${rowLabelDisplay.toLowerCase()} label`}
                    />
                  </td>
                  {timepoints.map((_, cIdx) => {
                    const flag = r.flags[cIdx] ?? null;
                    return (
                      <td key={cIdx} className="tr-cell">
                        <div className="tr-cell-row">
                          <input
                            type="text"
                            className="tr-cell-input"
                            value={r.values[cIdx] ?? ''}
                            onChange={(e) => setCell(rIdx, cIdx, e.target.value)}
                            aria-label={`Row ${rIdx + 1} ${timepoints[cIdx] || `timepoint ${cIdx + 1}`}`}
                          />
                          <button
                            type="button"
                            className={flagClass(flag)}
                            onClick={() => cycleFlag(rIdx, cIdx)}
                            title={`Flag: ${flag ?? 'none'} — click to cycle`}
                            aria-label={`Flag cell: ${flag ?? 'none'}`}
                          >
                            {flagLabel(flag)}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                  {refRangeEnabled && (
                    <td className="tr-refrange-cell">
                      <input
                        type="text"
                        value={r.ref_range ?? ''}
                        onChange={(e) => setRefRange(rIdx, e.target.value)}
                        placeholder="e.g. 3.5–5.0"
                        aria-label={`Row ${rIdx + 1} reference range`}
                      />
                    </td>
                  )}
                  <td className="tr-col-rowdel">
                    <button
                      type="button"
                      className="tr-row-remove"
                      onClick={() => removeRow(rIdx)}
                      aria-label={`Remove row ${rIdx + 1}`}
                      title="Remove row"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="tr-row-add-wrap">
        <button type="button" className="tr-row-add" onClick={addRow}>
          + Row
        </button>
      </div>
    </section>
  );
}
