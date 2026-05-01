// mynclex/lib/authoring/wrappers/trend/wrapper-page.tsx
//
// Two-pane trend wrapper page.
//
// Slice progression:
//   - 13b — read-only shell.
//   - 13c — Dataset view writable + saveTrendMetadataAction.
//   - 13d (this slice) — editor-mode question mounting:
//       • clicking a question pill mounts the real editor body for
//         that question's type (MCQ/SATA/Cloze/etc.) in the left pane;
//       • Save question button in the topbar submits the editor's form;
//       • per-question dirty tracking + discard-confirm dialog when
//         switching pills with unsaved edits;
//       • + Add question opens QuestionTypePicker → creates a fresh
//         editor in a "creating" pill; saving fires saveQuestionAction
//         with trend_id (decision 10), router.refresh promotes the
//         new row into a real pill on the next render.
//   - 13e — detach + two-path delete.

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useMemo,
  useState,
  useTransition,
  type MouseEvent,
} from 'react';
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
import { QuestionTypePicker } from '@/lib/authoring/atoms/question-type-picker';
import { saveQuestionAction } from '@/lib/authoring/actions/save-question';
import type { QuestionType } from '@/lib/authoring/classifications';

import { McqEditorBody, McqPreview }             from '@/lib/authoring/editors/mcq-editor';
import { TfEditorBody, TfPreview }               from '@/lib/authoring/editors/tf-editor';
import { SataEditorBody, SataPreview }           from '@/lib/authoring/editors/sata-editor';
import { SelectNEditorBody, SelectNPreview }     from '@/lib/authoring/editors/select-n-editor';
import { MatrixEditorBody, MatrixPreview }       from '@/lib/authoring/editors/matrix-editor';
import { BowtieEditorBody, BowtiePreview }       from '@/lib/authoring/editors/bowtie-editor';
import {
  ClozeEditorBody,
  ClozePreview,
  parseStemMarkers,
} from '@/lib/authoring/editors/cloze-editor';
import { HighlightEditorBody, HighlightPreview } from '@/lib/authoring/editors/highlight-editor';
import {
  DragDropEditorBody,
  DragDropPreview,
  extractActiveMarkers,
} from '@/lib/authoring/editors/drag-drop-editor';
import { emptyMcqInitial }       from '@/lib/authoring/editors/mcq-row-mapper';
import { emptyTfInitial }        from '@/lib/authoring/editors/tf-row-mapper';
import { emptySataInitial }      from '@/lib/authoring/editors/sata-row-mapper';
import { emptySelectNInitial }   from '@/lib/authoring/editors/select-n-row-mapper';
import { emptyMatrixInitial }    from '@/lib/authoring/editors/matrix-row-mapper';
import { emptyBowtieInitial }    from '@/lib/authoring/editors/bowtie-row-mapper';
import { emptyClozeInitial }     from '@/lib/authoring/editors/cloze-row-mapper';
import { emptyHighlightInitial } from '@/lib/authoring/editors/highlight-row-mapper';
import { emptyDragDropInitial }  from '@/lib/authoring/editors/drag-drop-row-mapper';

interface Props {
  data: WrapperData;
}

type ActivePill = 'dataset' | number;  // integer = slot.position OR creating sentinel

// FORM_IDs match each editor body's `<form id={FORM_ID}>` so the
// external Save question button can submit it via `form="..."`.
const FORM_ID_BY_TYPE: Record<string, string> = {
  MCQ:       'auth-mcq-form',
  TF:        'auth-tf-form',
  SATA:      'auth-sata-form',
  SELECT_N:  'auth-select-n-form',
  MATRIX:    'auth-matrix-form',
  BOWTIE:    'auth-bowtie-form',
  CLOZE:     'auth-cloze-form',
  HIGHLIGHT: 'auth-highlight-form',
  DRAG_DROP: 'auth-drag-drop-form',
};

// Pending navigation while a discard dialog is open.
type PendingNav =
  | { kind: 'leave-page';   href: string }
  | { kind: 'switch-pill';  to: ActivePill }
  | { kind: 'cancel-creating' };  // user clicked away from a creating pill

