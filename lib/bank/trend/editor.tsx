// mynclex/lib/bank/trend/editor.tsx
//
// Top-level Trend dataset editor component — mounted from both
// /admin/trends/[trend_id] and /tutor/trends/[trend_id]. Takes
// `surface` + `initial` (the dataset row).
//
// Layout on desktop (≥ 900px):
//
//   ┌──────────── sticky topbar ────────────┐
//   │ ← back   trend_id   ● Unsaved   buttons │
//   ├─────────── split-frame (grid) ────────┤
//   │ split-left          │D│ split-right   │
//   │  • metadata accordions│I│  • "Slice 1.12b"
//   │  • data table       │V│    placeholder
//   │                     │ │               │
//   └─────────────────────┴─┴───────────────┘
//
// Below 900px the split collapses to a single column (dataset above,
// right-pane placeholder below). Divider is a draggable splitter
// that persists its position in localStorage. Pattern is lifted from
// case-study/editor.tsx and simplified — no tab rail, no active
// question state, no per-entry visible_from filtering.

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { deleteTrendAction, updateTrendAction } from './actions';
import { MetadataAccordions } from './metadata-accordions';
import { TrendDataTable } from './data-table';
import type { Surface, TrendEditorInitial, TrendRow } from './types';

const SPLIT_STORAGE_KEY = 'mynclex:tr-split:left-pct';
const SPLIT_MIN = 25;
const SPLIT_MAX = 80;
const SPLIT_DEFAULT = 50;

interface Props {
  surface: Surface;
  initial: TrendEditorInitial;
}

export function TrendEditor({ surface, initial }: Props) {
  const datasetRow = initial.datasetRow;
  const baseUrl = surface === 'tutor' ? '/tutor/trends' : '/admin/trends';

  // ── Controlled state (data table) ────────────────────────────────
  // timepoints + rows live in state because the data-table mutates
  // them constantly. Everything else (title, scenario, kind checkbox,
  // is_published) stays uncontrolled — we read them from the form at
  // submit time.
  const [timepoints, setTimepoints] = useState<string[]>(datasetRow.timepoints);
  const [rows, setRows] = useState<TrendRow[]>(datasetRow.rows);

  // ── Dirty tracking ──────────────────────────────────────────────
  // A coarse flag — any change to the data table, any onChange in
  // the outer form, flips this. Save resets it via redirect; Cancel
  // leans on the beforeunload guard.
  const [dirty, setDirty] = useState(false);

  function onDataChange(next: { timepoints: string[]; rows: TrendRow[] }) {
    setTimepoints(next.timepoints);
    setRows(next.rows);
    setDirty(true);
  }

  // ── Error + pending state ───────────────────────────────────────
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSave(fd: FormData) {
    setPending(true);
    setErr(null);
    fd.set('timepoints', JSON.stringify(timepoints));
    fd.set('rows',       JSON.stringify(rows));
    try {
      const res = await updateTrendAction(fd);
      if (res && !res.ok) {
        setErr(res.error);
        setPending(false);
      } else {
        setDirty(false);
      }
    } catch (e) {
      // Next's redirect throws a special value to unwind the action —
      // not a real error. Let it propagate so the navigation happens.
      throw e;
    }
  }

  async function onDelete(fd: FormData) {
    const ok = window.confirm(
      `Delete "${datasetRow.title}"? This can't be undone.`,
    );
    if (!ok) return;
    setPending(true);
    setErr(null);
    try {
      const res = await deleteTrendAction(fd);
      if (res && !res.ok) {
        setErr(res.error);
        setPending(false);
      }
    } catch (e) {
      throw e;
    }
  }

  // ── Beforeunload guard ──────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // ── Split-pane divider ──────────────────────────────────────────
  const [leftPct, setLeftPct] = useState<number>(SPLIT_DEFAULT);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (stored) {
        const n = parseFloat(stored);
        if (Number.isFinite(n) && n >= SPLIT_MIN && n <= SPLIT_MAX) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setLeftPct(n);
        }
      }
    } catch { /* localStorage can throw in privacy mode — ignore */ }
  }, []);

  function onDividerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startPct = leftPct;
    const width = rect.width;
    let lastPct = startPct;

    const onMove = (ev: PointerEvent) => {
      const pct = startPct + ((ev.clientX - startX) / width) * 100;
      lastPct = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
      setLeftPct(lastPct);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
      try {
        localStorage.setItem(SPLIT_STORAGE_KEY, String(lastPct));
      } catch { /* ignore */ }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="tr-editor-frame">
      <div className="tr-topbar">
        <div className="tr-topbar-left">
          <Link href={baseUrl} className="tr-topbar-back">← All trend datasets</Link>
          <span className="tr-topbar-id">{datasetRow.trend_id}</span>
          {dirty && (
            <span className="tr-topbar-dirty" aria-live="polite">● Unsaved changes</span>
          )}
          {datasetRow.is_published && !dirty && (
            <span className="tr-topbar-published">Published</span>
          )}
        </div>
        <div className="tr-topbar-right">
          <form action={onDelete} style={{ display: 'inline' }}>
            <input type="hidden" name="surface" value={surface} />
            <input type="hidden" name="trend_id" value={datasetRow.trend_id} />
            <button
              type="submit"
              className="tr-btn danger"
              disabled={pending}
            >
              Delete
            </button>
          </form>
          <Link href={baseUrl} className="tr-btn">Cancel</Link>
          <button
            type="submit"
            form="tr-dataset-form"
            className="tr-btn primary"
            disabled={pending}
          >
            {pending ? 'Saving…' : 'Save dataset'}
          </button>
        </div>
      </div>

      {err && (
        <div className="tr-error tr-topbar-error">{err}</div>
      )}

      <div
        ref={splitRef}
        className="tr-split"
        style={{ ['--tr-split-left' as string]: `${leftPct}%` }}
      >
        <div className="tr-split-left">
          <form
            id="tr-dataset-form"
            action={onSave}
            onChange={() => setDirty(true)}
          >
            <input type="hidden" name="surface"  value={surface} />
            <input type="hidden" name="trend_id" value={datasetRow.trend_id} />

            <MetadataAccordions datasetRow={datasetRow} />
          </form>

          {/* Data table sits outside the form — it manages its own
              controlled state + mirrors into hidden form fields we
              set at submit time in onSave(). Keeping it outside the
              form avoids an implicit submit on every cell keystroke
              (browser would otherwise post the form on Enter). */}
          <TrendDataTable
            timepoints={timepoints}
            rows={rows}
            onChange={onDataChange}
          />
        </div>

        <div
          className="tr-split-divider"
          onPointerDown={onDividerDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize dataset and questions panes"
          title="Drag to resize"
        />

        <div className="tr-split-right">
          <div className="tr-right-placeholder">
            <h4>Questions — Slice 1.12b</h4>
            <p>
              Attached questions land here once Slice 1.12b ships. For
              now this pane is reserved so the split layout is stable
              when 1.12b activates it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
