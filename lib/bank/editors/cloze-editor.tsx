// mynclex/lib/bank/editors/cloze-editor.tsx
//
// CLOZE editor — seventh concrete editor in the rebuild. Sentence with
// inline {N} markers in the stem; one dropdown per blank with a per-
// blank list of choices.
//
// Two unique-to-CLOZE concerns vs the prior editors:
//   1. Live stem-marker parsing. The blanks panel reflects which
//      markers are currently in the stem. Removed-marker cards become
//      orphans (greyed out) instead of being deleted, so re-typing the
//      marker brings the same choices back.
//   2. Auto-renumbering on save. Gaps like {1}{3} get rewritten to
//      {1}{2} by parseCloze() — see lib/bank/parsers/cloze.ts for
//      the two-phase substitution that prevents collisions.
//
// Ships with the dual-mode preview (Student / Answer key) from day one
// per slice plan §11. Slice 7 BOWTIE introduced the <PreviewToggle>
// atom; CLOZE is the first editor to ship with it from scratch.
//
// FormData contract (must match save-question.ts CLOZE branch):
//   cloze_blank_id              (one per card, includes orphans)
//   cloze_blank_in_stem         (parallel: 'true' | 'false')
//   cloze_choice_id_<bid>       (repeated, per choice in that blank)
//   cloze_choice_text_<bid>     (parallel)
//   cloze_choice_feedback_<bid> (parallel)
//   cloze_correct_<bid>         (single value — the correct choice ID)

'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CLOZE_MIN_BLANKS,
  CLOZE_MAX_BLANKS,
  CLOZE_MIN_CHOICES,
  CLOZE_MAX_CHOICES,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { StemField } from '@/lib/bank/atoms/stem-field';
import { InstructionField } from '@/lib/bank/atoms/instruction-field';
import { RationaleFields } from '@/lib/bank/atoms/rationale-fields';
import { ClassificationFields } from '@/lib/bank/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/bank/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/bank/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/bank/atoms/discard-confirm';
import { DeleteConfirm } from '@/lib/bank/atoms/delete-confirm';
import { ErrorToast } from '@/lib/bank/atoms/error-toast';
import {
  PreviewToggle,
  type PreviewViewMode,
} from '@/lib/bank/atoms/preview-toggle';
import { useSaveAction } from '@/lib/bank/hooks/use-save-action';
import { useDirtyGuard } from '@/lib/bank/hooks/use-dirty-guard';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/bank/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/bank/actions/delete-question';
import type {
  ClozeEditorInitial,
  ClozeEditorBlank,
  ClozeEditorChoice,
} from './cloze-row-mapper';

export type { ClozeEditorInitial };

const MARKER_RE = /\{(\d+)\}/g;
const STEM_DOM_ID = 'bank-stem';
const FORM_ID = 'auth-cloze-form';

type ValidityState = 'ok' | 'warn' | 'err';

// ─────────────────────────────────────────────────────────────
// Helpers (private).
// ─────────────────────────────────────────────────────────────

