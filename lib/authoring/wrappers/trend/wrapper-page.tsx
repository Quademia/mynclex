// mynclex/lib/authoring/wrappers/trend/wrapper-page.tsx
//
// Two-pane trend wrapper page.
//
// Slice progression:
//   - 13b — read-only shell.
//   - 13c (this slice) — Dataset view is writable: title / scenario /
//     kind / visibility / data table all editable. saveTrendMetadataAction
//     wires up. Right pane shows in-flight edits live (curator's
//     unsaved typing). Discard guard fires when curator tries to leave
//     with dirty edits. ErrorToast surfaces save failures.
//   - 13d — editor-mode question mounting (real editor bodies in
//     question pills, saveQuestionAction, dirty-guard, type picker
//     on + Add).
//   - 13e — detach + two-path delete.
//
// Layout (decision 6, two-pane with persistent pill strip on left):
//
//   ┌─────────── sticky topbar ──────────────────┐
//   │  ← Back · breadcrumb · save / cancel / del │
//   ├──────────────────────┬─────────────────────┤
//   │ left pane            │ right pane          │
//   │ ┌─ pill strip ─────┐ │ (combined preview,  │
//   │ │ [Dataset][Q1][+] │ │  always on)         │
//   │ └──────────────────┘ │                     │
//   │ active = Dataset:    │  scenario           │
//   │  title/scenario/kind │  data table render  │
//   │  visibility / table  │  (no flags)         │
//   │ active = Q1..Qn:     │  active question    │
//   │  editor body (13d)   │  preview            │
//   └──────────────────────┴─────────────────────┘
//
// Per decision 5 the activePill state doubles as the mode indicator —
// 'dataset' is wrapper-mode, integer is editor-mode.

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type MouseEvent } from 'react';
import { kindDefaultLabel } from './kind-templates';
import { saveTrendMetadataAction } from './actions';
import { TrendDataTable } from './data-table';
import type {
  SlotEditorInitial,
  SlotRow,
  TrendRow,
  WrapperData,
} from './types';
import type { PreviewViewMode } from '@/lib/authoring/atoms/preview-toggle';
import { ErrorToast } from '@/lib/authoring/atoms/error-toast';
import { DiscardConfirm } from '@/lib/authoring/atoms/discard-confirm';

import { McqPreview }       from '@/lib/authoring/editors/mcq-editor';
import { TfPreview }        from '@/lib/authoring/editors/tf-editor';
import { SataPreview }      from '@/lib/authoring/editors/sata-editor';
import { SelectNPreview }   from '@/lib/authoring/editors/select-n-editor';
import { MatrixPreview }    from '@/lib/authoring/editors/matrix-editor';
import { BowtiePreview }    from '@/lib/authoring/editors/bowtie-editor';
import {
  ClozePreview,
  parseStemMarkers,
} from '@/lib/authoring/editors/cloze-editor';
import { HighlightPreview } from '@/lib/authoring/editors/highlight-editor';
import {
  DragDropPreview,
  extractActiveMarkers,
} from '@/lib/authoring/editors/drag-drop-editor';

interface Props {
  data: WrapperData;
}

type ActivePill = 'dataset' | number;  // integer = slot.position

// Pending navigation while the discard dialog is open. The wrapper
// can be left via several paths (back link, breadcrumb, Dataset pill
// from a question pill, etc.). Each carries the eventual action.
type PendingNav =
  | { kind: 'leave-page'; href: string }
  | { kind: 'switch-pill'; to: ActivePill };

