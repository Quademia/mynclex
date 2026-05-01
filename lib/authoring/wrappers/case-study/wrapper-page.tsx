// mynclex/lib/authoring/wrappers/case-study/wrapper-page.tsx
//
// Two-mode case-study wrapper page.
//
// Slice progression:
//   - 12b — read-only shell.
//   - 12c-1 — wrapper-edit pane writable: title, scenario, visibility,
//     per-slot cjmm.
//   - 12c-2 — chart-tab editors ported from legacy.
//   - 12c-3 (this slice) — real editor bodies mount in editor mode.
//     Save question wired (the standalone save-question action; existing
//     join row + parent_case_id preserved automatically by the update).
//     Discard prompt fires when curator switches slots while the active
//     editor is dirty.
//   - 12c-4 — Save case study upgraded to legacy atomic RPC; Validate
//     panel.

'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/authoring/atoms/error-toast';
import { DiscardConfirm } from '@/lib/authoring/atoms/discard-confirm';
import { saveQuestionAction } from '@/lib/authoring/actions/save-question';
import { CJMM_STEPS } from '../../classifications';
import type {
  CaseStudyEntry,
  CaseStudyTabColumn,
  CaseStudyTabRow,
  ChartEntry,
  SlotEditorInitial,
  SlotRow,
  TabRow,
  WrapperData,
} from './types';
import { saveCaseMetadataAction, detachQuestionAction } from './actions';
import { QuestionTypePicker } from '@/lib/authoring/atoms/question-type-picker';
import type { QuestionType } from '@/lib/authoring/classifications';
import { DeleteCaseConfirm } from './delete-case-confirm';
import { TabRail } from './chart-tabs/tab-rail';
import { NarrativeTabEditor } from './chart-tabs/narrative-tab';
import { StructuredTabEditor } from './chart-tabs/structured-tab';
import { getTabType } from './chart-tabs/tab-types';
import {
  validateCase,
  type ValidationIssue,
  type CaseEditorState as ValidationState,
  type SlotSnapshot,
  type TabSnapshot,
} from './validation';
import { ValidationPanel } from './validation-panel';

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
import type { PreviewViewMode } from '@/lib/authoring/atoms/preview-toggle';

type WrapperTab = 'content' | 'chart';
type PreviewPos = 'off' | 1 | 2 | 3 | 4 | 5 | 6;

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

// Per-tab in-flight draft. Mirrors legacy editor.tsx.
interface TabDraft {
  title:       string;
  entries:     CaseStudyEntry[];
  columns_def: CaseStudyTabColumn[];
}

function tabToDraft(t: CaseStudyTabRow): TabDraft {
  return { title: t.title, entries: t.entries, columns_def: t.columns_def };
}

function isTabDirty(t: CaseStudyTabRow, d: TabDraft): boolean {
  if (t.title !== d.title) return true;
  if (JSON.stringify(t.entries)     !== JSON.stringify(d.entries))     return true;
  if (JSON.stringify(t.columns_def) !== JSON.stringify(d.columns_def)) return true;
  return false;
}

// Pending mode-transition state for the discard dialog.
type PendingNav =
  | { kind: 'switch-slot';  toPos: number }
  | { kind: 'close-editor' };

// ───────────────────────────────────────────────────────────
// SAMPLE_DATA — sandbox payload (slot.editor stays null; the
// hardcoded sandbox doesn't try to mount real editor bodies).
// ───────────────────────────────────────────────────────────

export const SAMPLE_DATA: WrapperData = {
  surface: 'admin',
  caseRow: {
    case_id:                  'NCLEX_CS_SAMPLE',
    title:                    'Postpartum hemorrhage assessment',
    scenario_summary:
      'A 28-year-old G3P3 patient is 2 hours postpartum following a vaginal delivery. ' +
      'The patient is alert and oriented. You are conducting your shift assessment and ' +
      'review the chart below.',
    client_needs_category:    null,
    client_needs_subcategory: null,
    nursing_subject:          null,
    body_system:              null,
    topic:                    null,
    subtopic:                 null,
    difficulty:               null,
    tags:                     [],
    is_free_sample:           false,
    is_builder_visible:       true,
    is_published:             false,
    created_at:               '2026-04-30T00:00:00Z',
    updated_at:               '2026-04-30T00:00:00Z',
  },
  tabs: [
    { tab_id: 's1', case_id: 'NCLEX_CS_SAMPLE', tab_key: 'nurses_notes',
      title: 'Nurses notes', display_order: 0, is_custom: false, custom_shape: null,
      columns_def: [], entries: [] },
    { tab_id: 's2', case_id: 'NCLEX_CS_SAMPLE', tab_key: 'vital_signs',
      title: 'Vital signs', display_order: 1, is_custom: false, custom_shape: null,
      columns_def: [
        { id: 'time', label: 'Time' },
        { id: 'bp',   label: 'BP'   },
        { id: 'hr',   label: 'HR'   },
        { id: 'rr',   label: 'RR'   },
        { id: 'spo2', label: 'SpO₂' },
        { id: 'temp', label: 'Temp' },
      ],
      entries: [
        { visible_from: 1, time: '13:00', bp: '124/80', hr: '78',  rr: '16', spo2: '98%', temp: '98.6 °F' },
        { visible_from: 2, time: '13:30', bp: '110/72', hr: '92',  rr: '18', spo2: '97%', temp: '98.4 °F' },
        { visible_from: 3, time: '14:00', bp: '96/64',  hr: '110', rr: '22', spo2: '96%', temp: '98.6 °F' },
      ] },
    { tab_id: 's3', case_id: 'NCLEX_CS_SAMPLE', tab_key: 'lab_results',
      title: 'Lab results', display_order: 2, is_custom: false, custom_shape: null,
      columns_def: [], entries: [] },
    { tab_id: 's4', case_id: 'NCLEX_CS_SAMPLE', tab_key: 'orders',
      title: 'Orders', display_order: 3, is_custom: false, custom_shape: null,
      columns_def: [], entries: [] },
    { tab_id: 's5', case_id: 'NCLEX_CS_SAMPLE', tab_key: 'history',
      title: 'History & physical', display_order: 4, is_custom: false, custom_shape: null,
      columns_def: [], entries: [] },
    { tab_id: 's6', case_id: 'NCLEX_CS_SAMPLE', tab_key: 'diagnostics',
      title: 'Diagnostics', display_order: 5, is_custom: false, custom_shape: null,
      columns_def: [], entries: [] },
  ],
  slots: [
    { position: 1, item_id: 'q1', cjmm_step: 'Recognise cues',
      question_type: 'MCQ',    stem: 'Which finding at 14:00 is most concerning?',
      editor: null },
    { position: 2, item_id: 'q2', cjmm_step: 'Take action',
      question_type: 'SATA',   stem: 'Select all the priority nursing actions for this patient at 14:00.',
      editor: null },
    { position: 3, item_id: 'q3', cjmm_step: 'Analyse cues',
      question_type: 'MATRIX', stem: 'Categorise each finding as expected or unexpected for postpartum.',
      editor: null },
    { position: 4, item_id: null, cjmm_step: null, question_type: null, stem: null, editor: null },
    { position: 5, item_id: null, cjmm_step: null, question_type: null, stem: null, editor: null },
    { position: 6, item_id: null, cjmm_step: null, question_type: null, stem: null, editor: null },
  ],
};

