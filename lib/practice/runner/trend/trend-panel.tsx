// mynclex/lib/practice/runner/trend/trend-panel.tsx
//
// Sticky left-hand panel for trend questions. Composes:
//
//   ┌──────────────────────────────────────────┐
//   │  Trend data · Vitals                     │  ← head: kind label + title
//   │  <dataset title>                         │
//   ├──────────────────────────────────────────┤
//   │  Scenario  <free-text paragraph>         │  ← scenario (optional)
//   ├──────────────────────────────────────────┤
//   │  Metric | tp1 | tp2 | tp3 | (Ref range)  │  ← table head
//   │  BP     | …   | …   | …   |              │
//   │  HR     | …   | …   | …   |              │  ← rows × timepoints
//   └──────────────────────────────────────────┘
//
// Trends are scattered standalones (per attempt-creation §8.3) — there
// is no progressive disclosure, no answered-count pill, no entry banner.
// The dataset is shown in full from the moment the student lands on
// any trend question that uses it.
//
// Curator-side flags ('abnormal' / 'borderline') are stored on each
// cell but NOT rendered here — verified against the real NGN exam:
// NCSBN provides reference ranges where relevant but never pre-flags
// values for the test-taker. Pre-cuing answers would defeat the point
// of the trend item type. The runner shows raw values; the student
// interprets them against the optional ref-range column.
//
// Ref-range column auto-shows when at least one row has a non-empty
// ref_range — matches the curator editor's behaviour in
// lib/bank/wrappers/trend/data-table.tsx.

'use client';

import type { TrendSnapshot } from '@/lib/practice/runner';
import type { TrendRow } from '@/lib/bank/wrappers/trend/types';
import { kindDefaultLabel } from '@/lib/bank/wrappers/trend/kind-templates';

interface Props {
  trendSnap: TrendSnapshot;
}

const ROW_LABEL_FALLBACK = 'Metric';

export function TrendPanel({ trendSnap }: Props) {
  // JSONB columns surface as unknown[] in the runner data shape. Coerce
  // here so the rest of the component leans on TrendRow / string.
  const timepoints = (trendSnap.timepoints_snapshot_json ?? []) as string[];
  const rows       = (trendSnap.rows_snapshot_json       ?? []) as TrendRow[];
  const rowLabel   = (trendSnap.row_label_snapshot ?? '').trim() || ROW_LABEL_FALLBACK;
  const kindLabel  = kindDefaultLabel(trendSnap.kind_snapshot);

  // Show the ref-range column if any row has it set (matches the editor).
  const refRangeOn = rows.some((r) => (r.ref_range ?? '').trim() !== '');

  const hasRows = rows.length > 0;
  const hasCols = timepoints.length > 0;

  return (
    <aside className="rn-trend" aria-label="Trend dataset panel">
      <div className="rn-trend-head">
        <div className="label">
          <span className="dot" aria-hidden="true" />
          Trend data · {kindLabel}
        </div>
        <div className="title">{trendSnap.title_snapshot}</div>
      </div>

      {trendSnap.scenario_snapshot && (
        <div className="rn-trend-scenario">
          <div className="label">Scenario</div>
          <div className="body">{trendSnap.scenario_snapshot}</div>
        </div>
      )}

      <div className="rn-trend-body">
        {hasRows && hasCols ? (
          <table className="rn-trend-table">
            <thead>
              <tr>
                <th className="metric-col">{rowLabel}</th>
                {timepoints.map((tp, c) => (
                  <th key={c} className="tp-col">{tp || `TP${c + 1}`}</th>
                ))}
                {refRangeOn && <th className="refrange-col">Ref range</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="metric-col">{r.metric || `${rowLabel.toLowerCase()} ${i + 1}`}</td>
                  {timepoints.map((_, c) => (
                    <td key={c} className="tp">{r.values[c] ?? ''}</td>
                  ))}
                  {refRangeOn && (
                    <td className="refrange">{r.ref_range ?? ''}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No data in this dataset.</div>
        )}
      </div>
    </aside>
  );
}
