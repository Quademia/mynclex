// mynclex/lib/bank/wrappers/trend/tab-rail.tsx
//
// Trend's copy of the chart-tab rail (mirror of the case-study
// tab-rail). Adapted case_id → trend_id + trend's tab actions/types.
// Reuses the shared cs-* chart CSS (styling only) and the shared
// lib/authoring seeders. Wrappers stay independent; only the low-level
// rich editors are shared.
//
//   - Lists the dataset's tabs with a Custom badge, entry count, and
//     up/down reorder arrows.
//   - Footer button opens the AddTabPopover for adding a new tab
//     (the 6 built-ins + a custom Free text / Custom table flow).

'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { BUILT_IN_TABS, type BuiltInTabType } from './tab-types';
import { reorderTabsAction, upsertTabAction } from './actions';
import type { TrendTabRow, Surface } from './types';
import { emptyTab } from '@/lib/authoring/table/merge-table-model';
import { emptyNarrativeTab } from '@/lib/authoring/narrative/narrative-model';
import { structuredToMergeTab } from '@/lib/authoring/migrate-v1-tabs';

// A built-in seeds its v2 blob so clicking it drops the rich editor
// pre-shaped:
//   - structured built-ins → merge table, column titles as the heading row;
//   - narrative built-ins   → a blank v2 narrative tab.
function seedEntriesForBuiltIn(t: BuiltInTabType): string {
  if (t.shape === 'structured') {
    return JSON.stringify(structuredToMergeTab(t.columns ?? [], []));
  }
  return JSON.stringify(emptyNarrativeTab());
}

// New custom tabs come in two shapes: a free-text narrative or the
// custom merge table.
type NewTabShape = 'free_text' | 'merge_table';

interface RailProps {
  surface:     Surface;
  trend_id:    string;
  tabs:        TrendTabRow[];
  activeTabId: string | null;
  onSelect:    (tab_id: string) => void;
  dirtyIds?:   Set<string>;
}

export function TrendTabRail({
  surface, trend_id, tabs, activeTabId, onSelect, dirtyIds,
}: RailProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submitReorder(a: TrendTabRow, b: TrendTabRow) {
    const orders = [
      { tab_id: a.tab_id, display_order: b.display_order },
      { tab_id: b.tab_id, display_order: a.display_order },
    ];
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('trend_id', trend_id);
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
              <div className="cs-tab-item-text">
                <span className="cs-tab-item-label" title={t.title}>
                  {t.title}
                  {isDirty && <span className="cs-tab-item-dirty" aria-label="unsaved"> •</span>}
                </span>
                {t.is_custom && (
                  <span className="cs-tab-item-custom-badge">Custom</span>
                )}
              </div>
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
            trend_id={trend_id}
            alreadyAddedKeys={alreadyAddedKeys}
            // max(existing display_order) + 1 — NOT tabs.length, which
            // collides with UNIQUE(trend_id, display_order) after a delete.
            nextDisplayOrder={tabs.reduce((m, t) => Math.max(m, t.display_order), -1) + 1}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    </nav>
  );
}

interface PopoverProps {
  surface:          Surface;
  trend_id:         string;
  alreadyAddedKeys: Set<string>;
  nextDisplayOrder: number;
  onClose:          () => void;
}