function cjmmShort(step: string | null): string | null {
  if (!step) return null;
  const map: Record<string, string> = {
    'Recognise cues':     'RC',
    'Analyse cues':       'AC',
    'Prioritise':         'PH',
    'Generate solutions': 'GS',
    'Take action':        'TA',
    'Evaluate outcomes':  'EO',
  };
  return map[step] ?? step.slice(0, 2).toUpperCase();
}

// ───────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────

interface Props {
  data:        WrapperData;
  sandboxMode?: boolean;
}

export function CaseStudyWrapperPage({ data, sandboxMode = false }: Props) {
  const { caseRow, tabs, slots, surface } = data;
  const router = useRouter();

  // ── Wrapper-metadata state (12c-1) ────────────────────────
  const [title, setTitle] = useState(caseRow.title);
  const [scenario, setScenario] = useState(caseRow.scenario_summary ?? '');
  const [isPublished, setIsPublished] = useState(caseRow.is_published);
  const [isFreeSample, setIsFreeSample] = useState(caseRow.is_free_sample);
  const [isBuilderVisible, setIsBuilderVisible] = useState(caseRow.is_builder_visible);

  const initialCjmm = useMemo<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const s of slots) m[s.position] = s.cjmm_step ?? '';
    return m;
  }, [slots]);
  const [cjmmBySlot, setCjmmBySlot] = useState<Record<number, string>>(() => initialCjmm);

  // ── Tab draft state (12c-2) ───────────────────────────────
  const [draftOverrides, setDraftOverrides] = useState<Record<string, TabDraft>>({});
  const drafts = useMemo<Record<string, TabDraft>>(() => {
    const out: Record<string, TabDraft> = {};
    for (const t of tabs) out[t.tab_id] = draftOverrides[t.tab_id] ?? tabToDraft(t);
    return out;
  }, [tabs, draftOverrides]);
  function updateDraft(tab_id: string, next: TabDraft) {
    setDraftOverrides((prev) => ({ ...prev, [tab_id]: next }));
  }
  const dirtyTabIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of tabs) {
      const d = drafts[t.tab_id];
      if (d && isTabDirty(t, d)) set.add(t.tab_id);
    }
    return set;
  }, [tabs, drafts]);

  // ── Per-slot editor body state (12c-3) ────────────────────
  const [editorDirtyByPos,   setEditorDirtyByPos]   = useState<Record<number, boolean>>({});
  const [editorErrorByPos,   setEditorErrorByPos]   = useState<Record<number, string | null>>({});
  const [editorPendingByPos, setEditorPendingByPos] = useState<Record<number, boolean>>({});
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);

  // ── 12e — add / detach / delete state ─────────────────────
  // showTypePicker — type-picker modal visibility.
  // pickerTargetPos — when the picker is open, this is the slot
  //   position the new question will fill. Set by clicking an empty
  //   slot pip / card (positional add) or by clicking the "+ Add
  //   question" button (first-empty add).
  // creating — when not null, the active slot is in CREATE mode
  //   for a new question. Editor mode mounts an empty editor body
  //   of the picked type at this slot's position.
  // showDelete — case-delete dialog visibility.
  // detachPending — true while a detach action is in flight.
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [pickerTargetPos, setPickerTargetPos] = useState<number | null>(null);
  const [creating, setCreating] = useState<{
    position: number;
    editor:   SlotEditorInitial;
  } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [detachPending, setDetachPending] = useState<number | null>(null);

  // ── Mode + view state ─────────────────────────────────────
  const [editorMode, setEditorMode] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number>(() => {
    const firstPopulated = slots.find((s) => s.item_id !== null);
    return firstPopulated?.position ?? 1;
  });
  const [activeTab, setActiveTab] = useState<WrapperTab>('chart');
  const [previewPos, setPreviewPos] = useState<PreviewPos>('off');
  const [questionMode, setQuestionMode] = useState<PreviewViewMode>('student');

  const [activeChartTabId, setActiveChartTabId] = useState<string | null>(
    () => tabs[0]?.tab_id ?? null,
  );

  if (activeChartTabId && !tabs.some((t) => t.tab_id === activeChartTabId)) {
    setActiveChartTabId(tabs[0]?.tab_id ?? null);
  } else if (!activeChartTabId && tabs.length > 0) {
    setActiveChartTabId(tabs[0].tab_id);
  }

  const activeChartTab = useMemo(
    () => tabs.find((t) => t.tab_id === activeChartTabId) ?? null,
    [tabs, activeChartTabId],
  );
  const activeChartDraft = activeChartTab ? drafts[activeChartTab.tab_id] : null;

  // ── Save / cancel transitions for wrapper metadata ────────
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Validation panel state (12c-4a) ───────────────────────
  // null = panel closed. Array = open with these issues. Re-clicking
  // Validate while open closes the panel.
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[] | null>(null);

  function buildValidationState(): ValidationState {
    const tabSnapshots: TabSnapshot[] = tabs.map((t) => {
      const d = drafts[t.tab_id];
      return {
        tab_id:  t.tab_id,
        title:   d?.title   ?? t.title,
        entries: d?.entries ?? t.entries,
      };
    });

    const slotSnapshots: SlotSnapshot[] = slots.map((s) => {
      const liveCjmm = cjmmBySlot[s.position];
      const cjmm_step = liveCjmm
        ? (liveCjmm as SlotSnapshot['cjmm_step'])
        : s.cjmm_step;
      return {
        position:      s.position,
        has_item:      s.item_id !== null,
        question_type: s.question_type,
        stem:          s.stem ?? '',
        cjmm_step,
      };
    });

    return {
      title,
      scenario_summary: scenario,
      is_published:     isPublished,
      tabs:             tabSnapshots,
      slots:            slotSnapshots,
    };
  }

  function onValidateClick() {
    if (validationIssues !== null) {
      setValidationIssues(null);
      return;
    }
    setValidationIssues(validateCase(buildValidationState()));
  }

  // ── 12e handlers — add / detach / delete ────────────────

  function emptyEditorOf(type: QuestionType): SlotEditorInitial {
    switch (type) {
      case 'MCQ':       return { kind: 'MCQ',       initial: { ...emptyMcqInitial(surface),       mode: 'wrapper-child' } };
      case 'TF':        return { kind: 'TF',        initial: { ...emptyTfInitial(surface),        mode: 'wrapper-child' } };
      case 'SATA':      return { kind: 'SATA',      initial: { ...emptySataInitial(surface),      mode: 'wrapper-child' } };
      case 'SELECT_N':  return { kind: 'SELECT_N',  initial: { ...emptySelectNInitial(surface),   mode: 'wrapper-child' } };
      case 'MATRIX':    return { kind: 'MATRIX',    initial: { ...emptyMatrixInitial(surface),    mode: 'wrapper-child' } };
      case 'BOWTIE':    return { kind: 'BOWTIE',    initial: { ...emptyBowtieInitial(surface),    mode: 'wrapper-child' } };
      case 'CLOZE':     return { kind: 'CLOZE',     initial: { ...emptyClozeInitial(surface),     mode: 'wrapper-child' } };
      case 'HIGHLIGHT': return { kind: 'HIGHLIGHT', initial: { ...emptyHighlightInitial(surface), mode: 'wrapper-child' } };
      case 'DRAG_DROP': return { kind: 'DRAG_DROP', initial: { ...emptyDragDropInitial(surface),  mode: 'wrapper-child' } };
    }
  }

  function openPickerForFirstEmpty() {
    const firstEmpty = slots.find((s) => s.item_id === null);
    if (!firstEmpty) {
      setError('All 6 slots are populated. Detach a question first to free a slot.');
      return;
    }
    setPickerTargetPos(firstEmpty.position);
    setShowTypePicker(true);
  }

  function openPickerForPosition(pos: number) {
    setPickerTargetPos(pos);
    setShowTypePicker(true);
  }

  function onTypePicked(type: QuestionType) {
    // Resolve target — fall back to first-empty if for any reason
    // pickerTargetPos got cleared between open and pick.
    let target = pickerTargetPos;
    if (target === null) {
      const firstEmpty = slots.find((s) => s.item_id === null);
      target = firstEmpty?.position ?? null;
    }
    setShowTypePicker(false);
    setPickerTargetPos(null);
    if (target === null) {
      setError('All 6 slots are populated. Detach a question first to free a slot.');
      return;
    }
    setCreating({ position: target, editor: emptyEditorOf(type) });
    setActiveSlot(target);
    setEditorMode(true);
  }

  function onCancelPicker() {
    setShowTypePicker(false);
    setPickerTargetPos(null);
  }

  function onDetachSlot(slot: SlotRow) {
    if (slot.item_id === null) return;
    const ok = window.confirm(
      `Detach Q${slot.position} from this case? The question survives in the bank as standalone.`,
    );
    if (!ok) return;
    setDetachPending(slot.position);
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('case_id', caseRow.case_id);
    fd.set('item_id', slot.item_id);
    startTransition(async () => {
      const result = await detachQuestionAction(fd);
      setDetachPending(null);
      if (!result.ok) {
        setError(result.error);
      } else {
        // If we were in editor mode for the detached slot, return to
        // wrapper mode — the slot is now empty so its editor body
        // would re-mount as empty-stub anyway.
        if (editorMode && activeSlot === slot.position) {
          setEditorMode(false);
        }
        router.refresh();
      }
    });
  }

  function onDeleteCase() {
    setShowDelete(true);
  }

  function onCaseDeleted() {
    setShowDelete(false);
    // Action's revalidatePath revalidates the list page; navigate
    // there with a deleted=1 hint (list page can render a banner
    // later if we want).
    const baseUrl = surface === 'tutor' ? '/tutor/bank/cases-v2' : '/admin/bank/cases-v2';
    router.push(baseUrl);
  }

  const dirty = useMemo(() => {
    if (title !== caseRow.title) return true;
    if (scenario !== (caseRow.scenario_summary ?? '')) return true;
    if (isPublished !== caseRow.is_published) return true;
    if (isFreeSample !== caseRow.is_free_sample) return true;
    if (isBuilderVisible !== caseRow.is_builder_visible) return true;
    for (const s of slots) {
      if ((cjmmBySlot[s.position] ?? '') !== (s.cjmm_step ?? '')) return true;
    }
    return false;
  }, [title, scenario, isPublished, isFreeSample, isBuilderVisible, cjmmBySlot, caseRow, slots]);

  function onSaveCase() {
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    const fd = new FormData();
    fd.set('surface', surface);
    fd.set('case_id', caseRow.case_id);
    fd.set('title', title);
    fd.set('scenario_summary', scenario);
    if (isPublished)      fd.set('is_published', 'on');
    if (isFreeSample)     fd.set('is_free_sample', 'on');
    if (isBuilderVisible) fd.set('is_builder_visible', 'on');
    for (const s of slots) {
      if (s.item_id !== null) {
        fd.set(`cjmm_${s.position}`, cjmmBySlot[s.position] ?? '');
      }
    }
    startTransition(async () => {
      const result = await saveCaseMetadataAction(fd);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onCancel() {
    setTitle(caseRow.title);
    setScenario(caseRow.scenario_summary ?? '');
    setIsPublished(caseRow.is_published);
    setIsFreeSample(caseRow.is_free_sample);
    setIsBuilderVisible(caseRow.is_builder_visible);
    setCjmmBySlot(initialCjmm);
    setError(null);
  }

  const previewEntries = useMemo<ChartEntry[]>(() => {
    if (!activeChartTab) return [];
    const liveEntries = activeChartDraft?.entries ?? activeChartTab.entries;
    return liveEntries.filter((e) => Number(e.visible_from) <= activeSlot);
  }, [activeChartTab, activeChartDraft, activeSlot]);

  const populated = slots.filter((s) => s.item_id !== null).length;
  const activeSlotData = slots[activeSlot - 1] ?? null;
  const activeSlotDirty = !!editorDirtyByPos[activeSlot];
  const activeSlotPending = !!editorPendingByPos[activeSlot];
  const activeSlotError = editorErrorByPos[activeSlot] ?? null;

  function onSlotClick(pos: number) {
    // Wrapper mode: empty slot card → open picker for that position.
    // Filled slot card → enter editor mode for the question.
    const slot = slots[pos - 1];
    if (slot && slot.item_id === null) {
      openPickerForPosition(pos);
      return;
    }
    setActiveSlot(pos);
    setEditorMode(true);
  }

  function onCloseEditor() {
    if (activeSlotDirty) {
      setPendingNav({ kind: 'close-editor' });
      return;
    }
    setEditorMode(false);
  }

  function onSlotStripClick(pos: number) {
    if (pos === activeSlot) return;
    // Editor mode: empty slot pip → open picker for that position.
    // Filled slot pip → switch active slot (with discard prompt
    // if the active editor is dirty).
    const slot = slots[pos - 1];
    if (slot && slot.item_id === null) {
      openPickerForPosition(pos);
      return;
    }
    if (activeSlotDirty) {
      setPendingNav({ kind: 'switch-slot', toPos: pos });
      return;
    }
    setActiveSlot(pos);
  }

  // ── Editor body save handler (slice 12c-3) ────────────────
  // The body emits FormData via its onSubmit. We forward to
  // saveQuestionAction. The action's normal update path preserves
  // parent_case_id + the existing nclex_case_study_items join row
  // (it only writes the columns parsed from the form). On success,
  // router.refresh() re-fetches the wrapper data so the slot rail's
  // stem/summary updates.
  function onEditorBodySubmit(formData: FormData) {
    const pos = activeSlot;
    // 12e — when creating a new question in case context, append the
    // wrapper context to the form so save-question.ts can write the
    // join row + set parent_case_id atomically. Existing questions
    // (creating === null) save normally; their join row + parent_case_id
    // are preserved by the action's update path.
    if (creating && creating.position === pos) {
      formData.set('parent_case_id', caseRow.case_id);
      formData.set('case_position', String(pos));
      formData.set(
        'case_cjmm_step',
        cjmmBySlot[pos] || 'Recognise cues',
      );
    }
    setEditorPendingByPos((prev) => ({ ...prev, [pos]: true }));
    setEditorErrorByPos((prev) => ({ ...prev, [pos]: null }));
    startTransition(async () => {
      const result = await saveQuestionAction(formData);
      setEditorPendingByPos((prev) => ({ ...prev, [pos]: false }));
      if (!result.ok) {
        setEditorErrorByPos((prev) => ({ ...prev, [pos]: result.error }));
      } else {
        setEditorDirtyByPos((prev) => ({ ...prev, [pos]: false }));
        // Successful create-in-case: clear creating state so the
        // freshly-loaded slot.editor takes over after refresh.
        if (creating && creating.position === pos) {
          setCreating(null);
        }
        router.refresh();
      }
    });
  }

  function onEditorBodyDirty() {
    const pos = activeSlot;
    if (!editorDirtyByPos[pos]) {
      setEditorDirtyByPos((prev) => ({ ...prev, [pos]: true }));
    }
  }

  // ── Discard dialog handlers ───────────────────────────────
  function discardAndProceed() {
    if (!pendingNav) return;
    setEditorDirtyByPos((prev) => ({ ...prev, [activeSlot]: false }));
    setEditorErrorByPos((prev) => ({ ...prev, [activeSlot]: null }));
    if (pendingNav.kind === 'switch-slot') {
      setActiveSlot(pendingNav.toPos);
    } else {
      setEditorMode(false);
    }
    setPendingNav(null);
  }

  function saveAndProceed() {
    if (!pendingNav) return;
    // Trigger the body's form submit programmatically so the action
    // runs through the same path as the Save question button. After
    // submit, we don't have an easy synchronous handle to "did it
    // succeed?" — the simplest behaviour is: dismiss the dialog now;
    // if save errored, the toast will surface; the curator can retry.
    if (activeSlotData?.editor?.kind) {
      const formId = FORM_ID_BY_TYPE[activeSlotData.editor.kind];
      const formEl = document.getElementById(formId) as HTMLFormElement | null;
      if (formEl) formEl.requestSubmit();
    }
    // Don't switch yet — wait for the next render to see the save
    // succeed (dirty cleared). We optimistically dismiss the dialog
    // and let the curator try the switch again after save settles.
    setPendingNav(null);
  }

  function cancelNav() {
    setPendingNav(null);
  }

  return (
    <div className="auth-cs-sandbox-wrap">
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {pendingNav && (
        <DiscardConfirm
          onKeepEditing={cancelNav}
          onDiscard={discardAndProceed}
          onSaveAndClose={saveAndProceed}
        />
      )}

      {validationIssues !== null && (
        <ValidationPanel
          issues={validationIssues}
          isPublished={isPublished}
          onClose={() => setValidationIssues(null)}
        />
      )}

      {showTypePicker && (
        <QuestionTypePicker
          onClose={onCancelPicker}
          onPick={onTypePicked}
        />
      )}

      {showDelete && (
        <DeleteCaseConfirm
          surface={surface}
          caseId={caseRow.case_id}
          caseTitle={caseRow.title}
          attachedCount={populated}
          onCancel={() => setShowDelete(false)}
          onDeleted={onCaseDeleted}
          onError={(msg) => {
            setShowDelete(false);
            setError(msg);
          }}
        />
      )}

      <div className="auth-cs-page-topbar">
        <span>Bank</span><span className="auth-cs-crumb-sep">›</span>
        <span>Case Studies (v2)</span><span className="auth-cs-crumb-sep">›</span>
        <span className="auth-cs-crumb-current">{caseRow.title}</span>
        <span className="auth-cs-mode-pill">
          {editorMode ? `Editor mode · Q${activeSlot}` : 'Wrapper mode'}
        </span>
        {sandboxMode && <span className="auth-cs-sandbox-pill">SANDBOX</span>}
      </div>

      <div className="auth-cs-grid">

        {!editorMode && (
          <div className="auth-cs-pane auth-cs-pane-left">
            <div className="auth-cs-pane-label">
              <span>Wrapper edit{dirty && <span className="auth-cs-dirty-dot" title="Unsaved metadata">●</span>}</span>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="auth-cs-btn subtle tiny" type="button" onClick={onCancel} disabled={isPending || !dirty}>Cancel</button>
                <button
                  className="auth-cs-btn tiny"
                  type="button"
                  style={{ color: 'var(--danger)', borderColor: '#fecaca', background: '#fef2f2' }}
                  onClick={onDeleteCase}
                  disabled={isPending}
                >
                  Delete
                </button>
                <button
                  className="auth-cs-btn tiny"
                  type="button"
                  onClick={onValidateClick}
                  aria-pressed={validationIssues !== null}
                >
                  Validate
                </button>
                <button className="auth-cs-btn primary tiny" type="button" onClick={onSaveCase} disabled={isPending || !dirty}>
                  {isPending ? 'Saving…' : 'Save case study'}
                </button>
              </span>
            </div>

            <div className="auth-cs-pane-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={activeTab === 'content'} className={`auth-cs-pane-tab${activeTab === 'content' ? ' active' : ''}`} onClick={() => setActiveTab('content')}>Content</button>
              <button type="button" role="tab" aria-selected={activeTab === 'chart'} className={`auth-cs-pane-tab${activeTab === 'chart' ? ' active' : ''}`} onClick={() => setActiveTab('chart')}>
                Chart
                {dirtyTabIds.size > 0 && (
                  <span className="auth-cs-tab-dot" title={`${dirtyTabIds.size} tab${dirtyTabIds.size === 1 ? '' : 's'} with unsaved changes`} />
                )}
              </button>
            </div>

            {activeTab === 'content' && (
              <div className="auth-cs-tabbody">
                <div className="auth-cs-field">
                  <label className="auth-cs-field-label">Title</label>
                  <input className="auth-cs-field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="auth-cs-field">
                  <label className="auth-cs-field-label">Scenario</label>
                  <textarea className="auth-cs-field-textarea" rows={4} value={scenario} onChange={(e) => setScenario(e.target.value)} />
                </div>
                <div className="auth-cs-visibility" role="group" aria-label="Visibility flags">
                  <div className="auth-cs-visibility-title">Visibility</div>
                  <VisibilityRow label="Published" help="Live to students. Requires all 6 slots populated." on={isPublished} onChange={setIsPublished} />
                  <VisibilityRow label="Free sample" help="Available without subscription." on={isFreeSample} onChange={setIsFreeSample} />
                  <VisibilityRow label="Visible in builder" help="Show in tutor programme builders." on={isBuilderVisible} onChange={setIsBuilderVisible} />
                </div>
              </div>
            )}

            {activeTab === 'chart' && (
              <div className="auth-cs-tabbody">
                <div className="auth-cs-chart-toolbar">
                  <span className="auth-cs-field-label" style={{ margin: 0 }}>Chart tabs</span>
                  <span className="auth-cs-preview-pos" role="group" aria-label="Preview chart at position">
                    <span className="auth-cs-preview-pos-label">Preview at</span>
                    {(['off', 1, 2, 3, 4, 5, 6] as const).map((v) => (
                      <button key={String(v)} type="button" className={`auth-cs-preview-pos-btn${previewPos === v ? ' active' : ''}`} onClick={() => setPreviewPos(v)}>
                        {v === 'off' ? 'Off' : v}
                      </button>
                    ))}
                  </span>
                </div>

                <div className="cs-chart-layout">
                  <TabRail surface={surface} case_id={caseRow.case_id} tabs={tabs} activeTabId={activeChartTabId} onSelect={setActiveChartTabId} dirtyIds={dirtyTabIds} />
                  {activeChartTab && activeChartDraft ? (
                    <ActiveChartTabEditor
                      surface={surface}
                      case_id={caseRow.case_id}
                      tab={activeChartTab}
                      draft={activeChartDraft}
                      onDraftChange={(next) => updateDraft(activeChartTab.tab_id, next)}
                      previewPosition={previewPos === 'off' ? null : previewPos}
                    />
                  ) : (
                    <div className="cs-entries-pane">
                      <div className="cs-entries-empty">
                        <h4>This chart has no tabs yet</h4>
                        <p>Add a tab from the rail on the left to start.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="auth-cs-slot-rail-header">
              <span className="auth-cs-slot-rail-title">Question slots · {populated} of 6</span>
              <button className="auth-cs-btn subtle tiny" type="button">Reorder</button>
            </div>
            <div className="auth-cs-slot-rail">
              {slots.map((s) => (
                <SlotCard
                  key={s.position}
                  slot={s}
                  active={s.position === activeSlot}
                  cjmmValue={cjmmBySlot[s.position] ?? ''}
                  onCjmmChange={(value) => setCjmmBySlot((prev) => ({ ...prev, [s.position]: value }))}
                  onClick={() => onSlotClick(s.position)}
                  onDetach={() => onDetachSlot(s)}
                  detachPending={detachPending === s.position}
                />
              ))}
            </div>
            <button
              className="auth-cs-slot-add"
              type="button"
              onClick={openPickerForFirstEmpty}
              disabled={isPending || populated >= 6}
            >
              {populated >= 6 ? 'All 6 slots populated' : '+ Add question (next empty)'}
            </button>
          </div>
        )}

        {editorMode && (
          <div className="auth-cs-pane auth-cs-pane-left auth-cs-editor-pane">
            <div className="auth-cs-editor-header">
              <button type="button" className="auth-cs-btn subtle tiny" onClick={onCloseEditor}>← Wrapper view</button>
              <div className="auth-cs-slot-strip" role="tablist" aria-label="Switch question slot">
                {slots.map((s) => {
                  const isEmpty = s.item_id === null;
                  return (
                    <button
                      key={s.position}
                      type="button"
                      role="tab"
                      aria-selected={s.position === activeSlot}
                      className={
                        'auth-cs-slot-pip' +
                        (s.position === activeSlot ? ' active' : '') +
                        (isEmpty ? ' empty' : '') +
                        (editorDirtyByPos[s.position] ? ' dirty' : '')
                      }
                      onClick={() => onSlotStripClick(s.position)}
                      title={isEmpty ? `Add a question at Q${s.position}` : `Q${s.position}`}
                    >
                      Q{s.position}
                      {isEmpty && <span className="auth-cs-slot-pip-plus">+</span>}
                    </button>
                  );
                })}
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                {activeSlotData?.editor && (
                  <button
                    type="submit"
                    form={FORM_ID_BY_TYPE[activeSlotData.editor.kind]}
                    className="auth-cs-btn primary tiny"
                    disabled={activeSlotPending || !activeSlotDirty}
                  >
                    {activeSlotPending ? 'Saving…' : 'Save question'}
                  </button>
                )}
              </span>
            </div>

            <div className="auth-cs-editor-title">
              Q{activeSlot}
              {activeSlotData?.question_type && (
                <span className="auth-cs-editor-mounted-label" style={{ marginLeft: 8 }}>
                  {activeSlotData.question_type} editor
                </span>
              )}
            </div>

            {creating && creating.position === activeSlot ? (
              <ActiveQuestionEditorBody
                editor={creating.editor}
                error={activeSlotError}
                pending={activeSlotPending}
                onSubmit={onEditorBodySubmit}
                onDirty={onEditorBodyDirty}
                onErrorDismiss={() =>
                  setEditorErrorByPos((prev) => ({ ...prev, [activeSlot]: null }))
                }
              />
            ) : activeSlotData?.item_id === null ? (
              <div className="auth-cs-empty-msg" style={{ padding: 22, textAlign: 'center' }}>
                Slot Q{activeSlot} is empty. Click + Add question to fill it.
              </div>
            ) : activeSlotData?.editor ? (
              <ActiveQuestionEditorBody
                editor={activeSlotData.editor}
                error={activeSlotError}
                pending={activeSlotPending}
                onSubmit={onEditorBodySubmit}
                onDirty={onEditorBodyDirty}
                onErrorDismiss={() =>
                  setEditorErrorByPos((prev) => ({ ...prev, [activeSlot]: null }))
                }
              />
            ) : (
              <div className="auth-cs-empty-msg" style={{ padding: 22, textAlign: 'center' }}>
                Could not load the editor for Q{activeSlot} ({activeSlotData?.question_type}). Refresh and try again.
              </div>
            )}
          </div>
        )}

        <div className="auth-cs-pane auth-cs-pane-preview">
          <div className="auth-cs-pane-label">
            <span>Combined preview</span>
            <span className="auth-cs-preview-meta">
              As student at <strong>Q{activeSlot}</strong> · tracks active slot
            </span>
          </div>

          <div className="auth-cs-preview-section">
            <div className="auth-cs-preview-section-label">
              Chart context · what the student sees at Q{activeSlot}
            </div>
            {scenario && <p className="auth-cs-preview-scenario">{scenario}</p>}
            <div className="auth-cs-chart-tabs">
              {tabs.map((t) => (
                <button key={t.tab_id} type="button" className={`auth-cs-chart-tab${activeChartTabId === t.tab_id ? ' active' : ''}`} onClick={() => setActiveChartTabId(t.tab_id)}>
                  {t.title.length > 14 ? t.title.split(' ')[0] : t.title}
                </button>
              ))}
            </div>
            <div className="auth-cs-chart-content auth-cs-preview-chart">
              {activeChartTab ? (
                <PreviewChartView tab={activeChartTab} entries={previewEntries} />
              ) : (
                <p className="auth-cs-empty-msg">No tabs on this case.</p>
              )}
              {activeChartTab && previewEntries.length < (activeChartDraft?.entries ?? activeChartTab.entries).length && (
                <p className="auth-cs-preview-hidden-note">
                  {(activeChartDraft?.entries ?? activeChartTab.entries).length - previewEntries.length} entry/entries hidden — visible_from {'>'} Q{activeSlot}
                </p>
              )}
            </div>
          </div>

          <div className="auth-cs-preview-section">
            <div className="auth-cs-preview-section-label" style={{ marginBottom: 8 }}>
              Active question · Q{activeSlot}{activeSlotData?.question_type ? ` (${activeSlotData.question_type})` : ''}
            </div>

            {activeSlotData?.item_id === null ? (
              <p className="auth-cs-empty-msg">Slot is empty — nothing to preview.</p>
            ) : activeSlotData?.editor ? (
              <ActiveQuestionPreview
                editor={activeSlotData.editor}
                viewMode={questionMode}
                onViewModeChange={setQuestionMode}
              />
            ) : (
              <p className="auth-cs-empty-msg">Could not load preview for {activeSlotData?.question_type}.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// ActiveChartTabEditor — picks NarrativeTabEditor / StructuredTabEditor
// ───────────────────────────────────────────────────────────

function ActiveChartTabEditor({
  surface,
  case_id,
  tab,
  draft,
  onDraftChange,
  previewPosition,
}: {
  surface:         WrapperData['surface'];
  case_id:         string;
  tab:             TabRow;
  draft:           TabDraft;
  onDraftChange:   (next: TabDraft) => void;
  previewPosition: number | null;
}) {
  const builtIn = getTabType(tab.tab_key);
  const isNarrative =
    (builtIn && builtIn.shape === 'narrative') ||
    tab.tab_key === 'custom_narrative';
  const isStructured =
    (builtIn && builtIn.shape === 'structured') ||
    tab.tab_key === 'custom_grid';

  if (isNarrative) {
    return (
      <NarrativeTabEditor
        surface={surface}
        case_id={case_id}
        tab={tab}
        builtIn={builtIn}
        draftTitle={draft.title}
        draftEntries={draft.entries}
        onDraftChange={(p) => onDraftChange({ title: p.title, entries: p.entries, columns_def: draft.columns_def })}
        previewPosition={previewPosition}
      />
    );
  }
  if (isStructured) {
    return (
      <StructuredTabEditor
        surface={surface}
        case_id={case_id}
        tab={tab}
        builtIn={builtIn}
        draftTitle={draft.title}
        draftEntries={draft.entries}
        draftColumns={draft.columns_def}
        onDraftChange={(p) => onDraftChange({ title: p.title, entries: p.entries, columns_def: p.columns_def })}
        previewPosition={previewPosition}
      />
    );
  }
  return (
    <div className="cs-entries-pane">
      <div className="cs-entries-empty">
        <h4>Unknown tab type</h4>
        <p>This tab uses tab_key <code>{tab.tab_key}</code> which the editor doesn&apos;t recognise.</p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// ActiveQuestionEditorBody — 9-way switch on the slot's editor kind.
// Mounts the matching <XxxEditorBody>. Each body owns its internal
// form state; the wrapper page owns dirty tracking, error display
// (via ErrorToast inside the body), and the external Save question
// button (which submits the body's form via form= attribute).
// ───────────────────────────────────────────────────────────

function ActiveQuestionEditorBody({
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
    case 'MCQ':
      return <McqEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'TF':
      return <TfEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'SATA':
      return <SataEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'SELECT_N':
      return <SelectNEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'MATRIX':
      return <MatrixEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'BOWTIE':
      return <BowtieEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'CLOZE':
      return <ClozeEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'HIGHLIGHT':
      return <HighlightEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
    case 'DRAG_DROP':
      return <DragDropEditorBody initial={editor.initial} error={error} pending={pending} onSubmit={onSubmit} onDirty={onDirty} onErrorDismiss={onErrorDismiss} />;
  }
}

// ───────────────────────────────────────────────────────────
// ActiveQuestionPreview — mounts the matching exported preview
// component from each editor file (slice 12d). Reads from
// slot.editor.initial directly: this is the POST-SAVE snapshot
// (curator's in-flight typing isn't reflected here yet — that's
// a follow-up state-callback slice). The preview's own internal
// PreviewToggle handles the Student / Answer-key switch.
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
      // CLOZE preview needs derived state: markerOrder from the stem
      // and a Map of blanks keyed by id. Mirrors what ClozeEditorBody
      // does internally before it passes to ClozePreview.
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

// ───────────────────────────────────────────────────────────
// PreviewChartView — read-only render in the right pane.
// ───────────────────────────────────────────────────────────

function PreviewChartView({
  tab,
  entries,
}: {
  tab:     TabRow;
  entries: ChartEntry[];
}) {
  if (entries.length === 0) {
    return <p className="auth-cs-empty-msg">Nothing visible on this tab at this slot yet.</p>;
  }
  const isStructured =
    (!tab.is_custom && tab.columns_def.length > 0) ||
    (tab.is_custom && tab.custom_shape === 'rows_cols');
  if (isStructured) {
    return (
      <table className="auth-cs-vs-table">
        <thead><tr>{tab.columns_def.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
        <tbody>{entries.map((entry, idx) => (
          <tr key={idx}>{tab.columns_def.map((c) => <td key={c.id}>{String(entry[c.id] ?? '—')}</td>)}</tr>
        ))}</tbody>
      </table>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map((entry, idx) => {
        const time = (entry.time as string | undefined) ?? '';
        const body = (entry.body as string | undefined) ?? '';
        return (
          <div key={idx} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', fontSize: 12.5 }}>
            {time && <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginBottom: 2 }}>{time}</div>}
            <div style={{ lineHeight: 1.45 }}>{body}</div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// VisibilityRow + SlotCard
// ───────────────────────────────────────────────────────────

function VisibilityRow({ label, help, on, onChange }: { label: string; help: string; on: boolean; onChange: (next: boolean) => void; }) {
  return (
    <div className="auth-cs-vrow">
      <span className="auth-cs-vrow-label">{label}<span className="auth-cs-vrow-help">{help}</span></span>
      <button type="button" role="switch" aria-checked={on} className={`auth-cs-vswitch${on ? ' on' : ''}`} onClick={() => onChange(!on)} />
    </div>
  );
}

function SlotCard({
  slot,
  active,
  cjmmValue,
  onCjmmChange,
  onClick,
  onDetach,
  detachPending,
}: {
  slot:          SlotRow;
  active:        boolean;
  cjmmValue:     string;
  onCjmmChange:  (next: string) => void;
  onClick:       () => void;
  onDetach:      () => void;
  detachPending: boolean;
}) {
  const summary = slot.stem
    ? slot.stem.length > 80 ? slot.stem.slice(0, 77) + '…' : slot.stem
    : '';
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }
  const isEmpty = slot.item_id === null;
  return (
    <div
      className={'auth-cs-slot-card' + (active ? ' active' : '') + (isEmpty ? ' empty' : '')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
      title={isEmpty ? `Add a question at Q${slot.position}` : undefined}
    >
      <span className="auth-cs-slot-num">Q{slot.position}</span>
      <span className="auth-cs-slot-summary">
        {slot.question_type && <span className="auth-cs-type-chip">{slot.question_type}</span>}
        {isEmpty
          ? (
            <span className="auth-cs-slot-empty-hint">
              <span className="auth-cs-slot-empty-plus">+</span> Add question
            </span>
          )
          : summary
        }
      </span>
      {slot.item_id !== null ? (
        <select
          className="auth-cs-slot-cjmm-select"
          value={cjmmValue}
          onChange={(e) => onCjmmChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={`CJMM step for Q${slot.position}`}
          title={cjmmValue || 'Pick CJMM step'}
        >
          <option value="">—</option>
          {CJMM_STEPS.map((step) => (
            <option key={step} value={step}>{cjmmShort(step)} — {step}</option>
          ))}
        </select>
      ) : (
        <span style={{ width: 1 }} />
      )}
      <span className={`auth-cs-slot-status auth-cs-slot-status-${slot.item_id === null ? 'draft' : 'ok'}`} />
      {slot.item_id !== null && (
        <button
          type="button"
          className="auth-cs-slot-detach"
          onClick={(e) => {
            e.stopPropagation();
            onDetach();
          }}
          disabled={detachPending}
          aria-label={`Detach Q${slot.position} from this case`}
          title="Detach question (keeps it in the bank as standalone)"
        >
          {detachPending ? '…' : '×'}
        </button>
      )}
    </div>
  );
}
