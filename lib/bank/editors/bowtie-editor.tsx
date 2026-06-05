// mynclex/lib/bank/editors/bowtie-editor.tsx
//
// BOWTIE editor — sixth concrete editor in the rebuild. Three
// independent wings (Left / Centre / Right), each with its own
// label, own token pool, and own correct-count target. NCLEX bow-tie
// scoring: pick exactly 2 left + 1 centre + 2 right = 5 correct.
//
// UX:
//   - Two-pane split (consistent with all other editors). Left pane
//     holds the wings editor; right pane holds the answer-key preview.
//   - The wings editor itself is tab-based: only one wing's panel
//     renders at a time. Tabs carry status dots (green/amber/red)
//     based on per-wing validity.
//   - Hidden inputs for ALL three wings are emitted regardless of
//     which tab is active, so switching tabs and saving doesn't
//     drop inactive wings' data.
//   - Capacity enforcement is soft on Left/Right (ticking a 3rd
//     auto-unticks the oldest); strict on Centre (radio semantics).
//
// FormData contract (must match parseBowtie() byte-for-byte):
//   bowtie_left_label / bowtie_centre_label / bowtie_right_label
//   bowtie_<wing>_token_id        (parallel arrays per wing)
//   bowtie_<wing>_token_text      (parallel)
//   bowtie_<wing>_token_feedback  (parallel)
//   bowtie_left_correct           (repeated, one per ticked left token)
//   bowtie_right_correct          (repeated, one per ticked right token)
//   bowtie_centre_correct         (single value, the radio-picked id)

'use client';

import { Fragment, useState } from 'react';
import {
  BT_LEFT_CORRECT,
  BT_CENTRE_CORRECT,
  BT_RIGHT_CORRECT,
  BT_WING_MAX_TOKENS,
  BT_LEFT_PRESETS,
  BT_CENTRE_PRESETS,
  BT_RIGHT_PRESETS,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { EditorAuthorship } from '@/lib/audit/authorship-line';
import { StemField } from '@/lib/bank/atoms/stem-field';
import { InstructionField } from '@/lib/bank/atoms/instruction-field';
import { RationaleFields } from '@/lib/bank/atoms/rationale-fields';
import { ClassificationFields } from '@/lib/bank/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/bank/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/bank/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { DeleteConfirm } from '@/lib/overlays/bank/delete-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
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
  BowtieEditorInitial,
  BowtieEditorToken,
} from './bowtie-row-mapper';

export type { BowtieEditorInitial };

type WingKey = 'left' | 'centre' | 'right';
type ValidityState = 'ok' | 'warn' | 'err';

// ─────────────────────────────────────────────────────────────
// Small helpers (private).
// ─────────────────────────────────────────────────────────────

function tokenIdPrefix(wing: WingKey): 'lt' | 'ct' | 'rt' {
  return wing === 'left' ? 'lt' : wing === 'centre' ? 'ct' : 'rt';
}

function validWing(tokens: BowtieEditorToken[], required: number): ValidityState {
  const correctCount = tokens.filter((t) => t.correct).length;
  const filledCount = tokens.filter((t) => t.text.trim()).length;
  if (correctCount === required && filledCount >= required) return 'ok';
  if (correctCount > required || filledCount === 0) return 'err';
  return 'warn';
}

// ─────────────────────────────────────────────────────────────
// WingPanel — the editor for a single wing (private).
// Only renders when its tab is active; HiddenSerialisers takes
// care of inactive wings' form-data persistence.
// ─────────────────────────────────────────────────────────────

interface WingPanelProps {
  wingKey: WingKey;
  title: string;
  subtitle: string;
  presets: readonly string[];
  requiredCorrect: number;
  useRadio: boolean;
  label: string;
  tokens: BowtieEditorToken[];
  disabled: boolean;
  onLabelChange: (next: string) => void;
  onTokensChange: (next: BowtieEditorToken[]) => void;
}