function AddTabPopover({
  surface, trend_id, alreadyAddedKeys, nextDisplayOrder, onClose,
}: PopoverProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [shape, setShape] = useState<NewTabShape>('free_text');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (customMode) {
        setCustomMode(false);
        setErr(null);
      } else {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [customMode, onClose]);

  useEffect(() => {
    if (customMode) {
      nameInputRef.current?.focus();
    }
  }, [customMode]);

  function addBuiltIn(t: BuiltInTabType) {
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('trend_id', trend_id);
    fd.set('tab_key', t.tab_key);
    fd.set('title', t.default_title);
    fd.set('display_order', String(nextDisplayOrder));
    fd.set('is_custom', 'false');
    fd.set('entries', seedEntriesForBuiltIn(t));
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
    let tab_key = 'custom_narrative';
    let custom_shape = 'free_text';
    let entries = JSON.stringify(emptyNarrativeTab());
    const columns_def = '[]';
    if (shape === 'merge_table') {
      tab_key = 'custom_grid';
      custom_shape = 'rows_cols';
      entries = JSON.stringify(emptyTab());
    }

    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('trend_id', trend_id);
    fd.set('tab_key', tab_key);
    fd.set('title', name);
    fd.set('display_order', String(nextDisplayOrder));
    fd.set('is_custom', 'true');
    fd.set('custom_shape', custom_shape);
    fd.set('entries', entries);
    fd.set('columns_def', columns_def);
    startTransition(async () => {
      const res = await upsertTabAction(fd);
      if (!res.ok) setErr(res.error);
      else onClose();
    });
  }

  const nameTrimmed = customName.trim();
  const canSubmit = nameTrimmed.length > 0 && !pending;

  const body = customMode ? (
    <>
      <div className="cs-popover-custom">
        <input
          ref={nameInputRef}
          type="text"
          value={customName}
          placeholder="Tab name, e.g. Imaging"
          onChange={(e) => {
            setCustomName(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              e.preventDefault();
              addCustom();
            }
          }}
        />
      </div>
      <div className="cs-shape-choice" style={{ marginTop: 10 }}>
        <label className={shape === 'free_text' ? 'active' : ''}>
          <input
            type="radio"
            name="tr-custom-shape"
            checked={shape === 'free_text'}
            onChange={() => setShape('free_text')}
          />
          <span>
            <div className="cs-shape-choice-title">Free text</div>
            <div className="cs-shape-choice-desc">
              Stacked cards with labels and a rich body. Same as Nurses&rsquo; Notes.
            </div>
          </span>
        </label>
        <label className={shape === 'merge_table' ? 'active' : ''}>
          <input
            type="radio"
            name="tr-custom-shape"
            checked={shape === 'merge_table'}
            onChange={() => setShape('merge_table')}
          />
          <span>
            <div className="cs-shape-choice-title">Custom table</div>
            <div className="cs-shape-choice-desc">
              A flexible table — merge cells, mark headings. For irregular
              charts and time-across-columns data.
            </div>
          </span>
        </label>
      </div>
      {err && <div className="cs-error">{err}</div>}
      <div className="cs-popover-footer">
        <button
          type="button"
          className="cs-btn"
          onClick={() => {
            setCustomMode(false);
            setErr(null);
          }}
          disabled={pending}
        >
          ← Back
        </button>
        <button
          type="button"
          className="cs-btn primary"
          onClick={addCustom}
          disabled={!canSubmit}
        >
          {pending ? 'Adding…' : 'Add tab'}
        </button>
      </div>
    </>
  ) : (
    <>
      <div className="cs-popover-list">
        {BUILT_IN_TABS.map((t) => {
          const used = alreadyAddedKeys.has(t.tab_key);
          return (
            <div
              key={t.tab_key}
              className={used ? 'cs-popover-item used' : 'cs-popover-item'}
              onClick={() => {
                if (used || pending) return;
                addBuiltIn(t);
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
      <button
        type="button"
        className="cs-tab-add-custom-btn"
        onClick={() => {
          setErr(null);
          setCustomMode(true);
        }}
        disabled={pending}
      >
        + Create custom tab
      </button>
      {err && <div className="cs-error">{err}</div>}
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="auth-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={customMode ? 'New custom tab' : 'Add a chart tab'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cs-tab-add-modal">
        <header className="cs-tab-add-modal-head">
          <h4>{customMode ? 'New custom tab' : 'Add a chart tab'}</h4>
          <button
            type="button"
            className="cs-tab-add-modal-close"
            aria-label="Close"
            onClick={onClose}
            disabled={pending}
          >
            ✕
          </button>
        </header>
        <div className="cs-tab-add-modal-body">{body}</div>
      </div>
    </div>,
    document.body,
  );
}
