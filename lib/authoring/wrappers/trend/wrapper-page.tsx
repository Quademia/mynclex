// mynclex/lib/authoring/wrappers/trend/wrapper-page.tsx
//
// Two-pane trend wrapper page (slice 13b — read-only shell).
//
// Slice progression:
//   - 13b (this slice) — read-only shell. Pill-strip navigation works,
//     left + right panes render against loaded data, but everything
//     is display-only. Save / Cancel / Delete buttons are disabled
//     stubs. Editor mode shows a "13d" placeholder when on a question
//     pill instead of a real editor body.
//   - 13c — wrapper-edit pane writable: title / scenario / kind /
//     visibility / data table; saveTrendMetadataAction wires up.
//   - 13d — editor-mode question mounting: real editor bodies in the
//     active question pill; saveQuestionAction; dirty-guard; type
//     picker on + Add.
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
import { useState } from 'react';
import { kindDefaultLabel } from './kind-templates';
import type { SlotEditorInitial, SlotRow, TrendRow, WrapperData } from './types';
import type { PreviewViewMode } from '@/lib/authoring/atoms/preview-toggle';

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

export function TrendWrapperPage({ data }: Props) {
  const { surface, datasetRow, slots } = data;

  const baseUrl =
    surface === 'tutor' ? '/tutor/bank/trends-v2' : '/admin/bank/trends-v2';

  // ── Active pill state ────────────────────────────────────
  const [activePill, setActivePill] = useState<ActivePill>(
    slots.length > 0 ? 1 : 'dataset',
  );

  const activeSlot: SlotRow | null =
    typeof activePill === 'number'
      ? slots.find((s) => s.position === activePill) ?? null
      : null;

  // Right-pane preview toggle (Student / Answer-key) for the active
  // question. Stays mounted across pill switches.
  const [questionMode, setQuestionMode] = useState<PreviewViewMode>('student');

  return (
    <div className="auth-tr-page">
      {/* ── Sticky topbar ───────────────────────────────────── */}
      <header className="auth-tr-topbar">
        <div className="auth-tr-topbar-left">
          <Link href={baseUrl} className="auth-tr-back">← Back to list</Link>
          <span className="auth-tr-breadcrumb">
            <Link href={baseUrl} className="auth-tr-crumb">Trend datasets (v2)</Link>
            <span className="auth-tr-crumb-sep">/</span>
            <code className="auth-tr-crumb-id">{datasetRow.trend_id}</code>
          </span>
        </div>
        <div className="auth-tr-topbar-right">
          <button type="button" className="auth-cs-btn subtle tiny" disabled title="Cancel changes (13c)">Cancel changes</button>
          <button type="button" className="auth-cs-btn primary tiny" disabled title="Save trend (13c)">Save trend</button>
          <button type="button" className="auth-cs-btn subtle tiny" disabled title="Delete dataset (13e)">Delete</button>
        </div>
      </header>

      {/* ── Pill strip (top of left pane, but spans full page width
            for now since it's narrow) ───────────────────────── */}
      <div className="auth-tr-grid">
        <div className="auth-tr-pane auth-tr-pane-left">
          <PillStrip
            activePill={activePill}
            slots={slots}
            onPickDataset={() => setActivePill('dataset')}
            onPickSlot={(pos) => setActivePill(pos)}
          />

          <div className="auth-tr-pane-body">
            {activePill === 'dataset' ? (
              <DatasetView datasetRow={datasetRow} />
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
            <div className="auth-tr-preview-section-label">
              Scenario
            </div>
            {datasetRow.scenario
              ? <p className="auth-tr-preview-scenario">{datasetRow.scenario}</p>
              : <p className="auth-tr-empty-msg">No scenario yet.</p>}
          </div>

          <div className="auth-tr-preview-section">
            <div className="auth-tr-preview-section-label">
              Data table · {kindDefaultLabel(datasetRow.kind)}
            </div>
            {datasetRow.rows.length > 0 || datasetRow.timepoints.length > 0 ? (
              <DataTableReadonly
                rows={datasetRow.rows}
                timepoints={datasetRow.timepoints}
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
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PillStrip — persistent navigator at the top of the left pane.
// One pill per attached question + a leading [Dataset] pill +
// a trailing [+ Add question] pill (disabled stub in 13b — wires
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
// DatasetView — read-only display of dataset metadata + data
// table. Editable variant arrives in 13c.
// ───────────────────────────────────────────────────────────

function DatasetView({ datasetRow }: { datasetRow: WrapperData['datasetRow'] }) {
  return (
    <div className="auth-tr-dataset-view">
      <section className="auth-tr-section">
        <div className="auth-tr-section-label">Title</div>
        <h1 className="auth-tr-dataset-title">{datasetRow.title}</h1>
      </section>

      <section className="auth-tr-section">
        <div className="auth-tr-section-label">Scenario</div>
        {datasetRow.scenario
          ? <p className="auth-tr-dataset-scenario">{datasetRow.scenario}</p>
          : <p className="auth-tr-empty-msg">No scenario yet — editable in 13c.</p>}
      </section>

      <section className="auth-tr-section">
        <div className="auth-tr-section-label">Kind</div>
        <p className="auth-tr-dataset-kind">{kindDefaultLabel(datasetRow.kind)}</p>
      </section>

      <section className="auth-tr-section">
        <div className="auth-tr-section-label">Visibility</div>
        <div className="auth-tr-visibility">
          <ReadonlyFlag label="Published"          on={datasetRow.is_published} />
          <ReadonlyFlag label="Free sample"        on={datasetRow.is_free_sample} />
          <ReadonlyFlag label="Visible in builder" on={datasetRow.is_builder_visible} />
        </div>
      </section>

      <section className="auth-tr-section">
        <div className="auth-tr-section-label">
          Data table · {datasetRow.rows.length} {datasetRow.rows.length === 1 ? 'row' : 'rows'} × {datasetRow.timepoints.length} {datasetRow.timepoints.length === 1 ? 'timepoint' : 'timepoints'}
        </div>
        {datasetRow.rows.length > 0 || datasetRow.timepoints.length > 0 ? (
          <DataTableReadonly
            rows={datasetRow.rows}
            timepoints={datasetRow.timepoints}
            showFlags={true}
          />
        ) : (
          <p className="auth-tr-empty-msg">
            No rows or timepoints yet — editable in 13c.
          </p>
        )}
      </section>
    </div>
  );
}

function ReadonlyFlag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="auth-tr-visibility-row">
      <input type="checkbox" checked={on} disabled readOnly />
      <span>{label}</span>
    </div>
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
// table. `showFlags=true` tints abnormal/borderline cells (curator
// view, used in the left pane). `showFlags=false` hides flags
// (student view, used in the right pane preview — matches
// pre-submit NCSBN behaviour from the legacy 1.12 plan §9).
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
