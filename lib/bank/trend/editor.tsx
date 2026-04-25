// mynclex/lib/bank/trend/editor.tsx
//
// Top-level Trend dataset editor component — mounted from both
// /admin/trends/[trend_id] and /tutor/trends/[trend_id]. Takes
// `surface` + `initial` (dataset row + attached bank items).
//
// Layout on desktop (≥ 900px):
//
//   ┌──────────── sticky topbar ────────────┐
//   │ ← back   trend_id   ● Unsaved   buttons │
//   ├─────────── split-frame (grid) ────────┤
//   │ split-left          │D│ split-right   │
//   │  • metadata acc.   │I│  • pill strip │
//   │  • data table       │V│  • active q.  │
//   │                     │ │    panel      │
//   └─────────────────────┴─┴───────────────┘
//
// Slice 1.12b additions:
//   • Right pane hosts variable-count attached questions.
//   • Pill strip + `+ Add question` mounts `QuestionAuthoringPanel`
//     in `standalone` mode per active pill.
//   • State snapshotting on pill switch (mirrors the case-study 1.11b
//     pattern via `parseSlotFormData`).
//   • Save serialises dataset + non-deleted child drafts + pending
//     deletions into one payload; the server action validates and
//     calls `nclex_save_trend_with_children` RPC for an atomic write.

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { parseSlotFormData } from '@/app/(app)/admin/bank/slot-parser';
import { QuestionAuthoringPanel } from '@/lib/bank/question-authoring-panel';
import type { FullBankRow } from '@/lib/bank/list-view';
import {
  deleteTrendAction,
  detachAndDeleteTrendAction,
  deleteTrendAndChildrenAction,
  updateTrendAction,
} from './actions';
import { MetadataAccordions } from './metadata-accordions';
import { TrendDataTable } from './data-table';
import { QuestionNav } from './question-nav';
import { ValidationPanel } from './validation-panel';
import { DeleteDialog } from './delete-dialog';
import {
  emptyChildDraft,
  loadChildDraft,
  type TrendChildDraft,
} from './child-draft';
import {
  validateTrend,
  type TrendEditorState,
  type ValidationIssue,
} from './validation';
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
  const baseUrl = surface === 'tutor' ? '/tutor/bank/trends' : '/admin/trends';

  // ── Controlled state (data table) ────────────────────────────────
  const [timepoints, setTimepoints] = useState<string[]>(datasetRow.timepoints);
  const [rows, setRows] = useState<TrendRow[]>(datasetRow.rows);

  // ── Child-question drafts (Slice 1.12b) ──────────────────────────
  // One entry per non-removed attached question. Seeded from
  // initial.attachedItems via loadChildDraft. Curator additions push
  // an emptyChildDraft; deletions flip toDelete (preserved in state
  // until Save so curator can undo via Cancel).
  const [childDrafts, setChildDrafts] = useState<TrendChildDraft[]>(() =>
    initial.attachedItems.map(loadChildDraft),
  );
  // Active pill index — `null` when no pill is focused (empty state
  // or after deleting the last remaining pill).
  const [activeIndex, setActiveIndex] = useState<number | null>(
    initial.attachedItems.length > 0 ? 0 : null,
  );

  // Ref to the active question's form. On pill-switch (and on Save)
  // `new FormData(slotFormRef.current)` snapshots the DOM so in-flight
  // edits survive remounts. Mirrors the 1.11b snapshot pattern.
  const slotFormRef = useRef<HTMLFormElement | null>(null);

  // ── Dirty tracking ──────────────────────────────────────────────
  const [dirty, setDirty] = useState(false);

  function onDataChange(next: { timepoints: string[]; rows: TrendRow[] }) {
    setTimepoints(next.timepoints);
    setRows(next.rows);
    setDirty(true);
  }

  // Snapshot the currently-active question's DOM into
  // childDrafts[activeIndex]. Used before pill-switch and before
  // Save. Returns the (possibly-updated) drafts array. Callers pass
  // this array into their follow-up setState to avoid stale reads.
  function snapshotActiveDraft(drafts: TrendChildDraft[]): TrendChildDraft[] {
    if (activeIndex === null) return drafts;
    const current = drafts[activeIndex];
    if (!current || current.toDelete) return drafts;
    const form = slotFormRef.current;
    if (!form) return drafts;
    const fd = new FormData(form);
    const snapshot = parseSlotFormData(fd, '', current.initial);
    const next = drafts.slice();
    next[activeIndex] = { ...current, initial: snapshot, isDirty: true };
    return next;
  }

  function onSelectPill(idx: number) {
    setChildDrafts((prev) => {
      const snapped = snapshotActiveDraft(prev);
      return snapped;
    });
    setActiveIndex(idx);
    setDirty(true);
  }

  function onAddQuestion() {
    setChildDrafts((prev) => {
      const snapped = snapshotActiveDraft(prev);
      return [...snapped, emptyChildDraft()];
    });
    // Focus the newly-added pill. It sits at the array tail after
    // the setChildDrafts push above, so its new index is the
    // current childDrafts.length (pre-update). We don't need the
    // previous activeIndex here — just point at the appended pill.
    setActiveIndex(childDrafts.length);
    setDirty(true);
  }

  function onDeleteActive() {
    if (activeIndex === null) return;
    const current = childDrafts[activeIndex];
    if (!current) return;
    const ok = window.confirm(
      current.item_id
        ? `Delete Q${activeIndex + 1}? Removal is applied when you save. Cancel to undo.`
        : `Discard Q${activeIndex + 1}? It hasn't been saved yet.`,
    );
    if (!ok) return;

    setChildDrafts((prev) => {
      // Snapshot other fields first in case the curator typed something
      // into the active form before clicking delete. Unusual but cheap.
      const snapped = snapshotActiveDraft(prev);
      const current2 = snapped[activeIndex];
      if (!current2) return snapped;
      if (current2.item_id === null) {
        // Never persisted — just remove outright.
        const next = snapped.slice();
        next.splice(activeIndex, 1);
        return next;
      }
      // Persisted — mark for deletion, keep in array for the pill.
      const next = snapped.slice();
      next[activeIndex] = { ...current2, toDelete: true };
      return next;
    });

    // Pick the next non-deleted index to focus, or null if none.
    // Deferred via setState callback so the drafts array is already
    // updated when we compute.
    setActiveIndex((prev) => {
      // Rebuild using the array we just set — but React hasn't applied
      // our setChildDrafts yet inside this closure. Simplest: compute
      // against childDrafts + the delete intent.
      const after = childDrafts.slice();
      if (prev === null) return null;
      const wasPersisted = childDrafts[prev]?.item_id !== null;
      if (!wasPersisted) {
        // Row gets spliced out; next pill to focus is:
        //   same index (successor shifts left) if one exists,
        //   else previous index if any exist,
        //   else null.
        after.splice(prev, 1);
        if (after.length === 0) return null;
        if (prev < after.length) return prev;
        return after.length - 1;
      }
      // Persisted deletion: pill stays visible (is-todelete). Focus
      // the next non-todelete pill to keep the curator editing;
      // falls back to the deletion target if none exist.
      for (let i = prev + 1; i < after.length; i++) {
        if (!after[i]?.toDelete && i !== prev) return i;
      }
      for (let i = prev - 1; i >= 0; i--) {
        if (!after[i]?.toDelete) return i;
      }
      return prev;
    });
    setDirty(true);
  }

  // ── Error + pending state ───────────────────────────────────────
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSave(fd: FormData) {
    setPending(true);
    setErr(null);

    // Snapshot the active pill's DOM so its latest edits ride along.
    // Do this synchronously so the payload we build uses the newest
    // state even before React re-renders.
    const snappedDrafts = snapshotActiveDraft(childDrafts);
    if (snappedDrafts !== childDrafts) {
      setChildDrafts(snappedDrafts);
    }

    // Serialise: questions → the live drafts (non-deleted), and
    // deleted_item_ids → every draft flagged toDelete that had a
    // persisted item_id.
    const questionsPayload = snappedDrafts
      .filter((d) => !d.toDelete)
      .map((d) => d.initial);
    const deletedIds = snappedDrafts
      .filter((d) => d.toDelete && d.item_id !== null)
      .map((d) => d.item_id as string);

    fd.set('timepoints',        JSON.stringify(timepoints));
    fd.set('rows',              JSON.stringify(rows));
    fd.set('questions_json',    JSON.stringify(questionsPayload));
    fd.set('deleted_item_ids',  JSON.stringify(deletedIds));

    try {
      const res = await updateTrendAction(fd);
      if (res && !res.ok) {
        setErr(res.error);
        setPending(false);
      } else {
        setDirty(false);
      }
    } catch (e) {
      // Next's redirect throws to unwind; let it propagate.
      throw e;
    }
  }

  // ── Slice 1.12c — Delete dialog + Validation panel state ───────
  // Delete opens a modal that branches on attached-question count.
  // Validate toggles a floating panel anchored to the editor frame.
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [validationIssues, setValidationIssues] =
    useState<ValidationIssue[] | null>(null);

  // Helper: run one of the three delete server actions + handle the
  // response. Success redirects, so only the failure branch lands
  // back in this handler.
  async function runDeleteAction(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string } | void>,
  ) {
    setPending(true);
    setErr(null);
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('trend_id', datasetRow.trend_id);
    try {
      const res = await action(fd);
      if (res && 'ok' in res && !res.ok) {
        setErr(res.error ?? 'Delete failed.');
        setPending(false);
        setIsDeleteDialogOpen(false);
      }
    } catch (e) {
      // Next's redirect throws to unwind; let it propagate so the
      // navigation away from the editor happens.
      throw e;
    }
  }

  function onDeleteEmpty() {
    void runDeleteAction(deleteTrendAction);
  }
  function onDetachAndDelete() {
    void runDeleteAction(detachAndDeleteTrendAction);
  }
  function onDeleteEverything() {
    void runDeleteAction(deleteTrendAndChildrenAction);
  }

  // Validate toggle — re-clicking while the panel is open closes it
  // (mirrors 1.11c Case Study behaviour).
  function onValidateClick() {
    if (validationIssues !== null) {
      setValidationIssues(null);
      return;
    }
    setValidationIssues(validateTrend(buildValidatorState()));
  }

  // Build the snapshot the validator reads. The case-header form
  // (title, scenario, is_published) is uncontrolled, so we snapshot
  // its DOM at click time — mirrors 1.11c's `buildValidatorState`
  // pattern. The active child's form DOM is snapshotted the same
  // way, so in-flight edits show up in validation without requiring
  // a pill switch first.
  function buildValidatorState(): TrendEditorState {
    // Snapshot the case-header form.
    let title = datasetRow.title;
    let scenario = datasetRow.scenario ?? '';
    let is_published = datasetRow.is_published;
    const caseForm =
      typeof document !== 'undefined'
        ? (document.getElementById('tr-dataset-form') as HTMLFormElement | null)
        : null;
    if (caseForm) {
      const fd = new FormData(caseForm);
      title        = String(fd.get('title') ?? '');
      scenario     = String(fd.get('scenario') ?? '');
      is_published = fd.get('is_published') === 'on';
    }

    // Snapshot the active child draft.
    const snappedDrafts = snapshotActiveDraft(childDrafts);

    // Build children array — exclude pending-delete drafts (they
    // won't persist through Save) and unsaved-empty drafts (no
    // stem, default type = nothing to validate).
    const children = snappedDrafts
      .filter((d) => !d.toDelete)
      .map((d) => ({
        item_id: d.item_id,
        initial: d.initial,
      }));

    return {
      title,
      scenario,
      is_published,
      timepoints,
      rows,
      children,
    };
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

  // ── Active child helpers ────────────────────────────────────────
  const activeDraft = activeIndex !== null ? childDrafts[activeIndex] : null;
  // When the active pill is toDelete, render a short pane that
  // confirms the pending deletion instead of remounting the panel
  // (editing a deleted row is wasted effort).
  const activeIsDeletable =
    activeDraft !== null &&
    !activeDraft.toDelete &&
    childDrafts.filter((d) => !d.toDelete).length > 0;

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
          <button
            type="button"
            className="tr-btn danger"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={pending}
          >
            Delete
          </button>
          <Link href={baseUrl} className="tr-btn">Cancel</Link>
          <button
            type="button"
            className={
              validationIssues !== null
                ? 'tr-btn is-open'
                : 'tr-btn'
            }
            onClick={onValidateClick}
            aria-pressed={validationIssues !== null}
            aria-expanded={validationIssues !== null}
            aria-controls="tr-validate-panel"
          >
            Validate
          </button>
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

      {validationIssues !== null && (
        <ValidationPanel
          issues={validationIssues}
          isPublished={(() => {
            // Live form read so the summary reflects the unsaved
            // is_published state the curator just flipped.
            const f =
              typeof document !== 'undefined'
                ? (document.getElementById('tr-dataset-form') as HTMLFormElement | null)
                : null;
            if (!f) return datasetRow.is_published;
            return new FormData(f).get('is_published') === 'on';
          })()}
          onClose={() => setValidationIssues(null)}
        />
      )}

      {isDeleteDialogOpen && (
        <DeleteDialog
          trendId={datasetRow.trend_id}
          trendTitle={datasetRow.title}
          attachedItems={
            // Only PERSISTED items — unsaved drafts
            // (item_id === null) don't exist in the DB, so the
            // delete flow doesn't need to list them.
            initial.attachedItems.filter((row: FullBankRow) =>
              childDrafts.some(
                (d) => d.item_id === row.item_id && !d.toDelete,
              ),
            )
          }
          pending={pending}
          onClose={() => {
            if (pending) return;
            setIsDeleteDialogOpen(false);
          }}
          onDeleteEmpty={onDeleteEmpty}
          onDetachAndDelete={onDetachAndDelete}
          onDeleteEverything={onDeleteEverything}
        />
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

          {/* Data table sits outside the dataset form — controlled
              state that the onSave handler mirrors into hidden fields
              at submit time. Keeping it outside avoids an implicit
              submit on Enter in cell inputs. */}
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
          <QuestionNav
            drafts={childDrafts}
            activeIndex={activeIndex}
            onSelect={onSelectPill}
            onAdd={onAddQuestion}
          />

          {activeDraft === null ? (
            <div className="tr-q-pane-empty">
              <h4>No attached questions yet</h4>
              <p>
                Click <strong>+ Add question</strong> above to author the
                first question against this trend dataset. Attached
                questions use the standard bank editor and are reachable
                from the student quiz builder by default.
              </p>
            </div>
          ) : activeDraft.toDelete ? (
            <div className="tr-q-pane-empty">
              <h4>Q{activeIndex! + 1} is marked for deletion</h4>
              <p>
                Save the dataset to commit the delete, or click Cancel
                in the topbar to discard all pending changes.
              </p>
            </div>
          ) : (
            <div className="tr-q-pane-body">
              <div className="tr-q-pane-toolbar">
                <div>
                  <span className="tr-q-pane-toolbar-title">
                    Q{activeIndex! + 1}
                  </span>
                  <span className="tr-q-pane-toolbar-meta">
                    {activeDraft.item_id ?? '(not saved yet)'}
                  </span>
                </div>
                <button
                  type="button"
                  className="tr-btn danger"
                  onClick={onDeleteActive}
                  disabled={!activeIsDeletable || pending}
                >
                  Delete question
                </button>
              </div>

              {/* key={activeIndex} forces a clean remount when
                  switching pills so `defaultValue` inputs inside the
                  panel pick up the newly-loaded draft. The panel
                  runs in `standalone` mode — all four Housekeeping
                  flags visible (is_published, is_free_sample,
                  is_builder_visible, shuffle_options). */}
              <form
                ref={slotFormRef}
                id="tr-child-form"
                onSubmit={(e) => e.preventDefault()}
              >
                <QuestionAuthoringPanel
                  key={activeIndex ?? -1}
                  mode="standalone"
                  initial={activeDraft.initial}
                />
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
