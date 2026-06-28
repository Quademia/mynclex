// mynclex/lib/bank/wrappers/case-study/chart-tabs/tab-rail.tsx
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
//

'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { BUILT_IN_TABS, type BuiltInTabType } from './tab-types';
import { reorderTabsAction, upsertTabAction } from '../actions';
import type { CaseStudyTabRow, Surface } from '../types';
import { CUSTOM_GRID_MIN_COLUMNS } from '../types';
import { emptyTab } from '@/lib/authoring/table/merge-table-model';
import { emptyNarrativeTab } from '@/lib/authoring/narrative/narrative-model';
import { structuredToMergeTab } from '@/lib/authoring/migrate-v1-tabs';

// Slice 5 — built-ins are upgraded to the v2 editors one template at a time.
// A handled built-in seeds its v2 blob (so clicking it in the picker drops the
// new rich editor, pre-shaped); the rest keep the v1 empty array until their
// own sub-slice. Same shape the migration converter produces for empty tabs.
//   - structured built-ins (Vital Signs 5.1, Lab Results 5.2) → merge table,
//     column titles seeded as the heading row;
//   - narrative built-ins (Nurses' Notes 5.3; Orders/H&P/Diagnostics 5.4–5.6)
//     → a v2 narrative tab; the rest stay v1 until their sub-slice.
function seedEntriesForBuiltIn(t: BuiltInTabType): string {
  if (t.shape === 'structured') {
    return JSON.stringify(structuredToMergeTab(t.columns ?? [], []));
  }
  if (t.tab_key === 'nurses_notes' || t.tab_key === 'orders' || t.tab_key === 'history') {
    return JSON.stringify(emptyNarrativeTab());
  }
  return '[]';
}

// New custom tabs come in three shapes during the transition: a free-text
// narrative, the legacy rows-and-columns grid, or the new custom merge
// table (rich-content relook). The legacy grid stays available until the
// merge table fully replaces it (Slice 6).
type NewTabShape = 'free_text' | 'rows_cols' | 'merge_table';

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
              <div className="cs-tab-item-text">
                <span className="cs-tab-item-label" title={t.title}>
                  {t.title}
                  {isDirty && <span className="cs-tab-item-dirty" aria-label="unsaved"> •</span>}
                </span>
                {t.is_custom && (
                  <span className="cs-tab-item-custom-badge">Custom</span>
                )}
              </div>
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
            // max(existing display_order) + 1 — NOT tabs.length, which
            // collides with the UNIQUE(case_id, display_order) constraint
            // whenever the existing orders are 1-based or have a gap from
            // a deleted tab (which every case does).
            nextDisplayOrder={tabs.reduce((m, t) => Math.max(m, t.display_order), -1) + 1}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// AddTabPopover — the dropdown triggered by the footer button.
// Two flows, separated cleanly so the first screen is a pure
// pick-an-option list (no inline form):
//   - Built-in: click one of the 6 built-ins (duplicates disabled).
//     Submits upsertTabAction with tab_key / default_title / is_custom=false.
//   - Custom:   click "+ Create custom tab" → step into a single
//     name + shape form. Submits upsertTabAction with
//     tab_key = custom_narrative | custom_grid + the curator's name.
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
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [shape, setShape] = useState<NewTabShape>('free_text');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Esc closes the popover. If the curator is in the custom-form
  // sub-step, Esc steps back to the pick-an-option step first;
  // second Esc closes.
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

  // Autofocus the name input when entering custom mode so the curator
  // can start typing immediately without an extra click.
  useEffect(() => {
    if (customMode) {
      nameInputRef.current?.focus();
    }
  }, [customMode]);

  function addBuiltIn(t: BuiltInTabType) {
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('case_id', case_id);
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
    // Three shapes — all keep custom_shape within the DB CHECK
    // (free_text / rows_cols), so no migration:
    //   free_text   → custom_narrative carrying a blank v2 narrative.
    //   rows_cols   → custom_grid v1, pre-seeded with blank columns.
    //   merge_table → custom_grid carrying a blank v2 merge table in entries.
    let tab_key = 'custom_narrative';
    let custom_shape = 'free_text';
    let entries = JSON.stringify(emptyNarrativeTab());
    let columns_def = '[]';
    if (shape === 'rows_cols') {
      tab_key = 'custom_grid';
      custom_shape = 'rows_cols';
      entries = '[]';
      columns_def = JSON.stringify(
        Array.from({ length: CUSTOM_GRID_MIN_COLUMNS }, (_, i) => ({
          id: `c${i + 1}`,
          label: `Column ${i + 1}`,
        })),
      );
    } else if (shape === 'merge_table') {
      tab_key = 'custom_grid';
      custom_shape = 'rows_cols';
      entries = JSON.stringify(emptyTab());
    }

    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('case_id', case_id);
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

  // ── Body content per step ───────────────────────────────────
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
        <label className={shape === 'merge_table' ? 'active' : ''}>
          <input
            type="radio"
            name="cs-custom-shape"
            checked={shape === 'merge_table'}
            onChange={() => setShape('merge_table')}
          />
          <span>
            <div className="cs-shape-choice-title">Custom table</div>
            <div className="cs-shape-choice-desc">
              A flexible table — merge cells, mark headings, set when each row
              appears. For irregular charts like a Phase Sheet.
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

  // Centred modal, portaled to <body> so the pane's overflow can't clip it
  // (the anchored popover got cropped inside the narrow rail).
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
