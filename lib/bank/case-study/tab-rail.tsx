// mynclex/lib/bank/case-study/tab-rail.tsx
//
// Left rail for the case-study editor's chart section:
//   - Lists the case's tabs with a Custom badge, entry count, and
//     up/down reorder arrows on each row.
//   - Highlights the active tab with a teal border-left accent.
//   - Footer button opens the AddTabPopover for adding a new tab.
//
// Reorder clicks swap two adjacent tabs' display_order values by
// posting the two-element order array to reorderTabsAction.
//
// Add clicks open AddTabPopover, which offers the six built-ins with
// "Already added" disabled for duplicates, plus a custom flow that
// steps into a Free text / Rows & columns shape picker before firing
// upsertTabAction to insert the row.

'use client';

import { useState, useTransition } from 'react';
import { BUILT_IN_TABS, customKeyForShape, type CustomShape } from './tab-types';
import { reorderTabsAction, upsertTabAction } from './actions';
import type { CaseStudyTabRow, Surface } from './types';
import { CUSTOM_GRID_MIN_COLUMNS } from './types';

interface RailProps {
  surface:       Surface;
  case_id:       string;
  tabs:          CaseStudyTabRow[];
  activeTabId:   string | null;
  onSelect:      (tab_id: string) => void;
  dirtyIds?:     Set<string>;
}