export function TrendWrapperPage({ data }: Props) {
  const { surface, datasetRow, slots } = data;
  const router = useRouter();

  const baseUrl =
    surface === 'tutor' ? '/tutor/bank/trends-v2' : '/admin/bank/trends-v2';

  // ── Wrapper-edit state (the curator's in-flight edits) ─────
  const [title, setTitle] = useState(datasetRow.title);
  const [scenario, setScenario] = useState(datasetRow.scenario ?? '');
  const [kind, setKind] = useState(datasetRow.kind);
  const [isPublished, setIsPublished] = useState(datasetRow.is_published);
  const [isFreeSample, setIsFreeSample] = useState(datasetRow.is_free_sample);
  const [isBuilderVisible, setIsBuilderVisible] = useState(datasetRow.is_builder_visible);
  const [timepoints, setTimepoints] = useState<string[]>(datasetRow.timepoints);
  const [rows, setRows] = useState<TrendRow[]>(datasetRow.rows);

  // ── Active pill ─────────────────────────────────────────────
  const [activePill, setActivePill] = useState<ActivePill>(
    slots.length > 0 ? 1 : 'dataset',
  );

  const activeSlot: SlotRow | null =
    typeof activePill === 'number'
      ? slots.find((s) => s.position === activePill) ?? null
      : null;

  // ── Right-pane preview toggle (Student / Answer-key) ───────
  const [questionMode, setQuestionMode] = useState<PreviewViewMode>('student');

  // ── Save / cancel state ─────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);

  // ── Dirty tracking ──────────────────────────────────────────
  // Compare current controlled state vs the loaded snapshot. JSON-
  // stringify the array fields to dodge reference-identity false
  // positives (legacy trend editor pattern).
  const dirty = useMemo(() => {
    if (title !== datasetRow.title) return true;
    if ((scenario || null) !== (datasetRow.scenario || null)) return true;
    if (kind !== datasetRow.kind) return true;
    if (isPublished       !== datasetRow.is_published)       return true;
    if (isFreeSample      !== datasetRow.is_free_sample)     return true;
    if (isBuilderVisible  !== datasetRow.is_builder_visible) return true;
    if (JSON.stringify(timepoints) !== JSON.stringify(datasetRow.timepoints)) return true;
    if (JSON.stringify(rows)       !== JSON.stringify(datasetRow.rows))       return true;
    return false;
  }, [
    title, scenario, kind,
    isPublished, isFreeSample, isBuilderVisible,
    timepoints, rows,
    datasetRow,
  ]);

  // ── Save / cancel handlers ──────────────────────────────────

  function onCancelChanges() {
    if (!dirty) return;
    setTitle(datasetRow.title);
    setScenario(datasetRow.scenario ?? '');
    setKind(datasetRow.kind);
    setIsPublished(datasetRow.is_published);
    setIsFreeSample(datasetRow.is_free_sample);
    setIsBuilderVisible(datasetRow.is_builder_visible);
    setTimepoints(datasetRow.timepoints);
    setRows(datasetRow.rows);
    setError(null);
  }

  function onSave() {
    if (!dirty || isPending) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('surface', surface);
      fd.set('trend_id', datasetRow.trend_id);
      fd.set('title', title);
      fd.set('scenario', scenario);
      fd.set('kind', kind);
      if (isPublished)      fd.set('is_published', 'on');
      if (isFreeSample)     fd.set('is_free_sample', 'on');
      if (isBuilderVisible) fd.set('is_builder_visible', 'on');
      fd.set('timepoints', JSON.stringify(timepoints));
      fd.set('rows',       JSON.stringify(rows));

      const result = await saveTrendMetadataAction(fd);
      if (!result.ok) {
        setError(result.error);
      } else {
        setError(null);
        // revalidatePath in the action causes Next to re-render with
        // the fresh snapshot. router.refresh() makes it deterministic.
        router.refresh();
      }
    });
  }

  // ── Navigation guards ───────────────────────────────────────

  function tryLeavePage(href: string, ev?: MouseEvent) {
    if (!dirty) return;
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    setPendingNav({ kind: 'leave-page', href });
  }

  function tryPickPill(to: ActivePill) {
    // Switching between question pills doesn't lose dataset edits —
    // dataset state stays around. Only block when leaving 'dataset'
    // mid-edit AND wrapper is dirty AND target is also a pill change
    // that visually hides the dataset edits. For 13c we just allow
    // free pill switches; the dataset state is preserved across them.
    setActivePill(to);
  }

  function onConfirmDiscard() {
    const nav = pendingNav;
    setPendingNav(null);
    if (!nav) return;
    if (nav.kind === 'leave-page') {
      router.push(nav.href);
    } else if (nav.kind === 'switch-pill') {
      setActivePill(nav.to);
    }
  }

  function onKeepEditing() {
    setPendingNav(null);
  }

  function onSaveAndClose() {
    // Run the save first; if it succeeds, fall through to the pending
    // nav. If it fails, leave the pending nav set so the curator can
    // retry or pick a different action.
    if (!dirty) {
      // Shouldn't be possible (dirty is what opened the dialog) — but
      // defend anyway.
      onConfirmDiscard();
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('surface', surface);
      fd.set('trend_id', datasetRow.trend_id);
      fd.set('title', title);
      fd.set('scenario', scenario);
      fd.set('kind', kind);
      if (isPublished)      fd.set('is_published', 'on');
      if (isFreeSample)     fd.set('is_free_sample', 'on');
      if (isBuilderVisible) fd.set('is_builder_visible', 'on');
      fd.set('timepoints', JSON.stringify(timepoints));
      fd.set('rows',       JSON.stringify(rows));

      const result = await saveTrendMetadataAction(fd);
      if (!result.ok) {
        setError(result.error);
        // Leave pendingNav set — curator can retry or cancel.
      } else {
        setError(null);
        const nav = pendingNav;
        setPendingNav(null);
        if (nav?.kind === 'leave-page') router.push(nav.href);
        else if (nav?.kind === 'switch-pill') setActivePill(nav.to);
        else router.refresh();
      }
    });
  }

  // ── Right-pane in-flight values ─────────────────────────────
  // Right pane reads from controlled state so curator's typing shows
  // up live (decision 6 + slice-13c spec). Falls back to dataset
  // values for fields not on the wrapper page.
  const previewScenario = scenario;
  const previewKind     = kind;
  const previewRows     = rows;
  const previewTps      = timepoints;

  return (
    <div className="auth-tr-page">
      {/* ── Sticky topbar ───────────────────────────────────── */}
      <header className="auth-tr-topbar">
        <div className="auth-tr-topbar-left">
          <Link
            href={baseUrl}
            className="auth-tr-back"
            onClick={(ev) => tryLeavePage(baseUrl, ev)}
          >
            ← Back to list
          </Link>
          <span className="auth-tr-breadcrumb">
            <Link
              href={baseUrl}
              className="auth-tr-crumb"
              onClick={(ev) => tryLeavePage(baseUrl, ev)}
            >
              Trend datasets (v2)
            </Link>
            <span className="auth-tr-crumb-sep">/</span>
            <code className="auth-tr-crumb-id">{datasetRow.trend_id}</code>
            {dirty && <span className="auth-cs-dirty-dot" title="Unsaved metadata">●</span>}
          </span>
        </div>
        <div className="auth-tr-topbar-right">
          <button
            type="button"
            className={`auth-cs-btn subtle tiny${dirty ? ' dirty-glow' : ''}`}
            onClick={onCancelChanges}
            disabled={!dirty || isPending}
            title="Discard unsaved title / scenario / kind / visibility / data table edits."
          >
            Cancel changes
          </button>
          <button
            type="button"
            className={`auth-cs-btn primary tiny${dirty ? ' dirty-glow' : ''}`}
            onClick={onSave}
            disabled={!dirty || isPending}
            title="Save dataset metadata + data table."
          >
            {isPending ? 'Saving…' : 'Save trend'}
          </button>
          <button
            type="button"
            className="auth-cs-btn subtle tiny"
            disabled
            title="Delete dataset (13e)"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="auth-tr-grid">
        <div className="auth-tr-pane auth-tr-pane-left">
          <PillStrip
            activePill={activePill}
            slots={slots}
            onPickDataset={() => tryPickPill('dataset')}
            onPickSlot={(pos) => tryPickPill(pos)}
          />

          <div className="auth-tr-pane-body">
            {activePill === 'dataset' ? (
              <DatasetView
                title={title}
                scenario={scenario}
                kind={kind}
                isPublished={isPublished}
                isFreeSample={isFreeSample}
                isBuilderVisible={isBuilderVisible}
                timepoints={timepoints}
                rows={rows}
                onTitleChange={setTitle}
                onScenarioChange={setScenario}
                onKindChange={setKind}
                onIsPublishedChange={setIsPublished}
                onIsFreeSampleChange={setIsFreeSample}
                onIsBuilderVisibleChange={setIsBuilderVisible}
                onDataChange={({ timepoints: tps, rows: rs }) => {
                  setTimepoints(tps);
                  setRows(rs);
                }}
              />
            ) : (
              <ActiveSlotPlaceholder slot={activeSlot} />
            )}
          </div>
        </div>

        {/* ── Right pane (always-on combined preview) ────────── */}
        <div className="auth-tr-pane auth-tr-pane-preview">
          <div className="auth-tr-pane-label">
            <span>Combined preview</span>
            <span className="auth-tr-preview-meta">
              {activeSlot
                ? <>As student on Q{activeSlot.position}</>
                : <>Dataset preview · pick a question pill to preview</>}
            </span>
          </div>

          <div className="auth-tr-preview-section">
            <div className="auth-tr-preview-section-label">Scenario</div>
            {previewScenario
              ? <p className="auth-tr-preview-scenario">{previewScenario}</p>
              : <p className="auth-tr-empty-msg">No scenario yet.</p>}
          </div>

          <div className="auth-tr-preview-section">
            <div className="auth-tr-preview-section-label">
              Data table · {kindDefaultLabel(previewKind)}
            </div>
            {previewRows.length > 0 || previewTps.length > 0 ? (
              <DataTableReadonly
                rows={previewRows}
                timepoints={previewTps}
                showFlags={false}
              />
            ) : (
              <p className="auth-tr-empty-msg">No rows or timepoints yet.</p>
            )}
          </div>

          <div className="auth-tr-preview-section">
            <div className="auth-tr-preview-section-label">
              {activeSlot
                ? <>Active question · Q{activeSlot.position} ({activeSlot.question_type})</>
                : 'Active question'}
            </div>
            {activeSlot ? (
              <ActiveQuestionPreview
                editor={activeSlot.editor}
                viewMode={questionMode}
                onViewModeChange={setQuestionMode}
              />
            ) : (
              <p className="auth-tr-empty-msg">
                Pick a question pill to preview.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Floating overlays ───────────────────────────────── */}
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {pendingNav && (
        <DiscardConfirm
          onKeepEditing={onKeepEditing}
          onDiscard={onConfirmDiscard}
          onSaveAndClose={onSaveAndClose}
          pending={isPending}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PillStrip — persistent navigator at the top of the left pane.
// One pill per attached question + a leading [Dataset] pill +
// a trailing [+ Add question] pill (disabled stub in 13c — wires
// up in 13d).
// ───────────────────────────────────────────────────────────

function PillStrip({
  activePill,
  slots,
  onPickDataset,
  onPickSlot,
}: {
  activePill:    ActivePill;
  slots:         SlotRow[];
  onPickDataset: () => void;
  onPickSlot:    (position: number) => void;
}) {
  return (
    <div className="auth-tr-pill-strip" role="tablist" aria-label="Trend dataset navigator">
      <button
        type="button"
        role="tab"
        aria-selected={activePill === 'dataset'}
        className={`auth-tr-pill auth-tr-pill-dataset${activePill === 'dataset' ? ' active' : ''}`}
        onClick={onPickDataset}
      >
        <span className="auth-tr-pill-label">Dataset</span>
      </button>

      {slots.map((s) => {
        const isActive = activePill === s.position;
        return (
          <button
            key={s.item_id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`auth-tr-pill${isActive ? ' active' : ''}`}
            onClick={() => onPickSlot(s.position)}
            title={s.stem || s.question_type}
          >
            <span className="auth-tr-pill-pos">Q{s.position}</span>
            <span className="auth-tr-pill-type">{s.question_type}</span>
            <span
              className={`auth-tr-pill-status${s.is_published ? ' published' : ''}`}
              title={s.is_published ? 'Published' : 'Draft'}
              aria-label={s.is_published ? 'Published' : 'Draft'}
            />
          </button>
        );
      })}

      <button
        type="button"
        className="auth-tr-pill auth-tr-pill-add"
        disabled
        title="Add question (13d)"
      >
        + Add
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// DatasetView — controlled component for editing dataset
// metadata + data table. State + handlers come from the parent
// wrapper page (single source of truth, dirty tracking, save).
// ───────────────────────────────────────────────────────────

function DatasetView({
  title,
  scenario,
  kind,
  isPublished,
  isFreeSample,
  isBuilderVisible,
  timepoints,
  rows,
  onTitleChange,
  onScenarioChange,
  onKindChange,
  onIsPublishedChange,
  onIsFreeSampleChange,
  onIsBuilderVisibleChange,
  onDataChange,
}: {
  title:                    string;
  scenario:                 string;
  kind:                     string;
  isPublished:              boolean;
  isFreeSample:             boolean;
  isBuilderVisible:         boolean;
  timepoints:               string[];
  rows:                     TrendRow[];
  onTitleChange:            (next: string) => void;
  onScenarioChange:         (next: string) => void;
  onKindChange:             (next: string) => void;
  onIsPublishedChange:      (next: boolean) => void;
  onIsFreeSampleChange:     (next: boolean) => void;
  onIsBuilderVisibleChange: (next: boolean) => void;
  onDataChange:             (next: { timepoints: string[]; rows: TrendRow[] }) => void;
}) {
  return (
    <div className="auth-tr-dataset-view">
      <section className="auth-tr-section">
        <label className="auth-tr-section-label" htmlFor="auth-tr-title">Title</label>
        <input
          id="auth-tr-title"
          type="text"
          className="auth-tr-input"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Post-op vitals — abdominal surgery day 1"
        />
      </section>

      <section className="auth-tr-section">
        <label className="auth-tr-section-label" htmlFor="auth-tr-scenario">Scenario</label>
        <textarea
          id="auth-tr-scenario"
          className="auth-tr-textarea"
          rows={4}
          value={scenario}
          onChange={(e) => onScenarioChange(e.target.value)}
          placeholder="Brief patient context shown above the data table."
        />
      </section>

      <section className="auth-tr-section">
        <label className="auth-tr-section-label" htmlFor="auth-tr-kind">Kind</label>
        <input
          id="auth-tr-kind"
          type="text"
          className="auth-tr-input"
          value={kind}
          onChange={(e) => onKindChange(e.target.value)}
          placeholder="e.g. vitals, labs, doctor notes"
          maxLength={64}
        />
        <span className="auth-tr-kind-hint">
          Display label: <strong>{kindDefaultLabel(kind)}</strong>
          {' '}· presets (vitals / labs / io / neuro / assessment) seed
          row templates at create time; editing here just renames the
          stored kind value.
        </span>
      </section>

      <section className="auth-tr-section">
        <div className="auth-tr-section-label">Visibility</div>
        <div className="auth-tr-visibility">
          <ReadonlyFlag
            label="Published (live to students)"
            on={isPublished}
            onChange={onIsPublishedChange}
          />
          <ReadonlyFlag
            label="Free sample (available without subscription)"
            on={isFreeSample}
            onChange={onIsFreeSampleChange}
          />
          <ReadonlyFlag
            label="Visible in student quiz builder"
            on={isBuilderVisible}
            onChange={onIsBuilderVisibleChange}
          />
        </div>
      </section>

      <section className="auth-tr-section">
        <TrendDataTable
          timepoints={timepoints}
          rows={rows}
          onChange={onDataChange}
        />
      </section>
    </div>
  );
}

// Visibility checkbox row. In 13b this was disabled; 13c makes the
// onChange wire-up live (the prop name kept "Readonly" historically
// but now drives the state — slice 14 will rename when collapsing).
function ReadonlyFlag({
  label,
  on,
  onChange,
}: {
  label:    string;
  on:       boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="auth-tr-visibility-row">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// ───────────────────────────────────────────────────────────
// ActiveSlotPlaceholder — left-pane content when a question
// pill is active. Real editor body lands in 13d.
// ───────────────────────────────────────────────────────────

function ActiveSlotPlaceholder({ slot }: { slot: SlotRow | null }) {
  if (!slot) {
    return <p className="auth-tr-empty-msg">No slot selected.</p>;
  }
  return (
    <div className="auth-tr-slot-placeholder">
      <h2 className="auth-tr-dataset-title">Q{slot.position} · {slot.question_type}</h2>
      {slot.stem
        ? <p className="auth-tr-dataset-scenario">{slot.stem}</p>
        : <p className="auth-tr-empty-msg">No stem yet.</p>}
      <p className="auth-tr-empty-msg" style={{ marginTop: 16 }}>
        Editor mode arrives in slice 13d. For now, this pill confirms
        the question loads and the right pane shows the live preview.
        Item ID: <code>{slot.item_id}</code>.
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// DataTableReadonly — read-only render of the dataset's data
// table for the right pane. `showFlags` is always false from
// the wrapper today (student view); kept as a prop for future
// reuse if a curator-view variant ever appears.
// ───────────────────────────────────────────────────────────

function DataTableReadonly({
  rows,
  timepoints,
  showFlags,
}: {
  rows:       TrendRow[];
  timepoints: string[];
  showFlags:  boolean;
}) {
  const hasRefRange = rows.some((r) => r.ref_range !== undefined && r.ref_range !== '');
  const hasCols = timepoints.length > 0;

  if (!hasCols && rows.length === 0) {
    return <p className="auth-tr-empty-msg">Empty data table.</p>;
  }

  return (
    <div className="auth-tr-table-scroll">
      <table className="auth-tr-table">
        <thead>
          <tr>
            <th className="auth-tr-col-metric">Metric</th>
            {timepoints.map((tp, idx) => (
              <th key={idx} className="auth-tr-col-tp">{tp || `TP${idx + 1}`}</th>
            ))}
            {hasRefRange && <th className="auth-tr-col-refrange">Ref range</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, rIdx) => (
            <tr key={rIdx}>
              <td className="auth-tr-col-metric">{r.metric || `Row ${rIdx + 1}`}</td>
              {timepoints.map((_, cIdx) => {
                const flag = r.flags[cIdx] ?? null;
                const flagClass = showFlags && flag
                  ? ` auth-tr-cell-${flag}`
                  : '';
                return (
                  <td key={cIdx} className={`auth-tr-cell${flagClass}`}>
                    {r.values[cIdx] ?? ''}
                  </td>
                );
              })}
              {hasRefRange && (
                <td className="auth-tr-refrange-cell">{r.ref_range ?? ''}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// ActiveQuestionPreview — mirrors CS's dispatch (case-study/
// wrapper-page.tsx:1177). Reads from slot.editor.initial directly:
// post-save snapshot. The preview's own internal toggle handles
// Student / Answer-key view switching.
// ───────────────────────────────────────────────────────────

function ActiveQuestionPreview({
  editor,
  viewMode,
  onViewModeChange,
}: {
  editor:           SlotEditorInitial;
  viewMode:         PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}) {
  switch (editor.kind) {
    case 'MCQ':
      return (
        <McqPreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          options={editor.initial.options}
          correctId={editor.initial.correct_id}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    case 'TF':
      return (
        <TfPreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          options={editor.initial.options}
          correctId={editor.initial.correct_id}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    case 'SATA':
      return (
        <SataPreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          options={editor.initial.options}
          correctIds={new Set(editor.initial.correct_ids)}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    case 'SELECT_N':
      return (
        <SelectNPreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          options={editor.initial.options}
          selectCount={editor.initial.select_count}
          correctIds={new Set(editor.initial.correct_ids)}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    case 'MATRIX':
      return (
        <MatrixPreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          rowLabel={editor.initial.row_label}
          rows={editor.initial.rows}
          columns={editor.initial.columns}
          correct={editor.initial.correct}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    case 'BOWTIE':
      return (
        <BowtiePreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          leftLabel={editor.initial.left_label}
          leftTokens={editor.initial.left_tokens}
          centreLabel={editor.initial.centre_label}
          centreTokens={editor.initial.centre_tokens}
          rightLabel={editor.initial.right_label}
          rightTokens={editor.initial.right_tokens}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    case 'CLOZE': {
      const markerOrder = parseStemMarkers(editor.initial.stem);
      const presentSet = new Set(markerOrder.map((n) => `b${n}`));
      const blanksWithInStem = editor.initial.blanks.map((b) => ({
        ...b,
        in_stem: presentSet.has(b.id),
      }));
      const blanksById = new Map(blanksWithInStem.map((b) => [b.id, b]));
      return (
        <ClozePreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          markerOrder={markerOrder}
          blanksById={blanksById}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    }
    case 'HIGHLIGHT':
      return (
        <HighlightPreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          chunks={editor.initial.chunks}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    case 'DRAG_DROP': {
      const activeMarkers =
        editor.initial.subtype === 'SENTENCE'
          ? extractActiveMarkers(editor.initial.stem)
          : new Set<number>();
      return (
        <DragDropPreview
          instruction={editor.initial.instruction}
          stem={editor.initial.stem}
          subtype={editor.initial.subtype}
          slots={editor.initial.slots}
          tokens={editor.initial.tokens}
          activeMarkers={activeMarkers}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      );
    }
  }
}