// "Creating" state — set when curator clicked + Add and picked a type.
// Holds the position the new pill takes (slots.length + 1) and the
// chosen empty editor initial.
interface CreatingState {
  position: number;
  editor:   SlotEditorInitial;
}

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

  // ── "Creating" state for + Add question flow ──────────────
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);

  // ── Active pill ─────────────────────────────────────────────
  const [activePill, setActivePill] = useState<ActivePill>(
    slots.length > 0 ? 1 : 'dataset',
  );

  const activeSlot: SlotRow | null =
    typeof activePill === 'number'
      ? slots.find((s) => s.position === activePill) ?? null
      : null;

  const isCreatingActive =
    creating !== null && activePill === creating.position;

  // The editor mounted in the left pane (when on a question pill or
  // creating pill). Either an existing slot's editor or the creating
  // sentinel's editor.
  const activeEditor: SlotEditorInitial | null =
    isCreatingActive
      ? creating.editor
      : activeSlot?.editor ?? null;

  const activeEditorKind: string | null = activeEditor?.kind ?? null;

  // ── Right-pane preview toggle (Student / Answer-key) ───────
  const [questionMode, setQuestionMode] = useState<PreviewViewMode>('student');

  // ── Save / cancel state ─────────────────────────────────────
  const [isWrapperPending, startWrapperTransition] = useTransition();
  const [isQuestionPending, startQuestionTransition] = useTransition();
  const [wrapperError, setWrapperError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);

  // ── Per-active-question dirty flag ──────────────────────────
  // Reset to false on every pill switch (we unmount the editor body
  // on switch, so dirty state never crosses pills). Editor body fires
  // onDirty when curator first types.
  const [editorDirty, setEditorDirty] = useState(false);

  // ── Wrapper-edit dirty tracking ─────────────────────────────
  const wrapperDirty = useMemo(() => {
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

  // ── Handlers ────────────────────────────────────────────────

  function onCancelChanges() {
    if (!wrapperDirty) return;
    setTitle(datasetRow.title);
    setScenario(datasetRow.scenario ?? '');
    setKind(datasetRow.kind);
    setIsPublished(datasetRow.is_published);
    setIsFreeSample(datasetRow.is_free_sample);
    setIsBuilderVisible(datasetRow.is_builder_visible);
    setTimepoints(datasetRow.timepoints);
    setRows(datasetRow.rows);
    setWrapperError(null);
  }

  function buildWrapperFormData(): FormData {
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
    return fd;
  }

  function onSaveTrend() {
    if (!wrapperDirty || isWrapperPending) return;
    setWrapperError(null);
    startWrapperTransition(async () => {
      const result = await saveTrendMetadataAction(buildWrapperFormData());
      if (!result.ok) {
        setWrapperError(result.error);
      } else {
        setWrapperError(null);
        router.refresh();
      }
    });
  }

  // Editor body's onSubmit emits FormData. We forward to
  // saveQuestionAction. When creating, append trend_id so the new row
  // gets linked (decision 10). On success, refresh — the loader picks
  // up the new pill on the next render.
  function onEditorBodySubmit(formData: FormData) {
    if (isCreatingActive) {
      formData.set('trend_id', datasetRow.trend_id);
    }
    setQuestionError(null);
    startQuestionTransition(async () => {
      const result = await saveQuestionAction(formData);
      if (!result.ok) {
        setQuestionError(result.error);
      } else {
        setEditorDirty(false);
        if (isCreatingActive) {
          // Promote the creating pill into a real one. After refresh
          // the loader returns slots with the new question; we set
          // activePill to the new question's position (which equals
          // creating.position). The creating sentinel goes away.
          setCreating(null);
        }
        router.refresh();
      }
    });
  }

  function onEditorBodyDirty() {
    if (!editorDirty) setEditorDirty(true);
  }

  // External Save question button: triggers the active editor's form
  // submit programmatically.
  function onSaveQuestion() {
    if (!activeEditorKind) return;
    const formId = FORM_ID_BY_TYPE[activeEditorKind];
    const formEl = document.getElementById(formId) as HTMLFormElement | null;
    if (formEl) formEl.requestSubmit();
  }

  // ── Navigation guards ───────────────────────────────────────

  function tryLeavePage(href: string, ev?: MouseEvent) {
    const dirty = wrapperDirty || editorDirty;
    if (!dirty) return;
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    setPendingNav({ kind: 'leave-page', href });
  }

  function tryPickPill(to: ActivePill) {
    // Switching pills while the active editor is dirty: confirm.
    // Switching while wrapper is dirty (editing dataset and clicking
    // a question pill) is fine — wrapper state is preserved. Only
    // editor-body dirty matters for the per-pill switch.
    if (editorDirty) {
      setPendingNav({ kind: 'switch-pill', to });
      return;
    }
    // Leaving a creating pill without saving = throw away the empty
    // editor. Confirm only if there's been a typed edit (editorDirty).
    if (isCreatingActive && to !== activePill) {
      // No dirty edits — safe to discard the creating editor.
      setCreating(null);
    }
    setActivePill(to);
    // Clear the editor error toast when leaving the active pill.
    setQuestionError(null);
  }

  function onConfirmDiscard() {
    const nav = pendingNav;
    setPendingNav(null);
    if (!nav) return;
    setEditorDirty(false);
    setQuestionError(null);
    if (nav.kind === 'leave-page') {
      router.push(nav.href);
    } else if (nav.kind === 'switch-pill') {
      // If we're leaving the creating pill mid-edit, drop it.
      if (isCreatingActive && nav.to !== activePill) {
        setCreating(null);
      }
      setActivePill(nav.to);
    } else if (nav.kind === 'cancel-creating') {
      setCreating(null);
      setActivePill(slots.length > 0 ? 1 : 'dataset');
    }
  }

  function onKeepEditing() {
    setPendingNav(null);
  }

  function onSaveAndClose() {
    const nav = pendingNav;
    if (!nav) return;
    // Decide what's dirty. If wrapper dirty and we're leaving the
    // page, save the wrapper. If editor dirty (typical case for
    // switch-pill), save the question via its form.
    if (wrapperDirty && nav.kind === 'leave-page') {
      setWrapperError(null);
      startWrapperTransition(async () => {
        const result = await saveTrendMetadataAction(buildWrapperFormData());
        if (!result.ok) {
          setWrapperError(result.error);
          // Leave pendingNav set — curator can retry or cancel.
        } else {
          setWrapperError(null);
          setPendingNav(null);
          router.push(nav.href);
        }
      });
      return;
    }
    if (editorDirty && activeEditorKind) {
      // Submit the editor's form. We don't have a synchronous handle
      // to "did it succeed?" — optimistically dismiss the dialog so
      // the curator sees the toast on error and can retry.
      const formId = FORM_ID_BY_TYPE[activeEditorKind];
      const formEl = document.getElementById(formId) as HTMLFormElement | null;
      if (formEl) formEl.requestSubmit();
      setPendingNav(null);
      return;
    }
    // Nothing dirty — should not be reachable but defend.
    onConfirmDiscard();
  }

  // ── + Add question flow ─────────────────────────────────────

  function emptyEditorOf(type: QuestionType): SlotEditorInitial {
    switch (type) {
      case 'MCQ':       return { kind: 'MCQ',       initial: emptyMcqInitial(surface)       };
      case 'TF':        return { kind: 'TF',        initial: emptyTfInitial(surface)        };
      case 'SATA':      return { kind: 'SATA',      initial: emptySataInitial(surface)      };
      case 'SELECT_N':  return { kind: 'SELECT_N',  initial: emptySelectNInitial(surface)   };
      case 'MATRIX':    return { kind: 'MATRIX',    initial: emptyMatrixInitial(surface)    };
      case 'BOWTIE':    return { kind: 'BOWTIE',    initial: emptyBowtieInitial(surface)    };
      case 'CLOZE':     return { kind: 'CLOZE',     initial: emptyClozeInitial(surface)     };
      case 'HIGHLIGHT': return { kind: 'HIGHLIGHT', initial: emptyHighlightInitial(surface) };
      case 'DRAG_DROP': return { kind: 'DRAG_DROP', initial: emptyDragDropInitial(surface)  };
    }
  }

  function onClickAdd() {
    if (editorDirty) {
      // Curator was editing — confirm discard before opening picker.
      // If they save & close, after save we don't auto-open the
      // picker — they'd click + Add again. Simpler.
      setPendingNav({ kind: 'switch-pill', to: 'dataset' });
      return;
    }
    if (isCreatingActive) {
      // Already in a creating pill (no dirty edits per the check
      // above) — close it and open the picker fresh.
      setCreating(null);
    }
    setShowTypePicker(true);
  }

  function onTypePicked(type: QuestionType) {
    setShowTypePicker(false);
    const newPos = slots.length + 1;
    setCreating({ position: newPos, editor: emptyEditorOf(type) });
    setActivePill(newPos);
    setEditorDirty(false);
    setQuestionError(null);
  }

  function onCancelTypePicker() {
    setShowTypePicker(false);
  }

  // ── Right-pane in-flight values ─────────────────────────────
  const previewScenario = scenario;
  const previewKind     = kind;
  const previewRows     = rows;
  const previewTps      = timepoints;

  // Save-question button visibility + state
  const onQuestionPill = activePill !== 'dataset';

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
            {(wrapperDirty || editorDirty) && (
              <span className="auth-cs-dirty-dot" title="Unsaved changes">●</span>
            )}
          </span>
        </div>
        <div className="auth-tr-topbar-right">
          {onQuestionPill ? (
            <button
              type="button"
              className={`auth-cs-btn primary tiny${editorDirty ? ' dirty-glow' : ''}`}
              onClick={onSaveQuestion}
              disabled={!editorDirty || isQuestionPending}
              title="Save the active question."
              form={activeEditorKind ? FORM_ID_BY_TYPE[activeEditorKind] : undefined}
            >
              {isQuestionPending ? 'Saving…' : 'Save question'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`auth-cs-btn subtle tiny${wrapperDirty ? ' dirty-glow' : ''}`}
                onClick={onCancelChanges}
                disabled={!wrapperDirty || isWrapperPending}
                title="Discard unsaved title / scenario / kind / visibility / data table edits."
              >
                Cancel changes
              </button>
              <button
                type="button"
                className={`auth-cs-btn primary tiny${wrapperDirty ? ' dirty-glow' : ''}`}
                onClick={onSaveTrend}
                disabled={!wrapperDirty || isWrapperPending}
                title="Save dataset metadata + data table."
              >
                {isWrapperPending ? 'Saving…' : 'Save trend'}
              </button>
            </>
          )}
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
            creating={creating}
            onPickDataset={() => tryPickPill('dataset')}
            onPickSlot={(pos) => tryPickPill(pos)}
            onClickAdd={onClickAdd}
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
            ) : activeEditor ? (
              <EditorBodyForKind
                editor={activeEditor}
                error={questionError}
                pending={isQuestionPending}
                onSubmit={onEditorBodySubmit}
                onDirty={onEditorBodyDirty}
                onErrorDismiss={() => setQuestionError(null)}
              />
            ) : (
              <p className="auth-tr-empty-msg" style={{ padding: 22, textAlign: 'center' }}>
                Could not load the editor for the active pill.
              </p>
            )}
          </div>
        </div>

        {/* ── Right pane (always-on combined preview) ────────── */}
        <div className="auth-tr-pane auth-tr-pane-preview">
          <div className="auth-tr-pane-label">
            <span>Combined preview</span>
            <span className="auth-tr-preview-meta">
              {onQuestionPill
                ? <>As student on Q{activePill}</>
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
              {onQuestionPill && activeEditor
                ? <>Active question · Q{activePill} ({activeEditor.kind})</>
                : 'Active question'}
            </div>
            {activeEditor ? (
              <ActiveQuestionPreview
                editor={activeEditor}
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
      <ErrorToast error={wrapperError} onDismiss={() => setWrapperError(null)} />
      {/* Editor errors are surfaced inside each editor body's own
          ErrorToast (passed via props), so no second toast here. */}

      {pendingNav && (
        <DiscardConfirm
          onKeepEditing={onKeepEditing}
          onDiscard={onConfirmDiscard}
          onSaveAndClose={
            // Show Save and close only when there's something
            // coherent to save.
            (pendingNav.kind === 'leave-page' && wrapperDirty) ||
            (pendingNav.kind === 'switch-pill' && editorDirty)
              ? onSaveAndClose
              : undefined
          }
          pending={isWrapperPending || isQuestionPending}
        />
      )}

      {showTypePicker && (
        <QuestionTypePicker
          onClose={onCancelTypePicker}
          onPick={onTypePicked}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PillStrip — persistent navigator at the top of the left pane.
// One pill per attached question + a leading [Dataset] pill +
// an optional creating pill (when curator is mid-add) + a
// trailing [+ Add question] pill.
// ───────────────────────────────────────────────────────────

function PillStrip({
  activePill,
  slots,
  creating,
  onPickDataset,
  onPickSlot,
  onClickAdd,
}: {
  activePill:    ActivePill;
  slots:         SlotRow[];
  creating:      CreatingState | null;
  onPickDataset: () => void;
  onPickSlot:    (position: number) => void;
  onClickAdd:    () => void;
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

      {creating && (
        <button
          type="button"
          role="tab"
          aria-selected={activePill === creating.position}
          className={`auth-tr-pill auth-tr-pill-creating${activePill === creating.position ? ' active' : ''}`}
          onClick={() => onPickSlot(creating.position)}
          title="New question (unsaved)"
        >
          <span className="auth-tr-pill-pos">Q{creating.position}</span>
          <span className="auth-tr-pill-type">{creating.editor.kind}</span>
          <span className="auth-tr-pill-status" aria-label="Draft (new)" />
        </button>
      )}

      <button
        type="button"
        className="auth-tr-pill auth-tr-pill-add"
        onClick={onClickAdd}
        title="Add a new question to this dataset"
      >
        + Add
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// DatasetView — controlled component for editing dataset
// metadata + data table.
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
          <VisibilityFlag
            label="Published (live to students)"
            on={isPublished}
            onChange={onIsPublishedChange}
          />
          <VisibilityFlag
            label="Free sample (available without subscription)"
            on={isFreeSample}
            onChange={onIsFreeSampleChange}
          />
          <VisibilityFlag
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

function VisibilityFlag({
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
// EditorBodyForKind — mounts the matching editor body for the
// active question (or creating pill). Uses 'standalone' mode
// (decision 12) so all three visibility flags render in
// housekeeping; questions own their flags genuinely.
// ───────────────────────────────────────────────────────────

function EditorBodyForKind({
  editor,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: {
  editor:         SlotEditorInitial;
  error:          string | null;
  pending:        boolean;
  onSubmit:       (formData: FormData) => void;
  onDirty:        () => void;
  onErrorDismiss: () => void;
}) {
  switch (editor.kind) {
    case 'MCQ':       return <McqEditorBody       initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'TF':        return <TfEditorBody        initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'SATA':      return <SataEditorBody      initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'SELECT_N':  return <SelectNEditorBody   initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'MATRIX':    return <MatrixEditorBody    initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'BOWTIE':    return <BowtieEditorBody    initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'CLOZE':     return <ClozeEditorBody     initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'HIGHLIGHT': return <HighlightEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'DRAG_DROP': return <DragDropEditorBody  initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
  }
}

// ───────────────────────────────────────────────────────────
// DataTableReadonly — read-only render of the dataset's data
// table for the right pane.
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
// wrapper-page.tsx:1177).
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