export function TabRail({
  surface, case_id, tabs, activeTabId, onSelect, dirtyIds,
}: RailProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submitReorder(a: CaseStudyTabRow, b: CaseStudyTabRow) {
    const orders = [
      { tab_id: a.tab_id, display_order: b.display_order },
      { tab_id: b.tab_id, display_order: a.display_order },
    ];
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('case_id', case_id);
    fd.set('tab_orders', JSON.stringify(orders));
    startTransition(async () => {
      const res = await reorderTabsAction(fd);
      if (!res.ok) setErr(res.error);
      else setErr(null);
    });
  }

  function moveUp(i: number) {
    if (i <= 0) return;
    submitReorder(tabs[i], tabs[i - 1]);
  }

  function moveDown(i: number) {
    if (i >= tabs.length - 1) return;
    submitReorder(tabs[i], tabs[i + 1]);
  }

  const alreadyAddedKeys = new Set(tabs.map((t) => t.tab_key));

  return (
    <nav className="cs-tab-rail" aria-label="Chart tabs">
      <div className="cs-tab-rail-head">Chart tabs</div>
      {err && <div className="cs-error cs-tab-rail-error">{err}</div>}
      {tabs.length === 0 ? (
        <div className="cs-tab-rail-empty">
          No tabs yet.<br/>Add the first to start building the chart.
        </div>
      ) : (
        tabs.map((t, i) => {
          const isActive = t.tab_id === activeTabId;
          const entryCount = Array.isArray(t.entries) ? t.entries.length : 0;
          const isDirty = dirtyIds?.has(t.tab_id);
          return (
            <div
              key={t.tab_id}
              className={isActive ? 'cs-tab-item active' : 'cs-tab-item'}
              onClick={() => onSelect(t.tab_id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(t.tab_id);
                }
              }}
            >
              <span className="cs-tab-reorder" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  disabled={i === 0 || pending}
                  aria-label="Move tab up"
                >▴</button>
                <button
                  type="button"
                  onClick={() => moveDown(i)}
                  disabled={i === tabs.length - 1 || pending}
                  aria-label="Move tab down"
                >▾</button>
              </span>
              <span className="cs-tab-item-label" title={t.title}>
                {t.title}
                {isDirty && <span className="cs-tab-item-dirty" aria-label="unsaved"> •</span>}
              </span>
              {t.is_custom && (
                <span className="cs-tab-item-custom-badge">Custom</span>
              )}
              <span className="cs-tab-item-count" aria-label="entry count">
                {entryCount}
              </span>
            </div>
          );
        })
      )}

      <div className="cs-tab-rail-footer">
        <button
          type="button"
          className="cs-tab-add-btn"
          onClick={() => setAddOpen((v) => !v)}
          aria-expanded={addOpen}
        >
          + Add chart tab
        </button>
        {addOpen && (
          <AddTabPopover
            surface={surface}
            case_id={case_id}
            alreadyAddedKeys={alreadyAddedKeys}
            nextDisplayOrder={tabs.length}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// AddTabPopover — the dropdown triggered by the footer button.
// Two flows:
//   - Built-in: pick from the 6 built-ins (duplicates disabled).
//     Submits upsertTabAction with tab_key / default_title / is_custom=false.
//   - Custom:   type a name, then pick Free text / Rows & columns.
//     Submits upsertTabAction with tab_key = custom_narrative or custom_grid.
// ─────────────────────────────────────────────────────────────

interface PopoverProps {
  surface:          Surface;
  case_id:          string;
  alreadyAddedKeys: Set<string>;
  nextDisplayOrder: number;
  onClose:          () => void;
}

function AddTabPopover({
  surface, case_id, alreadyAddedKeys, nextDisplayOrder, onClose,
}: PopoverProps) {
  const [customName, setCustomName] = useState('');
  const [pickingShape, setPickingShape] = useState(false);
  const [shape, setShape] = useState<CustomShape>('free_text');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addBuiltIn(tab_key: string, default_title: string) {
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('case_id', case_id);
    fd.set('tab_key', tab_key);
    fd.set('title', default_title);
    fd.set('display_order', String(nextDisplayOrder));
    fd.set('is_custom', 'false');
    fd.set('entries', '[]');
    fd.set('columns_def', '[]');
    startTransition(async () => {
      const res = await upsertTabAction(fd);
      if (!res.ok) setErr(res.error);
      else onClose();
    });
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) {
      setErr('Tab name is required.');
      return;
    }
    const tab_key = customKeyForShape(shape);
    // custom_grid needs at least CUSTOM_GRID_MIN_COLUMNS columns to be
    // usable. Pre-seed with two blank columns so curators can start
    // renaming immediately rather than hitting "no rows" until they
    // add columns manually.
    const columns_def =
      shape === 'rows_cols'
        ? Array.from({ length: CUSTOM_GRID_MIN_COLUMNS }, (_, i) => ({
            id: `c${i + 1}`,
            label: `Column ${i + 1}`,
          }))
        : [];

    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('case_id', case_id);
    fd.set('tab_key', tab_key);
    fd.set('title', name);
    fd.set('display_order', String(nextDisplayOrder));
    fd.set('is_custom', 'true');
    fd.set('custom_shape', shape);
    fd.set('entries', '[]');
    fd.set('columns_def', JSON.stringify(columns_def));
    startTransition(async () => {
      const res = await upsertTabAction(fd);
      if (!res.ok) setErr(res.error);
      else onClose();
    });
  }

  if (pickingShape) {
    return (
      <div className="cs-popover" role="dialog" aria-label="Choose custom tab shape">
        <h4>Shape for &ldquo;{customName}&rdquo;</h4>
        <div className="cs-shape-choice">
          <label className={shape === 'free_text' ? 'active' : ''}>
            <input
              type="radio"
              name="cs-custom-shape"
              checked={shape === 'free_text'}
              onChange={() => setShape('free_text')}
            />
            <span>
              <div className="cs-shape-choice-title">Free text</div>
              <div className="cs-shape-choice-desc">
                Stacked cards with Time, a body, and visible-from. Same as Nurses&rsquo; Notes.
              </div>
            </span>
          </label>
          <label className={shape === 'rows_cols' ? 'active' : ''}>
            <input
              type="radio"
              name="cs-custom-shape"
              checked={shape === 'rows_cols'}
              onChange={() => setShape('rows_cols')}
            />
            <span>
              <div className="cs-shape-choice-title">Rows &amp; columns</div>
              <div className="cs-shape-choice-desc">
                Curator-defined columns plus a locked Visible-from. Like Vitals or Labs.
              </div>
            </span>
          </label>
        </div>
        {err && <div className="cs-error">{err}</div>}
        <div className="cs-popover-footer">
          <button
            type="button"
            className="cs-btn"
            onClick={() => setPickingShape(false)}
            disabled={pending}
          >
            ← Back
          </button>
          <button
            type="button"
            className="cs-btn primary"
            onClick={addCustom}
            disabled={pending}
          >
            {pending ? 'Adding…' : 'Add tab'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cs-popover" role="dialog" aria-label="Add chart tab">
      <h4>Add a chart tab</h4>
      <div className="cs-popover-list">
        {BUILT_IN_TABS.map((t) => {
          const used = alreadyAddedKeys.has(t.tab_key);
          return (
            <div
              key={t.tab_key}
              className={used ? 'cs-popover-item used' : 'cs-popover-item'}
              onClick={() => {
                if (used || pending) return;
                addBuiltIn(t.tab_key, t.default_title);
              }}
              role="button"
              aria-disabled={used}
            >
              <span>{t.default_title}</span>
              {used && <small>Already added</small>}
            </div>
          );
        })}
      </div>
      <hr className="cs-popover-divider" />
      <h4>Or a custom tab</h4>
      <div className="cs-popover-custom">
        <input
          type="text"
          value={customName}
          placeholder="Tab name, e.g. Imaging"
          onChange={(e) => setCustomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customName.trim()) {
              setErr(null);
              setPickingShape(true);
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (!customName.trim()) {
              setErr('Tab name is required.');
              return;
            }
            setErr(null);
            setPickingShape(true);
          }}
          disabled={pending}
        >
          Next →
        </button>
      </div>
      {err && <div className="cs-error">{err}</div>}
    </div>
  );
}
