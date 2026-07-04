// mynclex/lib/practice/runner/case/chart-tab-body.tsx
//
// Renders one chart tab for the student runner. Every chart tab is v2
// (rich-content relook, Slice 5) — a custom merge table or a narrative tab,
// distinguished by the `entries` blob shape. Each renderer does its own
// per-row / per-entry reveal against currentPosition.
//
// The case panel's parent filters whole tabs that have nothing visible yet
// (filterVisibleTabs in case-panel.tsx); this component renders the active
// tab's visible content.

import type { TabRow } from '@/lib/bank/wrappers/case-study/types';
import { asMergeTab } from '@/lib/authoring/table/merge-table-model';
import { MergeTableView } from '@/lib/authoring/table/merge-table-view';
import { asNarrativeTab } from '@/lib/authoring/narrative/narrative-model';
import { NarrativeView } from '@/lib/authoring/narrative/narrative-view';
import type { BankImageResolver } from '@/lib/authoring/bank-image-view';

interface Props {
  tab:             TabRow;
  currentPosition: number;
  // Slice 7 — attempt-anchored signed-URL resolver for bankImage nodes
  // in narrative bodies (bound to the attempt by the runner).
  resolveImageUrl?: BankImageResolver;
}

export function ChartTabBody({ tab, currentPosition, resolveImageUrl }: Props) {
  const mergeTab = asMergeTab(tab.entries);
  if (mergeTab) {
    return <MergeTableView tab={mergeTab} currentPosition={currentPosition} />;
  }
  const narrativeTab = asNarrativeTab(tab.entries);
  if (narrativeTab) {
    return (
      <NarrativeView
        tab={narrativeTab}
        currentPosition={currentPosition}
        resolveImageUrl={resolveImageUrl}
      />
    );
  }
  // Every chart tab is v2; a tab matching neither shape is malformed metadata.
  // Render a neutral placeholder rather than nothing.
  return <div className="empty">Nothing on this tab yet.</div>;
}
