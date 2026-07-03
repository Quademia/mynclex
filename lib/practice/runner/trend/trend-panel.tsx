// mynclex/lib/practice/runner/trend/trend-panel.tsx
//
// Sticky left-hand panel for trend questions. The stimulus is a rich
// multi-chart (Slice 3b): a tab bar + the active tab's body, mirroring
// the case-study panel. Trends have NO progressive disclosure, so every
// tab is always shown (the reveal views render past any visible_from).
// Slice 4 retired the legacy flat grid — every trend is tab-based.
//
// Trends are scattered standalones (per attempt-creation §8.3) — there
// is no progressive disclosure, no answered-count pill, no entry banner.
// The stimulus is shown in full from the moment the student lands on any
// trend question that uses it.

'use client';

import { useState } from 'react';
import type { TrendSnapshot } from '@/lib/practice/runner';
import type { TrendTabRow } from '@/lib/bank/wrappers/trend/types';
import { asMergeTab } from '@/lib/authoring/table/merge-table-model';
import { MergeTableView } from '@/lib/authoring/table/merge-table-view';
import { asNarrativeTab } from '@/lib/authoring/narrative/narrative-model';
import { NarrativeView } from '@/lib/authoring/narrative/narrative-view';
import { parseRichDoc, isEmptyRichDoc } from '@/lib/authoring/rich-doc';
import { RichRender } from '@/lib/authoring/rich-render';
import type { BankImageResolver } from '@/lib/authoring/bank-image-view';

interface Props {
  trendSnap: TrendSnapshot;
  // Slice 7 — attempt-anchored signed-URL resolver for bankImage nodes
  // in narrative bodies (bound to the attempt by the runner).
  resolveImageUrl?: BankImageResolver;
}

// Show every revealed row/entry — trend has no progressive disclosure.
const SHOW_ALL_POSITION = 999;

export function TrendPanel({ trendSnap, resolveImageUrl }: Props) {
  const tabs = (trendSnap.tabs_snapshot_json ?? []) as TrendTabRow[];

  return (
    <aside className="rn-trend" aria-label="Trend dataset panel">
      <div className="rn-trend-head">
        <div className="label">
          <span className="dot" aria-hidden="true" />
          Trend data
        </div>
        <div className="title">{trendSnap.title_snapshot}</div>
      </div>

      {(() => {
        // Scenario is rich content (mirrors the case-study scenario).
        // parseRichDoc reads both a stored rich-doc and a legacy plain string.
        const scenarioDoc = parseRichDoc(trendSnap.scenario_snapshot ?? '');
        if (isEmptyRichDoc(scenarioDoc)) return null;
        return (
          <div className="rn-trend-scenario">
            <div className="label">Scenario</div>
            <RichRender doc={scenarioDoc} className="body" />
          </div>
        );
      })()}

      {tabs.length > 0 ? (
        <TabbedStimulus tabs={tabs} resolveImageUrl={resolveImageUrl} />
      ) : (
        <div className="rn-trend-body">
          <div className="empty">No data in this dataset.</div>
        </div>
      )}
    </aside>
  );
}

// ── Rich multi-chart: tab bar + active tab body ──────────────────
function TabbedStimulus({
  tabs,
  resolveImageUrl,
}: {
  tabs: TrendTabRow[];
  resolveImageUrl?: BankImageResolver;
}) {
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
        {activeTab && (
          <ChartTabBody tab={activeTab} resolveImageUrl={resolveImageUrl} />
        )}
      </div>
    </>
  );
}

function ChartTabBody({
  tab,
  resolveImageUrl,
}: {
  tab: TrendTabRow;
  resolveImageUrl?: BankImageResolver;
}) {
  const mt = asMergeTab(tab.entries);
  if (mt) return <MergeTableView tab={mt} currentPosition={SHOW_ALL_POSITION} />;
  const nt = asNarrativeTab(tab.entries);
  if (nt) {
    return (
      <NarrativeView
        tab={nt}
        currentPosition={SHOW_ALL_POSITION}
        resolveImageUrl={resolveImageUrl}
      />
    );
  }
  return <div className="empty">Nothing on this tab yet.</div>;
}