function WingPanel({
  wingKey,
  title,
  subtitle,
  presets,
  requiredCorrect,
  useRadio,
  label,
  tokens,
  disabled,
  onLabelChange,
  onTokensChange,
}: WingPanelProps) {
  const prefix = tokenIdPrefix(wingKey);

  function nextId(): string {
    const used = new Set(tokens.map((t) => t.id));
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  }

  function addToken() {
    if (tokens.length >= BT_WING_MAX_TOKENS) return;
    onTokensChange([
      ...tokens,
      { id: nextId(), text: '', feedback: '', correct: false },
    ]);
  }

  function removeToken(idx: number) {
    if (tokens.length <= requiredCorrect) return;
    onTokensChange(tokens.filter((_, i) => i !== idx));
  }

  function updateText(idx: number, text: string) {
    onTokensChange(tokens.map((t, i) => (i === idx ? { ...t, text } : t)));
  }

  function updateFeedback(idx: number, feedback: string) {
    onTokensChange(tokens.map((t, i) => (i === idx ? { ...t, feedback } : t)));
  }

  function toggleCorrect(idx: number) {
    if (useRadio) {
      // Radio: picking one clears all others.
      onTokensChange(tokens.map((t, i) => ({ ...t, correct: i === idx })));
      return;
    }
    // Checkbox with soft cap: if already at requiredCorrect and the
    // user ticks a NEW one, auto-untick the oldest currently picked.
    const picked = tokens.filter((t) => t.correct);
    if (!tokens[idx].correct && picked.length >= requiredCorrect) {
      const firstPickedIdx = tokens.findIndex((t) => t.correct);
      onTokensChange(
        tokens.map((t, i) => {
          if (i === firstPickedIdx) return { ...t, correct: false };
          if (i === idx) return { ...t, correct: true };
          return t;
        }),
      );
      return;
    }
    onTokensChange(tokens.map((t, i) => (i === idx ? { ...t, correct: !t.correct } : t)));
  }

  const correctCount = tokens.filter((t) => t.correct).length;
  const counterClass: ValidityState =
    correctCount === requiredCorrect ? 'ok' :
    correctCount < requiredCorrect ? 'warn' : 'err';
  const counterText = `${correctCount} of ${requiredCorrect}${correctCount === requiredCorrect ? ' ✓' : ''}`;

  // Wing-label preset combo. Selecting a preset fills the input;
  // typing custom text leaves the select on "__custom__".
  const selectValue = presets.includes(label) ? label : '__custom__';

  return (
    <div className={`auth-bt-wing-card auth-bt-wing-${wingKey}`}>
      <div className="auth-bt-wing-head">
        <div className="auth-bt-wing-title">
          <div className="auth-bt-wing-title-label">{title}</div>
          <div className="auth-bt-wing-title-sub">{subtitle}</div>
        </div>

        <div className="auth-bt-wing-label-picker">
          <div className="auth-bt-label-sm">Label shown to student</div>
          <div className="auth-bt-label-picker-row">
            <select
              value={selectValue}
              onChange={(e) => {
                if (e.target.value !== '__custom__') onLabelChange(e.target.value);
              }}
              disabled={disabled}
            >
              {presets.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
            <input
              type="text"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="Or type your own…"
              disabled={disabled}
            />
          </div>
        </div>

        <div className={`auth-bt-wing-counter auth-bt-${counterClass}`}>{counterText}</div>
      </div>

      <div className="auth-bt-wing-body">
        {tokens.map((tk, idx) => (
          <div key={tk.id} className="auth-bt-wing-token">
            <div className="auth-bt-wing-token-correct">
              <input
                type={useRadio ? 'radio' : 'checkbox'}
                name={useRadio ? `auth_bt_${wingKey}_correct_radio` : undefined}
                checked={tk.correct}
                onChange={() => toggleCorrect(idx)}
                disabled={disabled}
                title="Mark as correct"
              />
            </div>
            <div className="auth-bt-wing-token-fields">
              <input
                type="text"
                value={tk.text}
                onChange={(e) => updateText(idx, e.target.value)}
                placeholder="Token text (what the student sees)…"
                disabled={disabled}
                className="auth-input"
              />
              <input
                type="text"
                value={tk.feedback}
                onChange={(e) => updateFeedback(idx, e.target.value)}
                placeholder="Per-token feedback (optional)…"
                disabled={disabled}
                className="auth-input auth-input--sm"
              />
            </div>
            <button
              type="button"
              className="auth-row-remove"
              onClick={() => removeToken(idx)}
              disabled={disabled || tokens.length <= requiredCorrect}
              title="Remove token"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="auth-bt-wing-add">
          <button
            type="button"
            className="auth-link-btn"
            onClick={addToken}
            disabled={disabled || tokens.length >= BT_WING_MAX_TOKENS}
          >
            + Add token to {title.toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HiddenSerialisers — emits hidden inputs for ALL three wings,
// regardless of which tab is active. This is the only reason
// inactive wings' state survives a save.
// ─────────────────────────────────────────────────────────────

interface HiddenSerialisersProps {
  leftLabel: string;
  leftTokens: BowtieEditorToken[];
  centreLabel: string;
  centreTokens: BowtieEditorToken[];
  rightLabel: string;
  rightTokens: BowtieEditorToken[];
}

function HiddenSerialisers({
  leftLabel,
  leftTokens,
  centreLabel,
  centreTokens,
  rightLabel,
  rightTokens,
}: HiddenSerialisersProps) {
  const centreCorrect = centreTokens.find((t) => t.correct)?.id ?? '';

  return (
    <>
      <input type="hidden" name="bowtie_left_label" value={leftLabel} />
      {leftTokens.map((t) => (
        <Fragment key={`hl-${t.id}`}>
          <input type="hidden" name="bowtie_left_token_id" value={t.id} />
          <input type="hidden" name="bowtie_left_token_text" value={t.text} />
          <input type="hidden" name="bowtie_left_token_feedback" value={t.feedback} />
          {t.correct && (
            <input type="hidden" name="bowtie_left_correct" value={t.id} />
          )}
        </Fragment>
      ))}

      <input type="hidden" name="bowtie_centre_label" value={centreLabel} />
      {centreTokens.map((t) => (
        <Fragment key={`hc-${t.id}`}>
          <input type="hidden" name="bowtie_centre_token_id" value={t.id} />
          <input type="hidden" name="bowtie_centre_token_text" value={t.text} />
          <input type="hidden" name="bowtie_centre_token_feedback" value={t.feedback} />
        </Fragment>
      ))}
      <input type="hidden" name="bowtie_centre_correct" value={centreCorrect} />

      <input type="hidden" name="bowtie_right_label" value={rightLabel} />
      {rightTokens.map((t) => (
        <Fragment key={`hr-${t.id}`}>
          <input type="hidden" name="bowtie_right_token_id" value={t.id} />
          <input type="hidden" name="bowtie_right_token_text" value={t.text} />
          <input type="hidden" name="bowtie_right_token_feedback" value={t.feedback} />
          {t.correct && (
            <input type="hidden" name="bowtie_right_correct" value={t.id} />
          )}
        </Fragment>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// BowtiePreview — dual-mode preview (right pane).
//
//   - viewMode 'answer-key' : shows the curator's correct picks per
//                             wing as filled coloured chips (the
//                             original BOWTIE preview).
//   - viewMode 'student'    : shows three columns of all tokens with
//                             a "Pick N" tag per column. Each token
//                             renders as a neutral chip — none
//                             selected, matching what the student
//                             sees before answering.
//
// Slice 7 is the first editor with a dual-mode preview. The
// <PreviewToggle> is rendered in the card header; state lives in
// BowtieEditorBody.
// ─────────────────────────────────────────────────────────────

interface BowtiePreviewProps {
  instruction: string;
  stem: string;
  leftLabel: string;
  leftTokens: BowtieEditorToken[];
  centreLabel: string;
  centreTokens: BowtieEditorToken[];
  rightLabel: string;
  rightTokens: BowtieEditorToken[];
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function BowtiePreview({
  instruction,
  stem,
  leftLabel,
  leftTokens,
  centreLabel,
  centreTokens,
  rightLabel,
  rightTokens,
  viewMode,
  onViewModeChange,
}: BowtiePreviewProps) {
  return (
    <div className="auth-preview-card">
      <div className="auth-preview-card-header">
        <div className="auth-preview-tag">
          {viewMode === 'answer-key'
            ? 'Answer key · curator view'
            : 'Pre-submit · student view'}
        </div>
        <PreviewToggle value={viewMode} onChange={onViewModeChange} />
      </div>

      {instruction.trim() && (
        <p className="auth-preview-instruction">{instruction}</p>
      )}
      <div className="auth-preview-stem">
        {stem.trim() || <span className="auth-preview-placeholder">Stem appears here…</span>}
      </div>

      {viewMode === 'answer-key' ? (
        <BowtieAnswerKeyView
          leftLabel={leftLabel}
          leftTokens={leftTokens}
          centreLabel={centreLabel}
          centreTokens={centreTokens}
          rightLabel={rightLabel}
          rightTokens={rightTokens}
        />
      ) : (
        <BowtieStudentView
          leftLabel={leftLabel}
          leftTokens={leftTokens}
          centreLabel={centreLabel}
          centreTokens={centreTokens}
          rightLabel={rightLabel}
          rightTokens={rightTokens}
        />
      )}
    </div>
  );
}

// Answer-key body — extracted so the preview component above stays
// readable. Renders the correct picks per wing as filled chips with
// "(not yet picked)" placeholders for empty slots.
function BowtieAnswerKeyView({
  leftLabel,
  leftTokens,
  centreLabel,
  centreTokens,
  rightLabel,
  rightTokens,
}: Omit<BowtiePreviewProps, 'instruction' | 'stem' | 'viewMode' | 'onViewModeChange'>) {
  const leftCorrect   = leftTokens.filter((t) => t.correct);
  const centreCorrect = centreTokens.filter((t) => t.correct);
  const rightCorrect  = rightTokens.filter((t) => t.correct);

  function chip(text: string, wing: WingKey, key: string) {
    return (
      <div key={key} className={`auth-bt-preview-chip auth-bt-preview-chip-${wing}`}>
        {text || <em>(empty)</em>}
      </div>
    );
  }
  function emptyChip(key: string) {
    return (
      <div key={key} className="auth-bt-preview-chip auth-bt-preview-chip-empty">
        (not yet picked)
      </div>
    );
  }

  return (
    <div className="auth-bt-preview-grid">
      <div className="auth-bt-preview-col">
        <div className="auth-bt-preview-col-label">{leftLabel || 'Left wing'}</div>
        {leftCorrect[0] ? chip(leftCorrect[0].text, 'left', 'l0') : emptyChip('l0')}
        {leftCorrect[1] ? chip(leftCorrect[1].text, 'left', 'l1') : emptyChip('l1')}
      </div>
      <div className="auth-bt-preview-col">
        <div className="auth-bt-preview-col-label">{centreLabel || 'Centre'}</div>
        {centreCorrect[0] ? chip(centreCorrect[0].text, 'centre', 'c0') : emptyChip('c0')}
      </div>
      <div className="auth-bt-preview-col">
        <div className="auth-bt-preview-col-label">{rightLabel || 'Right wing'}</div>
        {rightCorrect[0] ? chip(rightCorrect[0].text, 'right', 'r0') : emptyChip('r0')}
        {rightCorrect[1] ? chip(rightCorrect[1].text, 'right', 'r1') : emptyChip('r1')}
      </div>
    </div>
  );
}

// Student-view body — matches the canonical NGN bow-tie pre-submit
// layout (see docs/product-plan/mockups/ngn-primer.html §4):
//
//   1. Drawer at the top: a single flat pool of all tokens, neutral
//      chip styling, labelled "Drag tokens from here:". Tokens are
//      concatenated left → centre → right; deterministic order is
//      fine for an authoring preview. The runner shuffles them.
//   2. Bow-tie diagram below: three columns with their wing labels
//      and empty slot placeholders (2 / 1 / 2). The student sees
//      the labels (so they know what kind of token each slot wants)
//      but no chips are filled in pre-submit.
//
// Runtime contract note: token IDs (lt*/ct*/rt*) are unique-id
// hygiene only, NOT wing-routing. Per-slot scoring is identity-based:
// a slot is correct iff the placed token's id is in that slot's
// correct array. Cross-wing misplacement is always wrong by
// construction (left correct tokens never appear in correct.right).
function BowtieStudentView({
  leftLabel,
  leftTokens,
  centreLabel,
  centreTokens,
  rightLabel,
  rightTokens,
}: Omit<BowtiePreviewProps, 'instruction' | 'stem' | 'viewMode' | 'onViewModeChange'>) {
  const allTokens = [
    ...leftTokens.filter((t) => t.text.trim().length > 0),
    ...centreTokens.filter((t) => t.text.trim().length > 0),
    ...rightTokens.filter((t) => t.text.trim().length > 0),
  ];

  function emptySlot(key: string) {
    return <div key={key} className="auth-bt-student-slot" />;
  }

  return (
    <>
      <div className="auth-bt-student-drawer">
        <div className="auth-bt-student-drawer-label">Drag tokens from here</div>
        {allTokens.length === 0 ? (
          <div className="auth-bt-student-drawer-empty">
            (no tokens authored yet)
          </div>
        ) : (
          <div className="auth-bt-student-drawer-tokens">
            {allTokens.map((t) => (
              <span key={t.id} className="auth-bt-student-token">
                {t.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="auth-bt-preview-grid">
        <div className="auth-bt-preview-col">
          <div className="auth-bt-preview-col-label">{leftLabel || 'Left wing'}</div>
          {emptySlot('ls0')}
          {emptySlot('ls1')}
        </div>
        <div className="auth-bt-preview-col">
          <div className="auth-bt-preview-col-label">{centreLabel || 'Centre'}</div>
          {emptySlot('cs0')}
        </div>
        <div className="auth-bt-preview-col">
          <div className="auth-bt-preview-col-label">{rightLabel || 'Right wing'}</div>
          {emptySlot('rs0')}
          {emptySlot('rs1')}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// BowtieEditorBody — two-pane edit + preview body. Mountable anywhere.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-bowtie-form';

export interface BowtieEditorBodyProps {
  initial: BowtieEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function BowtieEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: BowtieEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  const [clientError, setClientError] = useState<string | null>(null);
  const [activeWing, setActiveWing] = useState<WingKey>('left');
  // BOWTIE defaults to answer-key — the curator usually checks "did
  // I pick the right 5?" before "does the student see this clearly?".
  // The toggle lets them flip; other editors will default to 'student'
  // when they're migrated to the dual-mode preview.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('answer-key');

  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);

  const [leftLabel, setLeftLabel] = useState(initial.left_label);
  const [leftTokens, setLeftTokens] = useState<BowtieEditorToken[]>(initial.left_tokens);

  const [centreLabel, setCentreLabel] = useState(initial.centre_label);
  const [centreTokens, setCentreTokens] = useState<BowtieEditorToken[]>(initial.centre_tokens);

  const [rightLabel, setRightLabel] = useState(initial.right_label);
  const [rightTokens, setRightTokens] = useState<BowtieEditorToken[]>(initial.right_tokens);

  const [category, setCategory] = useState(initial.client_needs_category);

  const leftValid   = validWing(leftTokens,   BT_LEFT_CORRECT);
  const centreValid = validWing(centreTokens, BT_CENTRE_CORRECT);
  const rightValid  = validWing(rightTokens,  BT_RIGHT_CORRECT);

  const contentIncomplete =
    !stem.trim() ||
    leftValid !== 'ok' ||
    centreValid !== 'ok' ||
    rightValid !== 'ok' ||
    !leftLabel.trim() ||
    !centreLabel.trim() ||
    !rightLabel.trim();
  const classificationIncomplete = !category;

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
      <HiddenItemInputs type="BOWTIE" itemId={initial.itemId} surface={initial.surface} />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <EditorAuthorship
        realm={initial.surface}
        entityType={initial.surface === 'tutor' ? 'tutor_question' : 'bank_item'}
        itemId={initial.itemId}
        title={initial.stem}
      />
      <div className="auth-split">
        <div className="auth-edit">
          <EditorTabs
            tabs={[
              { id: 'content',        label: 'Content',        incomplete: contentIncomplete },
              { id: 'classification', label: 'Classification', incomplete: classificationIncomplete },
              { id: 'housekeeping',   label: 'Housekeeping' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as typeof tab)}
          >
            <TabPanel id="content">
              <InstructionField value={instruction} onChange={setInstruction} />
              <StemField value={stem} onChange={setStem} />

              <div className="auth-fg">
                <label className="auth-label">Bow-tie wings *</label>
                <p className="auth-hint">
                  Click a tab to edit that wing. Green dot = correctly filled;
                  amber = missing a correct pick; red = too many or no tokens yet.
                </p>

                <div className="auth-bt-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeWing === 'left'}
                    className={`auth-bt-tab auth-bt-tab-left ${activeWing === 'left' ? 'auth-bt-tab-active' : ''}`}
                    onClick={() => setActiveWing('left')}
                    disabled={pending}
                  >
                    <span className={`auth-bt-tab-dot auth-bt-${leftValid}`} />
                    Left wing — {leftLabel || '(no label)'}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeWing === 'centre'}
                    className={`auth-bt-tab auth-bt-tab-centre ${activeWing === 'centre' ? 'auth-bt-tab-active' : ''}`}
                    onClick={() => setActiveWing('centre')}
                    disabled={pending}
                  >
                    <span className={`auth-bt-tab-dot auth-bt-${centreValid}`} />
                    Centre — {centreLabel || '(no label)'}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeWing === 'right'}
                    className={`auth-bt-tab auth-bt-tab-right ${activeWing === 'right' ? 'auth-bt-tab-active' : ''}`}
                    onClick={() => setActiveWing('right')}
                    disabled={pending}
                  >
                    <span className={`auth-bt-tab-dot auth-bt-${rightValid}`} />
                    Right wing — {rightLabel || '(no label)'}
                  </button>
                </div>

                <div className="auth-bt-wings-wrap">
                  {activeWing === 'left' && (
                    <WingPanel
                      wingKey="left"
                      title="Left wing"
                      subtitle={`Exactly ${BT_LEFT_CORRECT} correct · up to ${BT_WING_MAX_TOKENS} tokens`}
                      presets={BT_LEFT_PRESETS}
                      requiredCorrect={BT_LEFT_CORRECT}
                      useRadio={false}
                      label={leftLabel}
                      tokens={leftTokens}
                      disabled={pending}
                      onLabelChange={setLeftLabel}
                      onTokensChange={setLeftTokens}
                    />
                  )}
                  {activeWing === 'centre' && (
                    <WingPanel
                      wingKey="centre"
                      title="Centre"
                      subtitle={`Exactly ${BT_CENTRE_CORRECT} correct · up to ${BT_WING_MAX_TOKENS} tokens`}
                      presets={BT_CENTRE_PRESETS}
                      requiredCorrect={BT_CENTRE_CORRECT}
                      useRadio={true}
                      label={centreLabel}
                      tokens={centreTokens}
                      disabled={pending}
                      onLabelChange={setCentreLabel}
                      onTokensChange={setCentreTokens}
                    />
                  )}
                  {activeWing === 'right' && (
                    <WingPanel
                      wingKey="right"
                      title="Right wing"
                      subtitle={`Exactly ${BT_RIGHT_CORRECT} correct · up to ${BT_WING_MAX_TOKENS} tokens`}
                      presets={BT_RIGHT_PRESETS}
                      requiredCorrect={BT_RIGHT_CORRECT}
                      useRadio={false}
                      label={rightLabel}
                      tokens={rightTokens}
                      disabled={pending}
                      onLabelChange={setRightLabel}
                      onTokensChange={setRightTokens}
                    />
                  )}
                </div>

                <HiddenSerialisers
                  leftLabel={leftLabel} leftTokens={leftTokens}
                  centreLabel={centreLabel} centreTokens={centreTokens}
                  rightLabel={rightLabel} rightTokens={rightTokens}
                />
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
                questionType="BOWTIE"
                defaults={{
                  // Per bank-marks-and-scoring §4.2/§5.2: BOWTIE max is fixed at 5.
                  marks: 5,
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
          <BowtiePreview
            instruction={instruction}
            stem={stem}
            leftLabel={leftLabel}
            leftTokens={leftTokens}
            centreLabel={centreLabel}
            centreTokens={centreTokens}
            rightLabel={rightLabel}
            rightTokens={rightTokens}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// BowtieEditor — default standalone modal host. Same wiring as
// the other editors.
// ─────────────────────────────────────────────────────────────

export interface BowtieEditorProps {
  initial: BowtieEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function BowtieEditor({ initial, onClose, onSaved, onDeleted }: BowtieEditorProps) {
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
      title={isEdit ? `Edit Bow-tie — ${initial.itemId}` : 'New Bow-tie question'}
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
      <BowtieEditorBody
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
