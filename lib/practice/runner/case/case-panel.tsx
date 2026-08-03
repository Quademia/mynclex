// mynclex/lib/practice/runner/case/case-panel.tsx
//
// Sticky left-hand panel for case-child items. Composes:
//
//   ┌──────────────────────────────────────────┐
//   │  Case study  • X of 6 answered  (pill)   │  ← head: label + counter pill
//   │  <case title>                            │
//   ├──────────────────────────────────────────┤
//   │  Scenario | Vitals | Labs | Meds         │  ← tabs (filtered to visible)
//   ├──────────────────────────────────────────┤
//   │  <scenario summary, always shown above   │
//   │   the active tab's body>                 │  ← body (scrolls)
//   │                                          │
//   │  <ChartTabBody for active tab>           │
//   └──────────────────────────────────────────┘
//
// Visibility rules (slice 4.3):
//   • A TAB renders only if at least one of its entries has
//     visible_from ≤ currentPosition (strict — re-hide on backward nav).
//   • An ENTRY renders only if its own visible_from ≤ currentPosition
//     (handled inside <ChartTabBody>).
//
// Sticky state: which tab is active. Persists while the student moves
// between case-childs of the same case. Resets via React's key-based
// remount when the surrounding case_id changes (the runner keys this
// component on case_id).
//
// Header counter ("X of 6 answered") is computed by the parent runner
// from the current attempt-answer state and passed in — keeps the
// panel decoupled from answer state.

'use client';

import { useState } from 'react';
import type { CaseSnapshot } from '@/lib/practice/runner';
import type { TabRow } from '@/lib/bank/wrappers/case-study/types';
import { ChartTabBody } from './chart-tab-body';
import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc, isEmptyRichDoc } from '@/lib/authoring/rich-doc';
import { asMergeTab, tabHasVisibleContent } from '@/lib/authoring/table/merge-table-model';
import { asNarrativeTab, narrativeTabHasVisibleContent } from '@/lib/authoring/narrative/narrative-model';
import type { BankImageResolver } from '@/lib/authoring/bank-image-view';
import { bankImageRenderer } from '@/lib/authoring/bank-image-render';

interface Props {
  caseSnap:         CaseSnapshot;
  currentPosition:  number;     // 1..6 — the current case-child's case_position
  totalChildren:    number;     // expected to be 6 in v1, but read off the case
  answeredCount:    number;     // 0..totalChildren — drives the head pill
  // Slice 7 — attempt-anchored signed-URL resolver for bankImage nodes
  // in narrative bodies (bound to the attempt by the runner).
  resolveImageUrl?: BankImageResolver;
}

export function CasePanel({
  caseSnap,
  currentPosition,
  totalChildren,
  answeredCount,
  resolveImageUrl,
}: Props) {
  // tabs_snapshot_json is JSONB — typed as unknown[] in the runner data
  // shape. Coerce here so the rest of the component can lean on TabRow.
  const tabs = (caseSnap.tabs_snapshot_json ?? []) as TabRow[];

  // Tab-row filter: a tab appears iff at least one entry/row is visible.
  // A v2 custom table (object entries) uses its own reveal check.
  const visibleTabs = tabs
    .filter((t) => {
      const mt = asMergeTab(t.entries);
      if (mt) return tabHasVisibleContent(mt, currentPosition);
      const nt = asNarrativeTab(t.entries);
      if (nt) return narrativeTabHasVisibleContent(nt, currentPosition);
      return (
        Array.isArray(t.entries) &&
        t.entries.some((e) => Number(e?.visible_from) <= currentPosition)
      );
    })
    .sort((a, b) => a.display_order - b.display_order);

  const [activeId, setActiveId] = useState<string>(
    () => visibleTabs[0]?.tab_id ?? '',
  );

  // If the previously-active tab is no longer in the visible set
  // (e.g. backward nav past its visible_from), fall back to the first
  // visible tab without a useEffect dance.
  const effectiveActiveId = visibleTabs.some((t) => t.tab_id === activeId)
    ? activeId
    : visibleTabs[0]?.tab_id ?? '';

  const activeTab = visibleTabs.find((t) => t.tab_id === effectiveActiveId);

  return (
    <aside className="rn-case" aria-label="Case study panel" data-coach="casepanel">
      <div className="rn-case-head">
        <div className="label">
          Case study
          <span className="pill">
            {answeredCount} of {totalChildren} answered
          </span>
        </div>
        {/* Sealed during a live sitting (page.tsx, Pillar 2) — the title
            names the diagnosis, which is the answer to "Recognise cues".
            The "Case study" label above already identifies the panel, so
            the line is dropped rather than replaced with a placeholder. */}
        {caseSnap.title_snapshot ? (
          <div className="title">{caseSnap.title_snapshot}</div>
        ) : null}
      </div>

      {/* Scenario sits between head and tabs — a sibling of the title,
          not a tab. Always visible regardless of which tab is active.
          Pulled out of .rn-case-body in slice 4.3 follow-up so the
          tab body holds tab-specific data only. */}
      {(() => {
        // Scenario is rich content (Slice 1). parseRichDoc reads both the
        // new JSON shape and any legacy plain-text snapshot transparently.
        const scenarioDoc = parseRichDoc(caseSnap.scenario_summary_snapshot);
        if (isEmptyRichDoc(scenarioDoc)) return null;
        return (
          <div className="rn-case-scenario">
            <div className="label">Scenario</div>
            <RichRender
              doc={scenarioDoc}
              className="body"
              custom={bankImageRenderer(resolveImageUrl)}
            />
          </div>
        );
      })()}

      {visibleTabs.length > 0 && (
        <div className="rn-case-tabs" role="tablist" data-coach="casetabs">
          {visibleTabs.map((t) => (
            <button
              key={t.tab_id}
              type="button"
              role="tab"
              aria-selected={t.tab_id === effectiveActiveId}
              className={'rn-case-tab' + (t.tab_id === effectiveActiveId ? ' on' : '')}
              onClick={() => setActiveId(t.tab_id)}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}

      <div className="rn-case-body">
        {activeTab && (
          <ChartTabBody
            tab={activeTab}
            currentPosition={currentPosition}
            resolveImageUrl={resolveImageUrl}
          />
        )}
      </div>
    </aside>
  );
}