export function parseStemMarkers(value: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(value)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function blankValidity(blank: ClozeEditorBlank): ValidityState {
  const filled = blank.choices.filter((c) => c.text.trim()).length;
  if (filled < CLOZE_MIN_CHOICES) return 'err';
  if (filled > CLOZE_MAX_CHOICES) return 'err';
  // Correct choice must reference one of the filled ones.
  const correctChoice = blank.choices.find((c) => c.id === blank.correct_id);
  if (!correctChoice || !correctChoice.text.trim()) return 'warn';
  return 'ok';
}

function contentValidity(args: {
  stemEmpty: boolean;
  markerCount: number;
  activeBlanks: ClozeEditorBlank[];
}): ValidityState {
  if (args.stemEmpty) return 'err';
  if (args.markerCount < CLOZE_MIN_BLANKS) return 'err';
  if (args.markerCount > CLOZE_MAX_BLANKS) return 'err';
  if (args.activeBlanks.some((b) => blankValidity(b) === 'err')) return 'err';
  if (args.activeBlanks.some((b) => blankValidity(b) === 'warn')) return 'warn';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────
// ClozePreview — dual-mode preview rendered in the right pane.
// Student view: <select> placeholders inline, no preselection.
// Answer-key view: same <select>s with correct choice preselected
// and a CSS modifier highlighting the picked option.
// ─────────────────────────────────────────────────────────────

interface ClozePreviewProps {
  instruction: string;
  stem: string;
  markerOrder: number[];
  blanksById: Map<string, ClozeEditorBlank>;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function ClozePreview({
  instruction,
  stem,
  markerOrder,
  blanksById,
  viewMode,
  onViewModeChange,
}: ClozePreviewProps) {
  // Split the stem at each {N} into alternating text and select chunks.
  // matchAll is stateless — never mutates MARKER_RE.lastIndex.
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let chipKey = 0;

  if (stem.trim() === '') {
    parts.push(
      <em key="placeholder" className="auth-cz-preview-placeholder">
        Type the sentence above with {'{1}'}, {'{2}'}, … markers. Each
        marker becomes a dropdown here.
      </em>,
    );
  } else {
    for (const m of stem.matchAll(MARKER_RE)) {
      const idx = m.index ?? 0;
      const text = stem.slice(cursor, idx);
      if (text) {
        parts.push(<span key={`t${cursor}`}>{text}</span>);
      }
      const n = parseInt(m[1], 10);
      const positional = markerOrder.indexOf(n);
      const displayN = positional >= 0 ? positional + 1 : n;
      const card = blanksById.get(`b${n}`);
      const correctChoice = card?.choices.find((c) => c.id === card.correct_id);
      const filledChoices = (card?.choices ?? []).filter((c) => c.text.trim());

      parts.push(
        <span
          key={`pill${chipKey++}`}
          className={
            'auth-cz-preview-blank' +
            (viewMode === 'answer-key' ? ' auth-cz-preview-blank-answer' : '')
          }
        >
          <span className="auth-cz-preview-blank-num">{displayN}</span>
          <select
            className="auth-cz-preview-select"
            value={
              viewMode === 'answer-key' && correctChoice?.text.trim()
                ? correctChoice.id
                : ''
            }
            onChange={() => undefined /* preview only — not form-bound */}
            aria-label={`Blank ${displayN}`}
          >
            <option value="" disabled>
              {viewMode === 'student' ? 'Select…' : '(no answer)'}
            </option>
            {filledChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.text}
              </option>
            ))}
          </select>
        </span>,
      );
      cursor = idx + m[0].length;
    }
    const tail = stem.slice(cursor);
    if (tail) {
      parts.push(<span key="tail">{tail}</span>);
    }
  }

  const headerText =
    viewMode === 'answer-key'
      ? 'Answer key · curator view'
      : 'Pre-submit · student view';

  return (
    <div className="auth-preview-card">
      <div className="auth-preview-card-header">
        <div className="auth-preview-card-header-text">{headerText}</div>
        <PreviewToggle value={viewMode} onChange={onViewModeChange} />
      </div>
      <div className="auth-preview-card-body">
        {instruction.trim() && (
          <p className="auth-cz-preview-instruction">{instruction}</p>
        )}
        <div className="auth-cz-preview-sentence">{parts}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BlankCard — one card per blank. Renders the choice list with
// radio (correct) / text / feedback / remove. Active vs orphan
// styling differs (orphan greyed + warning strip).
// ─────────────────────────────────────────────────────────────

interface BlankCardProps {
  blank: ClozeEditorBlank;
  displayNumber: number | null;
  isOrphan: boolean;
  disabled: boolean;
  onAddChoice: () => void;
  onRemoveChoice: (cid: string) => void;
  onChoiceText: (cid: string, text: string) => void;
  onChoiceFeedback: (cid: string, fb: string) => void;
  onCorrect: (cid: string) => void;
}

function BlankCard({
  blank,
  displayNumber,
  isOrphan,
  disabled,
  onAddChoice,
  onRemoveChoice,
  onChoiceText,
  onChoiceFeedback,
  onCorrect,
}: BlankCardProps) {
  const n = parseInt(blank.id.slice(1), 10);
  const valid = blankValidity(blank);
  const filled = blank.choices.filter((c) => c.text.trim()).length;
  const counterText = `${filled}/${blank.choices.length} filled`;
  const counterClass =
    filled < CLOZE_MIN_CHOICES ? 'err' : filled > CLOZE_MAX_CHOICES ? 'err' : 'ok';

  return (
    <div
      className={
        'auth-cz-blank-card' +
        (isOrphan ? ' auth-cz-blank-card-orphan' : '') +
        ` auth-cz-blank-card-${valid}`
      }
    >
      <div className="auth-cz-blank-head">
        <div className="auth-cz-blank-title">
          {!isOrphan && (
            <span className="auth-cz-blank-number">{displayNumber ?? n}</span>
          )}
          <span className="auth-cz-blank-name">
            {isOrphan ? `Blank {${n}} — not in stem` : `Blank ${displayNumber ?? n}`}
          </span>
          {isOrphan && (
            <span className="auth-cz-orphan-badge">will be dropped on save</span>
          )}
        </div>
        <span className={`auth-cz-blank-counter auth-cz-${counterClass}`}>
          {counterText}
        </span>
      </div>

      {isOrphan && (
        <p className="auth-cz-orphan-tip">
          Re-type <code>{`{${n}}`}</code> in the stem to reconnect this
          card. Otherwise its choices are discarded when saved.
        </p>
      )}

      <div className="auth-cz-blank-body">
        {blank.choices.map((c) => (
          <div
            key={c.id}
            className={
              'auth-cz-choice' +
              (c.id === blank.correct_id ? ' auth-cz-choice-correct' : '')
            }
          >
            <div className="auth-cz-choice-correct-cell">
              <input
                type="radio"
                name={`auth-cz-correct-radio-${blank.id}`}
                checked={c.id === blank.correct_id}
                onChange={() => onCorrect(c.id)}
                disabled={disabled}
                aria-label="Mark as correct"
              />
            </div>
            <div className="auth-cz-choice-fields">
              <input
                type="text"
                className="auth-input auth-cz-choice-text"
                value={c.text}
                onChange={(e) => onChoiceText(c.id, e.target.value)}
                placeholder="Choice text (what the student picks)…"
                disabled={disabled}
              />
              <input
                type="text"
                className="auth-input auth-cz-choice-feedback"
                value={c.feedback}
                onChange={(e) => onChoiceFeedback(c.id, e.target.value)}
                placeholder="Per-choice feedback (optional)…"
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              className="auth-cz-choice-remove"
              onClick={() => onRemoveChoice(c.id)}
              disabled={disabled || blank.choices.length <= CLOZE_MIN_CHOICES}
              aria-label="Remove choice"
              title="Remove choice"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          className="auth-cz-blank-add-choice"
          onClick={onAddChoice}
          disabled={disabled || blank.choices.length >= CLOZE_MAX_CHOICES}
        >
          + Add choice
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HiddenSerialisers — emit FormData inputs for every blank
// (active + orphan), so toggling a blank's marker mid-session
// doesn't drop its choices. save-question.ts filters out
// in_stem='false' before calling parseCloze.
// ─────────────────────────────────────────────────────────────

function HiddenSerialisers({ blanks }: { blanks: ClozeEditorBlank[] }) {
  return (
    <>
      {blanks.map((b) => (
        <Fragment key={`hid-${b.id}`}>
          <input type="hidden" name="cloze_blank_id" value={b.id} />
          <input
            type="hidden"
            name="cloze_blank_in_stem"
            value={String(b.in_stem)}
          />
          <input
            type="hidden"
            name={`cloze_correct_${b.id}`}
            value={b.correct_id}
          />
          {b.choices.map((c) => (
            <Fragment key={`hid-${b.id}-${c.id}`}>
              <input
                type="hidden"
                name={`cloze_choice_id_${b.id}`}
                value={c.id}
              />
              <input
                type="hidden"
                name={`cloze_choice_text_${b.id}`}
                value={c.text}
              />
              <input
                type="hidden"
                name={`cloze_choice_feedback_${b.id}`}
                value={c.feedback}
              />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ClozeEditorBody — two-pane edit + preview body. Mountable
// anywhere (modal host or sandbox).
// ─────────────────────────────────────────────────────────────

export interface ClozeEditorBodyProps {
  initial: ClozeEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function ClozeEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: ClozeEditorBodyProps) {
  const [tab, setTab] = useState<
    'content' | 'classification' | 'housekeeping'
  >('content');
  const [clientError, setClientError] = useState<string | null>(null);
  // CLOZE defaults to 'student' — the curator usually checks "does the
  // sentence read right with dropdowns?" before flipping to answer-key.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');

  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [blanks, setBlanks] = useState<ClozeEditorBlank[]>(initial.blanks);
  const [category, setCategory] = useState(initial.client_needs_category);

  // The blanks editor is paned: only one blank's choice card renders
  // at a time, with a tab strip above letting the curator switch.
  // Initial active = first active blank when editing existing rows;
  // null on a fresh create flow (the first +Add blank click sets it).
  const [activeBlankId, setActiveBlankId] = useState<string | null>(() => {
    const firstActive = initial.blanks.find((b) => b.in_stem);
    return firstActive?.id ?? initial.blanks[0]?.id ?? null;
  });

  // Derive marker order + in_stem mapping from current stem state.
  // Re-flag every blank's in_stem when the stem changes.
  const markerOrder = useMemo(() => parseStemMarkers(stem), [stem]);
  const presentSet = useMemo(
    () => new Set(markerOrder.map((n) => `b${n}`)),
    [markerOrder],
  );
  const blanksWithInStem = useMemo(
    () => blanks.map((b) => ({ ...b, in_stem: presentSet.has(b.id) })),
    [blanks, presentSet],
  );

  const blanksById = useMemo(
    () => new Map(blanksWithInStem.map((b) => [b.id, b])),
    [blanksWithInStem],
  );
  const activeBlanks = blanksWithInStem.filter((b) => b.in_stem);
  const orphanBlanks = blanksWithInStem.filter((b) => !b.in_stem);

  // Keep activeBlankId pointing at a blank that still exists in
  // state. When the curator clicks Clear all (blanks goes empty) or
  // some other path removes the active blank from state entirely,
  // jump to the first active blank, falling back to first orphan,
  // falling back to null. We do NOT auto-switch when a blank merely
  // turns into an orphan — staying on the orphan view makes "your
  // marker is gone" obvious to the curator.
  useEffect(() => {
    if (activeBlankId === null) {
      if (blanksWithInStem.length > 0) {
        const first = blanksWithInStem.find((b) => b.in_stem) ?? blanksWithInStem[0];
        setActiveBlankId(first.id);
      }
      return;
    }
    const stillExists = blanksWithInStem.some((b) => b.id === activeBlankId);
    if (!stillExists) {
      const first = blanksWithInStem.find((b) => b.in_stem) ?? blanksWithInStem[0];
      setActiveBlankId(first?.id ?? null);
    }
  }, [blanksWithInStem, activeBlankId]);

  const activeBlank = blanksWithInStem.find((b) => b.id === activeBlankId) ?? null;

  const validity = contentValidity({
    stemEmpty: !stem.trim(),
    markerCount: markerOrder.length,
    activeBlanks,
  });
  const contentIncomplete = validity !== 'ok';
  const classificationIncomplete = !category;

  // Marker counter shown on the toolbar.
  const counterText = `${markerOrder.length} blank${markerOrder.length === 1 ? '' : 's'}`;
  const counterClass: ValidityState =
    markerOrder.length === 0
      ? 'err'
      : markerOrder.length < CLOZE_MIN_BLANKS
        ? 'warn'
        : markerOrder.length > CLOZE_MAX_BLANKS
          ? 'err'
          : 'ok';

  // ─────────────────────────────────────────────────────────────
  // Toolbar actions
  // ─────────────────────────────────────────────────────────────

  function handleAddBlank() {
    if (markerOrder.length >= CLOZE_MAX_BLANKS) {
      window.alert(`Maximum ${CLOZE_MAX_BLANKS} blanks per question.`);
      return;
    }

    // Lowest-unused marker number (skipping any already in stem).
    const presentNs = new Set(markerOrder);
    let nextN = 1;
    while (presentNs.has(nextN)) nextN++;

    // Read cursor position from the DOM textarea (id="bank-stem"
    // is set on the StemField atom for exactly this).
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    const cursorPos = stemEl?.selectionStart ?? stem.length;
    const before = stem.slice(0, cursorPos);
    const after = stem.slice(cursorPos);
    const needsLeadingSpace = cursorPos > 0 && !/\s$/.test(before);
    const insert = `${needsLeadingSpace ? ' ' : ''}{${nextN}}`;
    const nextStem = `${before}${insert}${after}`;
    setStem(nextStem);

    // Reuse an existing card with the same id (orphan) if present,
    // otherwise create a fresh card with CLOZE_MIN_CHOICES empty choices.
    setBlanks((prev) => {
      const existing = prev.find((b) => b.id === `b${nextN}`);
      if (existing) {
        // Already in state — in_stem flag will recompute from the stem
        // change above. Nothing to do here.
        return prev;
      }
      return [
        ...prev,
        {
          id: `b${nextN}`,
          choices: Array.from({ length: CLOZE_MIN_CHOICES }, (_, i) => ({
            id: `c${i + 1}`,
            text: '',
            feedback: '',
          })),
          correct_id: 'c1',
          in_stem: true,
        },
      ];
    });

    // Switch the paned editor to the new blank so the curator can
    // start filling its choices immediately.
    setActiveBlankId(`b${nextN}`);

    // Restore focus + cursor after React commits.
    requestAnimationFrame(() => {
      const el = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
      if (!el) return;
      const newCursor = before.length + insert.length;
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    });

    onDirty?.();
  }

  function handleClearAll() {
    if (
      !window.confirm(
        'Remove all blanks from the stem and discard their choices? This cannot be undone without re-typing them.',
      )
    ) {
      return;
    }
    const cleaned = stem.replace(MARKER_RE, '').replace(/ +/g, ' ').trim();
    setStem(cleaned);
    setBlanks([]);
    setActiveBlankId(null);
    onDirty?.();
  }

  // ─────────────────────────────────────────────────────────────
  // Per-blank mutations
  // ─────────────────────────────────────────────────────────────

  function updateBlank(blankId: string, mut: (b: ClozeEditorBlank) => ClozeEditorBlank) {
    setBlanks((prev) => prev.map((b) => (b.id === blankId ? mut(b) : b)));
  }

  function addChoice(blankId: string) {
    updateBlank(blankId, (b) => {
      if (b.choices.length >= CLOZE_MAX_CHOICES) return b;
      const used = new Set(b.choices.map((c) => c.id));
      let n = 1;
      while (used.has(`c${n}`)) n++;
      return {
        ...b,
        choices: [...b.choices, { id: `c${n}`, text: '', feedback: '' }],
      };
    });
  }

  function removeChoice(blankId: string, choiceId: string) {
    updateBlank(blankId, (b) => {
      if (b.choices.length <= CLOZE_MIN_CHOICES) return b;
      const nextChoices = b.choices.filter((c) => c.id !== choiceId);
      const nextCorrect =
        b.correct_id === choiceId ? nextChoices[0].id : b.correct_id;
      return { ...b, choices: nextChoices, correct_id: nextCorrect };
    });
  }

  function setChoiceText(blankId: string, choiceId: string, text: string) {
    updateBlank(blankId, (b) => ({
      ...b,
      choices: b.choices.map((c) =>
        c.id === choiceId ? { ...c, text } : c,
      ),
    }));
  }

  function setChoiceFeedback(blankId: string, choiceId: string, feedback: string) {
    updateBlank(blankId, (b) => ({
      ...b,
      choices: b.choices.map((c) =>
        c.id === choiceId ? { ...c, feedback } : c,
      ),
    }));
  }

  function setCorrect(blankId: string, choiceId: string) {
    updateBlank(blankId, (b) => ({ ...b, correct_id: choiceId }));
  }

  // ─────────────────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (contentIncomplete) {
      setTab('content');
      setClientError('Fill in the required fields on Content to continue.');
      return;
    }
    if (classificationIncomplete) {
      setTab('classification');
      setClientError('Pick a Client Needs category to continue.');
      return;
    }
    setClientError(null);
    onSubmit(new FormData(e.currentTarget));
  }

  function dismissError() {
    setClientError(null);
    onErrorDismiss?.();
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      noValidate
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs
        type="CLOZE"
        itemId={initial.itemId}
        surface={initial.surface}
      />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <div className="auth-split">
        <div className="auth-edit">
          <EditorTabs
            tabs={[
              {
                id: 'content',
                label: 'Content',
                incomplete: contentIncomplete,
              },
              {
                id: 'classification',
                label: 'Classification',
                incomplete: classificationIncomplete,
              },
              { id: 'housekeeping', label: 'Housekeeping' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as typeof tab)}
          >
            <TabPanel id="content">
              <InstructionField
                value={instruction}
                onChange={setInstruction}
              />
              <StemField value={stem} onChange={setStem} />

              <div className="auth-fg">
                <div className="auth-label-row">
                  <label className="auth-label">Cloze blanks *</label>
                </div>
                <p className="auth-hint">
                  Type the sentence above. Use <code>{'{1}'}</code>,{' '}
                  <code>{'{2}'}</code>, … markers, or click{' '}
                  <strong>+ Add blank</strong> to insert the next one at
                  the cursor. Gaps like <code>{'{1} {3}'}</code> are
                  auto-renumbered to <code>{'{1} {2}'}</code> on save.
                </p>

                <div className="auth-cz-toolbar">
                  <button
                    type="button"
                    className="auth-btn auth-btn-primary"
                    onClick={handleAddBlank}
                    disabled={pending || markerOrder.length >= CLOZE_MAX_BLANKS}
                  >
                    + Add blank
                  </button>
                  <button
                    type="button"
                    className="auth-btn auth-btn-ghost"
                    onClick={handleClearAll}
                    disabled={pending || (markerOrder.length === 0 && blanks.length === 0)}
                  >
                    Clear all blanks
                  </button>
                  <span className={`auth-cz-marker-count auth-cz-${counterClass}`}>
                    {counterText}
                  </span>
                </div>

                {/* Tab strip — one tab per blank (active first, then
                    orphans). Status dot reflects per-blank validity. */}
                {blanksWithInStem.length > 0 && (
                  <div className="auth-cz-tabs" role="tablist">
                    {activeBlanks.map((b) => {
                      const stemPosition = markerOrder.indexOf(parseInt(b.id.slice(1), 10));
                      const valid = blankValidity(b);
                      const isActive = b.id === activeBlankId;
                      return (
                        <button
                          type="button"
                          role="tab"
                          key={b.id}
                          aria-selected={isActive}
                          className={
                            'auth-cz-tab' +
                            (isActive ? ' auth-cz-tab-active' : '')
                          }
                          onClick={() => setActiveBlankId(b.id)}
                          disabled={pending}
                        >
                          <span className={`auth-cz-tab-dot auth-cz-${valid}`} />
                          Blank {stemPosition >= 0 ? stemPosition + 1 : '?'}
                        </button>
                      );
                    })}
                    {orphanBlanks.map((b) => {
                      const n = parseInt(b.id.slice(1), 10);
                      const isActive = b.id === activeBlankId;
                      return (
                        <button
                          type="button"
                          role="tab"
                          key={b.id}
                          aria-selected={isActive}
                          className={
                            'auth-cz-tab auth-cz-tab-orphan' +
                            (isActive ? ' auth-cz-tab-active' : '')
                          }
                          onClick={() => setActiveBlankId(b.id)}
                          disabled={pending}
                          title="This blank's marker is no longer in the stem. Click to view; re-type the marker in the stem to reconnect."
                        >
                          <span className="auth-cz-tab-dot auth-cz-warn" />
                          {`{${n}}`} · orphan
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Single active blank panel (or empty state). */}
                <div className="auth-cz-blank-panel-wrap">
                  {blanksWithInStem.length === 0 ? (
                    <div className="auth-cz-blank-empty">
                      No blanks yet. Click{' '}
                      <strong>+ Add blank</strong> above to create your
                      first one.
                    </div>
                  ) : activeBlank ? (
                    <BlankCard
                      key={activeBlank.id}
                      blank={activeBlank}
                      displayNumber={
                        activeBlank.in_stem
                          ? markerOrder.indexOf(parseInt(activeBlank.id.slice(1), 10)) + 1
                          : null
                      }
                      isOrphan={!activeBlank.in_stem}
                      disabled={pending}
                      onAddChoice={() => addChoice(activeBlank.id)}
                      onRemoveChoice={(cid) => removeChoice(activeBlank.id, cid)}
                      onChoiceText={(cid, text) =>
                        setChoiceText(activeBlank.id, cid, text)
                      }
                      onChoiceFeedback={(cid, fb) =>
                        setChoiceFeedback(activeBlank.id, cid, fb)
                      }
                      onCorrect={(cid) => setCorrect(activeBlank.id, cid)}
                    />
                  ) : null}
                </div>

                {/* Hidden serialisers — every card (incl. orphans) so
                    FormData round-trips orphan toggling. save-question.ts
                    filters out in_stem='false' before calling parseCloze. */}
                <HiddenSerialisers blanks={blanksWithInStem} />
              </div>

              <RationaleFields
                defaultRationale={initial.rationale}
                defaultRationaleImg={initial.rationale_img}
              />
            </TabPanel>

            <TabPanel id="classification">
              <ClassificationFields
                category={category}
                onCategoryChange={setCategory}
                defaults={{
                  client_needs_subcategory: initial.client_needs_subcategory,
                  nursing_subject: initial.nursing_subject,
                  body_system: initial.body_system,
                  topic: initial.topic,
                  subtopic: initial.subtopic,
                  difficulty: initial.difficulty,
                  bloom_level: initial.bloom_level,
                  tags: initial.tags,
                }}
              />
            </TabPanel>

            <TabPanel id="housekeeping">
              <HousekeepingFields
                mode={initial.mode}
                defaults={{
                  marks: initial.marks,
                  question_ref: initial.question_ref,
                  batch_id: initial.batch_id,
                  is_published: initial.is_published,
                  is_free_sample: initial.is_free_sample,
                  is_builder_visible: initial.is_builder_visible,
                  shuffle_options: initial.shuffle_options,
                }}
              />
            </TabPanel>
          </EditorTabs>
        </div>

        <div className="auth-preview">
          <ClozePreview
            instruction={instruction}
            stem={stem}
            markerOrder={markerOrder}
            blanksById={blanksById}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// ClozeEditor — default standalone modal host. Same wiring as
// the other editors.
// ─────────────────────────────────────────────────────────────

export interface ClozeEditorProps {
  initial: ClozeEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function ClozeEditor({
  initial,
  onClose,
  onSaved,
  onDeleted,
}: ClozeEditorProps) {
  const isEdit = initial.itemId !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const guard = useDirtyGuard({
    onClose,
    onSaveAndClose: () => {
      const form = document.getElementById(FORM_ID);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    },
  });

  const save = useSaveAction<SaveResult>(saveQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onSaved?.({ item_id: result.item_id, created: result.created });
        onClose();
      }
    },
  });

  const del = useSaveAction<DeleteResult>(deleteQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onDeleted?.(result.item_id);
        onClose();
      }
    },
  });

  const pending = save.pending || del.pending;
  const error = save.error ?? del.error;

  function startDelete() {
    setConfirmingDelete(true);
    setDeleteText('');
    save.clearError();
    del.clearError();
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteText('');
  }

  function confirmDelete() {
    if (!initial.itemId) return;
    if (deleteText !== 'DELETE') return;
    const fd = new FormData();
    fd.set('item_id', initial.itemId);
    fd.set('surface', initial.surface);
    del.submit(fd);
  }

  return (
    <ModalFrame
      title={isEdit ? `Edit Cloze — ${initial.itemId}` : 'New Cloze question'}
      onClose={pending ? () => undefined : guard.requestClose}
      actions={
        <EditorActions
          canDelete={isEdit}
          pending={pending || confirmingDelete || guard.confirming}
          onCancel={guard.requestClose}
          onDelete={isEdit ? startDelete : undefined}
          formId={FORM_ID}
        />
      }
    >
      {guard.confirming && (
        <DiscardConfirm
          onKeepEditing={guard.keepEditing}
          onDiscard={guard.discardAndClose}
          onSaveAndClose={guard.saveAndClose}
          pending={save.pending}
        />
      )}
      {confirmingDelete && initial.itemId && (
        <DeleteConfirm
          itemId={initial.itemId}
          deleteText={deleteText}
          pending={del.pending}
          onTextChange={setDeleteText}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
      <ClozeEditorBody
        initial={initial}
        error={error}
        pending={pending}
        onSubmit={save.submit}
        onDirty={guard.markDirty}
        onErrorDismiss={() => {
          save.clearError();
          del.clearError();
        }}
      />
    </ModalFrame>
  );
}

// Suppress unused-type linter for the Choice type re-export — it's
// part of the public surface even when not referenced in this file.
export type { ClozeEditorChoice };
