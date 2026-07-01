// mynclex/lib/practice/runner/trend/trend-panel.tsx
//
// Sticky left-hand panel for trend questions. Two render paths:
//
//   • Rich multi-chart (Slice 3b) — when the snapshot carries chart tabs
//     (tabs_snapshot_json), render a tab bar + the active tab's body,
//     mirroring the case-study panel. Trends have NO progressive
//     disclosure, so every tab is always shown (the reveal views are
//     rendered past any visible_from).
//   • Legacy flat grid — when the snapshot has no tabs (older trends not
//     yet migrated to the tab model), fall back to the original
//     Metric × timepoints table.
//
// Trends are scattered standalones (per attempt-creation §8.3) — there
// is no progressive disclosure, no answered-count pill, no entry banner.
// The stimulus is shown in full from the moment the student lands on any
// trend question that uses it.
//
// Curator-side flags ('abnormal' / 'borderline') on legacy rows are
// NOT rendered — NCSBN never pre-flags values for the test-taker.

'use client';

import { useState } from 'react';
import type { TrendSnapshot } from '@/lib/practice/runner';
import type { TrendRow, TrendTabRow } from '@/lib/bank/wrappers/trend/types';
import { kindDefaultLabel } from '@/lib/bank/wrappers/trend/kind-templates';
import { asMergeTab } from '@/lib/authoring/table/merge-table-model';
import { MergeTableView } from '@/lib/authoring/table/merge-table-view';
import { asNarrativeTab } from '@/lib/authoring/narrative/narrative-model';
import { NarrativeView } from '@/lib/authoring/narrative/narrative-view';

interface Props {
  trendSnap: TrendSnapshot;
}

const ROW_LABEL_FALLBACK = 'Metric';

// Show every revealed row/entry — trend has no progressive disclosure.
const SHOW_ALL_POSITION = 999;

export function TrendPanel({ trendSnap }: Props) {
  const kindLabel = kindDefaultLabel(trendSnap.kind_snapshot);
  const tabs = (trendSnap.tabs_snapshot_json ?? []) as TrendTabRow[];

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

      {tabs.length > 0 ? (
        <TabbedStimulus tabs={tabs} />
      ) : (
        <LegacyGrid trendSnap={trendSnap} />
      )}
    </aside>
  );
}

// ── Rich multi-chart: tab bar + active tab body ──────────────────
function TabbedStimulus({ tabs }: { tabs: TrendTabRow[] }) {
  const ordered = [...tabs].sort((a, b) => a.display_order - b.display_order);
  const [activeId, setActiveId] = useState<string>(() => ordered[0]?.tab_id ?? '');
  const effectiveId = ordered.some((t) => t.tab_id === activeId)
    ? activeId
    : ordered[0]?.tab_id ?? '';
  const activeTab = ordered.find((t) => t.tab_id === effectiveId);

  return (
    <>
      <div className="rn-case-tabs" role="tablist">
        {ordered.map((t) => (
          <button
            key={t.tab_id}
            type="button"
            role="tab"
            aria-selected={t.tab_id === effectiveId}
            className={'rn-case-tab' + (t.tab_id === effectiveId ? ' on' : '')}
            onClick={() => setActiveId(t.tab_id)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div className="rn-trend-body">
        {activeTab && <ChartTabBody tab={activeTab} />}
      </div>
    </>
  );
}

function ChartTabBody({ tab }: { tab: TrendTabRow }) {
  const mt = asMergeTab(tab.entries);
  if (mt) return <MergeTableView tab={mt} currentPosition={SHOW_ALL_POSITION} />;
  const nt = asNarrativeTab(tab.entries);
  if (nt) return <NarrativeView tab={nt} currentPosition={SHOW_ALL_POSITION} />;
  return <div className="empty">Nothing on this tab yet.</div>;
}

// ── Legacy flat grid (pre-tab trends) ────────────────────────────
function LegacyGrid({ trendSnap }: { trendSnap: TrendSnapshot }) {
  const timepoints = (trendSnap.timepoints_snapshot_json ?? []) as string[];
  const rows       = (trendSnap.rows_snapshot_json       ?? []) as TrendRow[];
  const rowLabel   = (trendSnap.row_label_snapshot ?? '').trim() || ROW_LABEL_FALLBACK;

  const refRangeOn = rows.some((r) => (r.ref_range ?? '').trim() !== '');
  const hasRows = rows.length > 0;
  const hasCols = timepoints.length > 0;

  return (
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
  );
}
