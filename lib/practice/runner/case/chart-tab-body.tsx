// mynclex/lib/practice/runner/case/chart-tab-body.tsx
//
// Renders one chart tab's entries, filtered by visible_from <=
// currentPosition (per slice 4.3 decision: strict progressive
// disclosure, re-hides on backward nav).
//
// Three rendering shapes:
//   • Built-in structured (vital_signs / lab_results) — table with
//     columns from BUILT_IN_TABS registry.
//   • Built-in narrative (nurses_notes / orders / history /
//     diagnostics) — stacked entry cards using the registry's
//     extra_fields meta.
//   • Custom free_text — narrative cards with just visible_from + body.
//   • Custom rows_cols — table with curator-defined columns_def.
//
// The case panel's parent component is responsible for filtering tabs
// at the row level (a tab whose entries are all in the future doesn't
// render at all). This component handles the entry-level filter.

import {
  getTabType,
  type BuiltInColumn,
  type BuiltInExtraField,
} from '@/lib/bank/wrappers/case-study/chart-tabs/tab-types';
import type {
  TabRow,
  TabColumn,
  ChartEntry,
} from '@/lib/bank/wrappers/case-study/types';
import { asMergeTab } from '@/lib/authoring/table/merge-table-model';
import { MergeTableView } from '@/lib/authoring/table/merge-table-view';
import { asNarrativeTab } from '@/lib/authoring/narrative/narrative-model';
import { NarrativeView } from '@/lib/authoring/narrative/narrative-view';

interface Props {
  tab:             TabRow;
  currentPosition: number;
}

export function ChartTabBody({ tab, currentPosition }: Props) {
  // v2 custom tabs render through their own student renderers (per-row /
  // per-entry reveal) — not the entries-array path below.
  const mergeTab = asMergeTab(tab.entries);
  if (mergeTab) {
    return <MergeTableView tab={mergeTab} currentPosition={currentPosition} />;
  }
  const narrativeTab = asNarrativeTab(tab.entries);
  if (narrativeTab) {
    return <NarrativeView tab={narrativeTab} currentPosition={currentPosition} />;
  }

  // Strict visibility — a backward-nav student should see only what
  // would have been visible at currentPosition the first time they
  // arrived at it.
  const visibleEntries = (tab.entries as ChartEntry[]).filter(
    (e) => Number(e.visible_from) <= currentPosition,
  );

  if (visibleEntries.length === 0) {
    // Defensive — if all entries are in the future, the parent should
    // already have hidden the entire tab (filterVisibleTabs in
    // case-panel.tsx). But if this fires anyway, render an empty
    // placeholder rather than nothing.
    return <div className="empty">Nothing on this tab yet.</div>;
  }

  if (tab.is_custom) {
    // Custom shapes ride on tab.custom_shape rather than the registry.
    if (tab.custom_shape === 'rows_cols') {
      return <StructuredTable columns={tab.columns_def} entries={visibleEntries} />;
    }
    // free_text — narrative cards, just body text + visible_from.
    return <NarrativeCards entries={visibleEntries} extraFields={[]} omitTime />;
  }

  // Built-in tab — pull shape from the registry.
  const builtIn = getTabType(tab.tab_key);
  if (!builtIn) {
    // Curator wrote an unknown tab_key (shouldn't happen — server
    // validation rejects it). Render as a free-text fallback so the
    // student isn't blocked on bad metadata.
    return <NarrativeCards entries={visibleEntries} extraFields={[]} omitTime />;
  }

  if (builtIn.shape === 'structured') {
    return (
      <StructuredTable
        columns={(builtIn.columns ?? []) as readonly BuiltInColumn[]}
        entries={visibleEntries}
      />
    );
  }

  // Built-in narrative — uses extra_fields + omit_time conventions.
  return (
    <NarrativeCards
      entries={visibleEntries}
      extraFields={builtIn.extra_fields ?? []}
      omitTime={builtIn.omit_time ?? false}
    />
  );
}


// ─── Structured table — built-in or custom_grid ──────────────────────
interface StructuredTableProps {
  columns: readonly BuiltInColumn[] | TabColumn[];
  entries: ChartEntry[];
}

function StructuredTable({ columns, entries }: StructuredTableProps) {
  if (columns.length === 0) {
    return <div className="empty">This chart has no columns defined.</div>;
  }
  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.id}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i}>
            {columns.map((col) => {
              const v = e[col.id];
              return <td key={col.id}>{v == null || v === '' ? '—' : String(v)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// ─── Narrative cards — built-in narrative or custom_narrative ────────
interface NarrativeCardsProps {
  entries:     ChartEntry[];
  extraFields: readonly BuiltInExtraField[];
  omitTime:    boolean;
}

function NarrativeCards({ entries, extraFields, omitTime }: NarrativeCardsProps) {
  return (
    <>
      {entries.map((e, i) => {
        const time = !omitTime ? (e.time ?? '') : '';
        const extras = extraFields
          .map((f) => ({ label: f.label, value: e[f.id] }))
          .filter((x) => x.value != null && x.value !== '');

        const hasMeta = (time !== '' && time != null) || extras.length > 0;
        const body = String(e.body ?? '');

        return (
          <div key={i} className="rn-case-entry">
            {hasMeta && (
              <div className="meta">
                {time !== '' && time != null && (
                  <span className="chip">{String(time)}</span>
                )}
                {extras.map((x) => (
                  <span key={x.label} className="chip">{x.label}: {String(x.value)}</span>
                ))}
              </div>
            )}
            {body && <div className="body">{body}</div>}
          </div>
        );
      })}
    </>
  );
}
