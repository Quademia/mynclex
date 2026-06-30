// mynclex/lib/bank/editors/drag-drop-editor.tsx
//
// DRAG_DROP editor — ninth and last concrete editor in the rebuild.
// Two subtypes:
//
//   ORDERED  — student ranks tokens into positions (1st, 2nd, …).
//              All slot cards are always active; the curator clicks
//              "+ Slot" to add up to MAX_DD_SLOTS.
//
//   SENTENCE — stem contains [N] markers (single brackets, unlike
//              HIGHLIGHT's [[double]]); each marker maps to one slot.
//              A slot card is "active" iff its id (sN) matches an
//              active marker in the stem. Orphans (card in state,
//              marker no longer in stem) stay in editor state but
//              render dimmed and are dropped on save by the parser.
//
// Layout: paned slot cards. A tab strip lists every slot (one tab
// each, with a status dot for assigned/unassigned) and a single slot
// card renders below for the active tab. Mirrors the CLOZE pattern
// from slice 8 — keeps the editor pane from becoming a long scroll
// when all 8 slots are populated. Token pool is stacked below the
// slot panel (still always visible since slot dropdowns reference it).
//
// Stem ↔ editor sync: stem is controlled state passed in/out of
// <StemField>, the same pattern HIGHLIGHT (slice 9) uses. The "+ Slot
// marker" toolbar button still touches the DOM for cursor position,
// matching HIGHLIGHT's handleWrapOrInsert.
//
// Dual-mode preview ships from day one (slices 8-10 build with the
// PreviewToggle atom; slice 11 back-fills MCQ/TF/SATA/SELECT_N/MATRIX).
// Default view: student.
//
// FormData contract (must match save-question.ts DRAG_DROP branch):
//   dd_subtype                (single value: 'ORDERED'|'SENTENCE')
//   dd_slot_id                (parallel array, incl. orphans for SENTENCE)
//   dd_slot_target_text       (parallel)
//   dd_slot_assigned_token_id (parallel; '' = unassigned)
//   dd_slot_feedback          (parallel)
//   dd_token_id               (parallel, no orphan concept)
//   dd_token_text             (parallel)

'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  MIN_DD_SLOTS,
  MAX_DD_SLOTS,
  DD_TOKEN_POOL_MAX_OVER_SLOTS,
  DD_TOKEN_POOL_ABSOLUTE_MIN,
  DD_TOKEN_POOL_ABSOLUTE_MAX,
  DD_TOKEN_POOL_MIN_EXTRA,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { EditorAuthorship } from '@/lib/audit/authorship-line';
import {
  RovingProvider,
  RovingToolbar,
  RovingRichField,
  useRoving,
} from '@/lib/authoring/roving-rich';
import {
  RichStemField,
  RichInstructionField,
  RichRationaleFields,
} from '@/lib/authoring/rich-atoms';
import { RichRender, RichRenderWithSlots } from '@/lib/authoring/rich-render';
import {
  parseRichDoc,
  serializeRichDoc,
  richTextToPlain,
  isEmptyRichDoc,
  EMPTY_RICH_DOC,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import {
  dragDropStemScanText,
  appendMarkerToDoc,
} from './drag-drop-stem-doc';
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
import {
  ordinalLabel,
  type DragDropEditorInitial,
  type DragDropEditorSlot,
  type DragDropEditorToken,
  type DragDropSubtype,
} from './drag-drop-row-mapper';

export type { DragDropEditorInitial };

// Single-bracket positive integer, e.g. [1] [12]. Shared with the parser
// at lib/bank/parsers/drag-drop.ts. Inside-bracket value is captured.
const MARKER_RE = /\[(\d+)\]/g;
const FORM_ID = 'auth-drag-drop-form';

type ValidityState = 'ok' | 'warn' | 'err';

// ─────────────────────────────────────────────────────────────
// Helpers (private).
// ─────────────────────────────────────────────────────────────

export function extractActiveMarkers(stem: string): Set<number> {
  const out = new Set<number>();
  for (const m of stem.matchAll(MARKER_RE)) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= MAX_DD_SLOTS) out.add(n);
  }
  return out;
}

function slotIdToN(slotId: string): number {
  const n = parseInt(slotId.slice(1), 10);
  return Number.isFinite(n) ? n : NaN;
}

function nextFreeMarkerN(used: Set<number>): number | null {
  for (let n = 1; n <= MAX_DD_SLOTS; n++) {
    if (!used.has(n)) return n;
  }
  return null;
}

function nextFreeTokenN(used: Set<string>): number {
  let n = 1;
  while (used.has(`t${n}`)) n++;
  return n;
}

// SENTENCE seed — produces a starter stem that visibly demonstrates
// the [N] marker syntax + min-3 rule, matching HIGHLIGHT's pre-seed
// philosophy. Used when the curator switches to SENTENCE subtype on
// an empty stem.
function sentenceSeedStem(): string {
  return 'Step one: [1]. Step two: [2]. Step three: [3].';
}

interface BoundsSummary {
  activeSlotCount: number;
  tokenCount: number;
  tokenFloor: number;             // pool minimum (≥1 distractor + NCLEX 4 floor)
  tokenCap: number;               // pool maximum (NCLEX 10 ceiling)
  tokenRecommended: number;       // soft target ≈ 2 × slots, capped at tokenCap
  distractorCount: number;
  unassignedActive: number;
}

function summarise(
  slots: DragDropEditorSlot[],
  tokens: DragDropEditorToken[],
  isActive: (s: DragDropEditorSlot) => boolean,
): BoundsSummary {
  const activeSlots = slots.filter(isActive);
  const activeSlotCount = activeSlots.length;
  const tokenCount = tokens.length;
  const tokenFloor = Math.max(
    activeSlotCount + DD_TOKEN_POOL_MIN_EXTRA,
    DD_TOKEN_POOL_ABSOLUTE_MIN,
  );
  const tokenCap = Math.min(
    activeSlotCount + DD_TOKEN_POOL_MAX_OVER_SLOTS,
    DD_TOKEN_POOL_ABSOLUTE_MAX,
  );
  // Soft 2x target — falls back to the cap when 2x exceeds NCLEX's 10.
  const tokenRecommended = Math.min(activeSlotCount * 2, tokenCap);
  return {
    activeSlotCount,
    tokenCount,
    tokenFloor,
    tokenCap,
    tokenRecommended,
    distractorCount: Math.max(0, tokenCount - activeSlotCount),
    unassignedActive: activeSlots.filter(
      (s) => s.assigned_token_id.trim() === '',
    ).length,
  };
}

function contentValidity(
  s: BoundsSummary,
  tokenTextEmpty: boolean,
): ValidityState {
  if (s.activeSlotCount < MIN_DD_SLOTS) return 'err';
  if (s.activeSlotCount > MAX_DD_SLOTS) return 'err';
  if (s.tokenCount < s.tokenFloor) return 'err';
  if (s.tokenCount > s.tokenCap) return 'err';
  if (tokenTextEmpty) return 'err';
  if (s.unassignedActive > 0) return 'warn';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────
// DragDropPreview — dual-mode preview rendered in the right pane.
// Student view: ORDERED → numbered empty slot rows + token pool;
// SENTENCE → passage with empty inline boxes at each [N] + token
// pool. Answer-key view: each slot filled with its correct token;
// remaining tokens shown as "distractor" tags.
// ─────────────────────────────────────────────────────────────

interface DragDropPreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  subtype: DragDropSubtype;
  slots: DragDropEditorSlot[];
  tokens: DragDropEditorToken[];
  activeMarkers: Set<number>;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function DragDropPreview({
  instruction,
  stem,
  subtype,
  slots,
  tokens,
  activeMarkers,
  viewMode,
  onViewModeChange,
}: DragDropPreviewProps) {
  const tokenById = useMemo(() => {
    const m = new Map<string, DragDropEditorToken>();
    for (const t of tokens) m.set(t.id, t);
    return m;
  }, [tokens]);

  // Active slots in the order the parser will persist them: form order
  // for ORDERED; passage order (sN sorted by N) for SENTENCE (matches
  // the parser's "form order with active filter" — SENTENCE slot cards
  // are kept sorted by N inside the editor, so form order == passage
  // order here).
  const activeSlots = useMemo(
    () =>
      slots.filter((s) => {
        if (subtype === 'ORDERED') return true;
        const n = slotIdToN(s.id);
        return Number.isFinite(n) && activeMarkers.has(n);
      }),
    [slots, subtype, activeMarkers],
  );

  // Tokens NOT used by any active slot — distractors in the runner.
  const usedTokenIds = useMemo(() => {
    const used = new Set<string>();
    for (const s of activeSlots) {
      if (s.assigned_token_id) used.add(s.assigned_token_id);
    }
    return used;
  }, [activeSlots]);

  function renderSlotBox(slot: DragDropEditorSlot, displayIndex: number) {
    const token =
      slot.assigned_token_id ? tokenById.get(slot.assigned_token_id) : null;
    const filled = viewMode === 'answer-key' && token;
    const labelN =
      subtype === 'SENTENCE' ? slotIdToN(slot.id) : displayIndex + 1;
    const numberLabel =
      subtype === 'SENTENCE'
        ? `[${labelN}]`
        : slot.target_text.trim() || ordinalLabel(labelN);

    return (
      <div
        key={slot.id}
        className={
          'auth-dd-preview-slot' +
          (filled ? ' auth-dd-preview-slot-filled' : '')
        }
      >
        <span className="auth-dd-preview-slot-label">{numberLabel}</span>
        <span className="auth-dd-preview-slot-target">
          {filled ? (
            <span className="auth-dd-preview-token">
              {token?.text || '(empty token)'}
            </span>
          ) : (
            <span className="auth-dd-preview-slot-empty">drop here</span>
          )}
        </span>
        {subtype === 'ORDERED' && slot.target_text.trim() && (
          <span className="auth-dd-preview-slot-hint">
            {slot.target_text}
          </span>
        )}
      </div>
    );
  }

  // SENTENCE student/answer-key: render the rich passage with an inline drop
  // box spliced in at each [N] marker (the shared RichRenderWithSlots — same
  // engine the runner uses). Off-card markers (sN with no card) shouldn't
  // happen because the editor auto-creates cards on marker insertion, but we
  // render a "?" placeholder if so for robustness during transient state.
  function renderSentencePassage() {
    if (isEmptyRichDoc(stem)) {
      return (
        <em className="auth-dd-preview-placeholder">
          Write the sentence above. Use <code>[1]</code>, <code>[2]</code>, …
          to mark each drop slot.
        </em>
      );
    }
    const renderSlot = (nStr: string): React.ReactNode => {
      const n = parseInt(nStr, 10);
      const slot = slots.find((s) => slotIdToN(s.id) === n);
      if (!slot || !Number.isFinite(n) || n < 1 || n > MAX_DD_SLOTS) {
        return (
          <span className="auth-dd-preview-inline-box auth-dd-preview-inline-box-bad">
            [{nStr}?]
          </span>
        );
      }
      const token = slot.assigned_token_id
        ? tokenById.get(slot.assigned_token_id)
        : null;
      const filled = viewMode === 'answer-key' && token;
      return (
        <span
          className={
            'auth-dd-preview-inline-box' +
            (filled ? ' auth-dd-preview-inline-box-filled' : '')
          }
        >
          {filled ? token!.text || '(empty)' : `[${n}]`}
        </span>
      );
    };
    return (
      <RichRenderWithSlots
        className="auth-dd-preview-passage"
        doc={stem}
        pattern={/\[(\d+)\]/}
        renderSlot={renderSlot}
      />
    );
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
        {!isEmptyRichDoc(instruction) && (
          <div className="auth-dd-preview-instruction">
            <RichRender doc={instruction} inline />
          </div>
        )}

        {subtype === 'SENTENCE' ? (
          renderSentencePassage()
        ) : isEmptyRichDoc(stem) ? (
          <em className="auth-dd-preview-placeholder">
            Write the prompt above (e.g.{' '}
            <code>Place these steps in order…</code>).
          </em>
        ) : (
          <RichRender doc={stem} className="auth-dd-preview-passage" />
        )}

        {/* Slot list — ORDERED renders a numbered stack; SENTENCE
            already renders boxes inline above, so this section only
            shows for ORDERED. */}
        {subtype === 'ORDERED' && (
          <div className="auth-dd-preview-slots">
            {activeSlots.length === 0 ? (
              <em className="auth-dd-preview-placeholder">
                Add slots in the editor — at least {MIN_DD_SLOTS} ranked
                positions.
              </em>
            ) : (
              activeSlots.map((s, i) => renderSlotBox(s, i))
            )}
          </div>
        )}

        {/* Token pool — always shown. Used tokens dim in answer-key
            view; unused remain as distractors. */}
        <div className="auth-dd-preview-pool">
          <span className="auth-dd-preview-pool-label">Token pool</span>
          <div className="auth-dd-preview-pool-tokens">
            {tokens.length === 0 ? (
              <em className="auth-dd-preview-placeholder">
                Add tokens in the editor.
              </em>
            ) : (
              tokens.map((t) => {
                const used =
                  viewMode === 'answer-key' && usedTokenIds.has(t.id);
                return (
                  <span
                    key={t.id}
                    className={
                      'auth-dd-preview-token' +
                      (used ? ' auth-dd-preview-token-used' : '') +
                      (viewMode === 'answer-key' && !used
                        ? ' auth-dd-preview-token-distractor'
                        : '')
                    }
                  >
                    {t.text || '(empty)'}
                    {viewMode === 'answer-key' && !used && (
                      <span className="auth-dd-preview-distractor-tag">
                        distractor
                      </span>
                    )}
                  </span>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SlotCard — one card per slot. Active for ORDERED (always) or
// SENTENCE-with-marker; orphan cards render dimmed for SENTENCE-
// without-marker. Curator picks the correct token via a <select>;
// feedback is optional.
// ─────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot: DragDropEditorSlot;
  subtype: DragDropSubtype;
  isActive: boolean;
  isOrphan: boolean;
  showRemove: boolean;
  availableTokens: DragDropEditorToken[];
  disabled: boolean;
  onTargetText: (next: string) => void;
  onAssignedToken: (next: string) => void;
  onFeedback: (next: RichDoc) => void;
  onRemove?: () => void;
}

function SlotCard({
  slot,
  subtype,
  isActive,
  isOrphan,
  showRemove,
  availableTokens,
  disabled,
  onTargetText,
  onAssignedToken,
  onFeedback,
  onRemove,
}: SlotCardProps) {
  const cardClass =
    'auth-dd-slot-card' +
    (isOrphan
      ? ' auth-dd-slot-card-orphan'
      : slot.assigned_token_id
        ? ' auth-dd-slot-card-filled'
        : ' auth-dd-slot-card-empty');

  // Show all tokens, but disable already-assigned-elsewhere ones in
  // the dropdown so the curator can see the full pool while editing.
  const idLabel =
    subtype === 'SENTENCE' ? `[${slot.id.slice(1)}]` : slot.id;

  return (
    <div className={cardClass}>
      <div className="auth-dd-slot-head">
        <div className="auth-dd-slot-title">
          <span className="auth-dd-slot-id">{idLabel}</span>
          {isOrphan && (
            <span className="auth-dd-orphan-badge">
              will be dropped on save
            </span>
          )}
        </div>
        {showRemove && onRemove && (
          <button
            type="button"
            className="auth-btn auth-btn-ghost auth-btn-sm"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove slot ${slot.id}`}
          >
            × Remove
          </button>
        )}
      </div>

      {isOrphan && (
        <p className="auth-dd-orphan-tip">
          Re-type <code>[{slot.id.slice(1)}]</code> in the stem to
          reconnect this card. Otherwise its assignment is discarded
          on save.
        </p>
      )}

      <div className="auth-dd-slot-body">
        <div className="auth-fg">
          <label className="auth-label">
            {subtype === 'ORDERED' ? 'Position label' : 'Hint (optional)'}
          </label>
          <input
            type="text"
            value={slot.target_text}
            onChange={(e) => onTargetText(e.target.value)}
            placeholder={
              subtype === 'ORDERED'
                ? 'e.g. 1st action'
                : 'e.g. most likely diagnosis'
            }
            className="auth-input"
            disabled={disabled || !isActive}
          />
        </div>

        <div className="auth-fg">
          <label className="auth-label">Correct token *</label>
          <select
            value={slot.assigned_token_id}
            onChange={(e) => onAssignedToken(e.target.value)}
            className="auth-input auth-dd-slot-select"
            disabled={disabled || !isActive}
          >
            <option value="">— pick a token —</option>
            {availableTokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}: {t.text || '(empty)'}
              </option>
            ))}
          </select>
        </div>

        <div className="auth-fg">
          <label className="auth-label">Feedback (optional)</label>
          {/* Feedback is rich (shows in the review feedback prose). The single
              HiddenSerialisers below emits every slot's feedback in lockstep,
              so this field uses noHiddenInput (the Cloze / Bow-tie pattern).
              Slot label + token text stay plain. */}
          <RovingRichField
            fieldKey={`dd-fb-${slot.id}`}
            name="dd_slot_feedback"
            value={slot.feedback}
            onChange={onFeedback}
            inline
            noHiddenInput
            className="auth-rrf-option-fb"
            ariaLabel="Per-slot feedback"
            placeholder="Per-slot feedback shown after submit."
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HiddenSerialisers — emit FormData inputs for every slot (active +
// orphan) and every token. The parser filters orphans by re-deriving
// active slot IDs from the stem's [N] markers, so we don't need an
// in_stem flag.
// ─────────────────────────────────────────────────────────────

function HiddenSerialisers({
  subtype,
  slots,
  tokens,
}: {
  subtype: DragDropSubtype;
  slots: DragDropEditorSlot[];
  tokens: DragDropEditorToken[];
}) {
  return (
    <>
      <input type="hidden" name="dd_subtype" value={subtype} />
      {slots.map((s) => (
        <Fragment key={`hid-slot-${s.id}`}>
          <input type="hidden" name="dd_slot_id" value={s.id} />
          <input type="hidden" name="dd_slot_target_text" value={s.target_text} />
          <input
            type="hidden"
            name="dd_slot_assigned_token_id"
            value={s.assigned_token_id}
          />
          <input
            type="hidden"
            name="dd_slot_feedback"
            value={serializeRichDoc(s.feedback)}
          />
        </Fragment>
      ))}
      {tokens.map((t) => (
        <Fragment key={`hid-tok-${t.id}`}>
          <input type="hidden" name="dd_token_id" value={t.id} />
          <input type="hidden" name="dd_token_text" value={t.text} />
        </Fragment>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// RovingBridge — lifts the roving toolbar's active field + editor up to the
// editor body (which sits outside the provider) so "Insert slot marker" can
// splice at the caret / focus the stem. Renders nothing. (The Cloze pattern.)
// ─────────────────────────────────────────────────────────────

function RovingBridge({
  onChange,
}: {
  onChange: (
    key: string | null,
    editor: Editor | null,
    setActiveKey: (k: string | null) => void,
  ) => void;
}) {
  const { activeKey, activeEditor, setActiveKey } = useRoving();
  useEffect(() => {
    onChange(activeKey, activeEditor, setActiveKey);
  }, [activeKey, activeEditor, setActiveKey, onChange]);
  return null;
}

// ─────────────────────────────────────────────────────────────
// DragDropEditorBody — two-pane edit + preview body. Mountable
// anywhere (modal host or sandbox).
// ─────────────────────────────────────────────────────────────

export interface DragDropEditorBodyProps {
  initial: DragDropEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function DragDropEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: DragDropEditorBodyProps) {
  const [tab, setTab] = useState<
    'content' | 'classification' | 'housekeeping'
  >('content');
  const [clientError, setClientError] = useState<string | null>(null);
  // DRAG_DROP defaults to 'student' — curator usually previews the
  // pool + empty slots first, then flips to answer-key to verify the
  // assignment.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');

  // Stem / instruction / rationale are rich docs (Slice 6f). Read-coerce via
  // parseRichDoc (legacy plain text wraps as paragraphs; no migration). For
  // SENTENCE the [N] markers live as plain text inside the stem doc (Option B,
  // decoupled).
  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() =>
    parseRichDoc(initial.instruction),
  );
  const [rationale, setRationale] = useState<RichDoc>(() =>
    parseRichDoc(initial.rationale),
  );
  const [subtype, setSubtype] = useState<DragDropSubtype>(initial.subtype);
  const [slots, setSlots] = useState<DragDropEditorSlot[]>(initial.slots);
  const [tokens, setTokens] = useState<DragDropEditorToken[]>(initial.tokens);
  const [category, setCategory] = useState(initial.client_needs_category);

  // Bridge to the roving toolbar's live editor, so "Insert slot marker" can
  // splice [N] at the caret when the stem is the focused field, and focus the
  // stem (setActiveKey) on the append fallback (see handleInsertMarker below).
  const rovingRef = useRef<{
    key: string | null;
    editor: Editor | null;
    setActiveKey: ((k: string | null) => void) | null;
  }>({ key: null, editor: null, setActiveKey: null });
  const setRoving = useCallback(
    (
      key: string | null,
      editor: Editor | null,
      setActiveKey: (k: string | null) => void,
    ) => {
      rovingRef.current = { key, editor, setActiveKey };
    },
    [],
  );

  // The slots editor is paned: only one slot's card renders at a time,
  // with a tab strip above letting the curator switch. Initial active
  // = first slot's id (or null on a fresh SENTENCE flow with empty
  // stem). Mirrors the CLOZE pattern from slice 8.
  const [activeSlotId, setActiveSlotId] = useState<string | null>(
    () => initial.slots[0]?.id ?? null,
  );

  // SENTENCE — auto-create a slot card whenever a new [N] appears in
  // the stem; preserve existing cards as orphans when their marker is
  // edited out. Stem is controlled (via <StemField>) so we sync slot
  // creation directly inside the stem-change handler instead of via
  // useEffect — avoids the React 19 set-state-in-effect anti-pattern.
  const activeMarkers = useMemo(
    () =>
      subtype === 'SENTENCE'
        ? extractActiveMarkers(dragDropStemScanText(stem))
        : new Set<number>(),
    [stem, subtype],
  );

  function reconcileSlotsToStem(stemDoc: RichDoc) {
    const markers = extractActiveMarkers(dragDropStemScanText(stemDoc));
    let firstFreshId: string | null = null;
    setSlots((prev) => {
      const haveIds = new Set(prev.map((s) => s.id));
      const fresh: DragDropEditorSlot[] = [];
      for (const n of markers) {
        const id = `s${n}`;
        if (!haveIds.has(id)) {
          fresh.push({
            id,
            target_text: '',
            assigned_token_id: '',
            feedback: { ...EMPTY_RICH_DOC },
          });
          if (!firstFreshId) firstFreshId = id;
        }
      }
      if (fresh.length === 0) return prev;
      const next = [...prev, ...fresh];
      next.sort((a, b) => slotIdToN(a.id) - slotIdToN(b.id));
      return next;
    });
    // Auto-switch the tab to the newly created slot if there was no
    // active one yet (covers the empty-stem SENTENCE start-up). Don't
    // hijack the tab if the curator was viewing a different slot.
    if (firstFreshId && activeSlotId === null) {
      setActiveSlotId(firstFreshId);
    }
  }

  function handleStemChange(next: RichDoc) {
    setStem(next);
    if (subtype === 'SENTENCE') reconcileSlotsToStem(next);
  }

  // Derived: which slots are active right now.
  function isSlotActive(slot: DragDropEditorSlot): boolean {
    if (subtype === 'ORDERED') return true;
    const n = slotIdToN(slot.id);
    return Number.isFinite(n) && activeMarkers.has(n);
  }

  const tokenTextEmpty = tokens.some((t) => t.text.trim() === '');
  const summary = summarise(slots, tokens, isSlotActive);
  const validity = contentValidity(summary, tokenTextEmpty);
  const contentIncomplete = validity !== 'ok';
  const classificationIncomplete = !category;

  // Live marks for the Housekeeping readout. Per bank-marks-and-scoring §5.2:
  // DRAG_DROP max = count of active slots. ORDERED counts every form slot;
  // SENTENCE counts only slots whose [N] marker is in the stem (parser drops
  // orphans). summary.activeSlotCount matches the parser's `correct.slots`
  // key count exactly.
  const liveMarks = summary.activeSlotCount;

  // ─────────────────────────────────────────────────────────────
  // Subtype switching — clears slots + tokens (with confirm), keeps
  // stem text. Switching to SENTENCE on an empty stem seeds three [N]
  // markers so the curator sees the syntax and the min-3 rule from
  // open. Switching to ORDERED rebuilds the default 3-slot scaffold.
  // ─────────────────────────────────────────────────────────────

  function defaultOrderedSlots(): DragDropEditorSlot[] {
    return [1, 2, 3].map((n) => ({
      id: `s${n}`,
      target_text: ordinalLabel(n),
      assigned_token_id: '',
      feedback: { ...EMPTY_RICH_DOC },
    }));
  }

  function defaultSeedTokens(): DragDropEditorToken[] {
    // Seed enough tokens to satisfy the NCLEX floor for the default
    // 3-slot scaffold: 4 tokens = 3 correct + 1 distractor.
    return [1, 2, 3, 4].map((n) => ({ id: `t${n}`, text: '' }));
  }

  function handleSubtypeChange(next: DragDropSubtype) {
    if (subtype === next) return;
    const hasData =
      slots.some((s) => s.assigned_token_id || s.target_text || s.feedback) ||
      tokens.some((t) => t.text);
    if (
      hasData &&
      !window.confirm(
        'Switching subtype will clear all slots and tokens. The stem text is kept (unless empty, in which case a starter is seeded). Continue?',
      )
    ) {
      return;
    }
    setSubtype(next);
    if (next === 'SENTENCE') {
      // Seed a starter stem only if the curator had nothing typed.
      const seededStem = isEmptyRichDoc(stem)
        ? parseRichDoc(sentenceSeedStem())
        : stem;
      if (seededStem !== stem) setStem(seededStem);
      // SENTENCE slots come from markers — derive them from the
      // current stem value rather than wait for an effect to fire.
      const markers = extractActiveMarkers(dragDropStemScanText(seededStem));
      const seedSlots = Array.from(markers)
        .sort((a, b) => a - b)
        .map((n) => ({
          id: `s${n}`,
          target_text: '',
          assigned_token_id: '',
          feedback: { ...EMPTY_RICH_DOC },
        }));
      setSlots(seedSlots);
      setActiveSlotId(seedSlots[0]?.id ?? null);
    } else {
      const orderedSlots = defaultOrderedSlots();
      setSlots(orderedSlots);
      setActiveSlotId(orderedSlots[0]?.id ?? null);
    }
    setTokens(defaultSeedTokens());
    onDirty?.();
  }

  // ─────────────────────────────────────────────────────────────
  // ORDERED-only: + Slot / × Remove
  // ─────────────────────────────────────────────────────────────

  function addOrderedSlot() {
    if (summary.activeSlotCount >= MAX_DD_SLOTS) return;
    const used = new Set(
      slots.map((s) => slotIdToN(s.id)).filter(Number.isFinite),
    );
    let n = 1;
    while (used.has(n)) n++;
    const newId = `s${n}`;
    setSlots((prev) => [
      ...prev,
      {
        id: newId,
        target_text: ordinalLabel(n),
        assigned_token_id: '',
        feedback: { ...EMPTY_RICH_DOC },
      },
    ]);
    setActiveSlotId(newId);
    onDirty?.();
  }

  function removeOrderedSlot(slotId: string) {
    const next = slots.filter((s) => s.id !== slotId);
    setSlots(next);
    // If the curator deleted the slot they were viewing, jump to
    // the first remaining slot (or null if the list is now empty).
    if (activeSlotId === slotId) {
      setActiveSlotId(next[0]?.id ?? null);
    }
    onDirty?.();
  }

  // ─────────────────────────────────────────────────────────────
  // SENTENCE-only: insert [N] at the cursor in the stem textarea.
  // ─────────────────────────────────────────────────────────────

  function handleInsertMarker() {
    const usedMarkers = extractActiveMarkers(dragDropStemScanText(stem));
    const n = nextFreeMarkerN(usedMarkers);
    if (n === null) {
      window.alert(`Already at the ${MAX_DD_SLOTS}-marker maximum.`);
      return;
    }
    const marker = `[${n}]`;
    const roving = rovingRef.current;
    // When the stem is the live (focused) roving field, splice the marker at
    // the caret via Tiptap (its onChange → handleStemChange → reconcile creates
    // the slot). Otherwise append it to the end of the stem doc, reconcile, and
    // focus the field — a clean text marker the curator can drag into place.
    if (roving.key === 'stem' && roving.editor && !roving.editor.isDestroyed) {
      const ed = roving.editor;
      const { from } = ed.state.selection;
      const before =
        from > 0 ? ed.state.doc.textBetween(Math.max(0, from - 1), from, ' ') : '';
      const needsSpace = before !== '' && !/\s/.test(before);
      ed.chain().focus().insertContent(`${needsSpace ? ' ' : ''}${marker}`).run();
    } else {
      const next = appendMarkerToDoc(stem, marker);
      setStem(next);
      reconcileSlotsToStem(next);
      roving.setActiveKey?.('stem');
    }
    // The toolbar click is an explicit "add new slot" action — focus its tab so
    // the curator lands on the new slot card once reconcile creates it.
    setActiveSlotId(`s${n}`);

    onDirty?.();
  }

  // ─────────────────────────────────────────────────────────────
  // Per-slot mutations
  // ─────────────────────────────────────────────────────────────

  function setSlotField(
    slotId: string,
    patch: Partial<DragDropEditorSlot>,
  ) {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Token pool mutations
  // ─────────────────────────────────────────────────────────────

  function addToken() {
    if (tokens.length >= DD_TOKEN_POOL_ABSOLUTE_MAX) return;
    const used = new Set(tokens.map((t) => t.id));
    const n = nextFreeTokenN(used);
    setTokens((prev) => [...prev, { id: `t${n}`, text: '' }]);
    onDirty?.();
  }

  function removeToken(tokenId: string) {
    if (tokens.length <= 1) return;
    setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    // Unassign any slot pointing at the removed token.
    setSlots((prev) =>
      prev.map((s) =>
        s.assigned_token_id === tokenId ? { ...s, assigned_token_id: '' } : s,
      ),
    );
    onDirty?.();
  }

  function updateTokenText(tokenId: string, text: string) {
    setTokens((prev) =>
      prev.map((t) => (t.id === tokenId ? { ...t, text } : t)),
    );
  }

  // For each slot's <select>: tokens NOT assigned to a different slot
  // (so duplicates can't be picked through the UI). The current slot's
  // own assignment stays selectable.
  function tokensAvailableFor(slotId: string): DragDropEditorToken[] {
    const takenElsewhere = new Set<string>();
    for (const s of slots) {
      if (s.id !== slotId && s.assigned_token_id) {
        takenElsewhere.add(s.assigned_token_id);
      }
    }
    return tokens.filter((t) => !takenElsewhere.has(t.id));
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

  // Split slots for tab-strip rendering — actives first, orphans tail.
  const activeSlots = slots.filter(isSlotActive);
  const orphanSlots = slots.filter((s) => !isSlotActive(s));
  // The single slot card that's currently visible. Falls back to the
  // first slot if `activeSlotId` is stale (e.g. it pointed at a slot
  // that was removed).
  const activeSlot =
    slots.find((s) => s.id === activeSlotId) ?? slots[0] ?? null;

  // Bounds meter colour states (per pill).
  const slotMeterState: ValidityState =
    summary.activeSlotCount < MIN_DD_SLOTS ||
    summary.activeSlotCount > MAX_DD_SLOTS
      ? 'err'
      : 'ok';
  // Token meter:
  //   err  — pool below floor (no distractors, or under NCLEX 4) or over cap
  //          (or some token has empty text).
  //   warn — pool valid but below 2× recommendation.
  //   ok   — meets or exceeds 2× recommendation (capped at NCLEX 10).
  const tokenMeterState: ValidityState =
    summary.tokenCount < summary.tokenFloor ||
    summary.tokenCount > summary.tokenCap ||
    tokenTextEmpty
      ? 'err'
      : summary.tokenCount < summary.tokenRecommended
        ? 'warn'
        : 'ok';
  // Distractor meter mirrors token meter for the distractor count
  // specifically — < required floor is err; below the recommended
  // amount is warn; meeting the recommendation is ok.
  const distractorRecommended = Math.max(
    0,
    summary.tokenRecommended - summary.activeSlotCount,
  );
  const distractorRequired = Math.max(
    DD_TOKEN_POOL_MIN_EXTRA,
    DD_TOKEN_POOL_ABSOLUTE_MIN - summary.activeSlotCount,
  );
  const distractorMeterState: ValidityState =
    summary.distractorCount < distractorRequired
      ? 'err'
      : summary.distractorCount < distractorRecommended
        ? 'warn'
        : 'ok';
  const assignmentMeterState: ValidityState =
    summary.unassignedActive > 0 ? 'warn' : 'ok';

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      noValidate
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs
        type="DRAG_DROP"
        itemId={initial.itemId}
        surface={initial.surface}
      />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <EditorAuthorship
        realm={initial.surface}
        entityType={initial.surface === 'tutor' ? 'tutor_question' : 'bank_item'}
        itemId={initial.itemId}
        title={richTextToPlain(initial.stem)}
      />
      <RovingProvider>
        <RovingBridge onChange={setRoving} />
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
              <RovingToolbar hint="Click into a field to format it" />
              <RichInstructionField
                value={instruction}
                onChange={(doc) => { setInstruction(doc); onDirty?.(); }}
              />
              <RichStemField
                value={stem}
                onChange={(doc) => { handleStemChange(doc); onDirty?.(); }}
              />

              {/* Subtype picker — radio bar */}
              <div className="auth-fg">
                <label className="auth-label">Subtype *</label>
                <div
                  className="auth-dd-subtype-bar"
                  role="radiogroup"
                  aria-label="Drag-drop subtype"
                >
                  {(['ORDERED', 'SENTENCE'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      role="radio"
                      aria-checked={subtype === st}
                      className={
                        subtype === st
                          ? 'auth-dd-subtype-opt auth-dd-subtype-opt-active'
                          : 'auth-dd-subtype-opt'
                      }
                      onClick={() => handleSubtypeChange(st)}
                      disabled={pending}
                    >
                      {st === 'ORDERED' ? 'Ordered list' : 'Sentence slots'}
                    </button>
                  ))}
                </div>
                <p className="auth-hint">
                  {subtype === 'ORDERED'
                    ? 'Curator-defined ranked positions (1st, 2nd, …). Add up to ' +
                      MAX_DD_SLOTS +
                      ' slots.'
                    : 'Stem carries [1], [2], … markers. Each marker maps to one slot. Use single brackets — double [[…]] is HIGHLIGHT syntax.'}
                </p>
              </div>

              {/* SENTENCE-only marker toolbar */}
              {subtype === 'SENTENCE' && (
                <div className="auth-fg">
                  <div className="auth-dd-toolbar">
                    <button
                      type="button"
                      className="auth-btn auth-btn-primary"
                      onClick={handleInsertMarker}
                      disabled={
                        pending ||
                        summary.activeSlotCount >= MAX_DD_SLOTS
                      }
                    >
                      [N] Insert slot marker
                    </button>
                    <span className="auth-hint">
                      Inserts the next free <code>[N]</code> at the
                      cursor in the stem. Max {MAX_DD_SLOTS}.
                    </span>
                  </div>
                </div>
              )}

              <div className="auth-fg">
                <div className="auth-label-row">
                  <label className="auth-label">Slots *</label>
                  {subtype === 'ORDERED' && (
                    <button
                      type="button"
                      className="auth-btn auth-btn-ghost auth-btn-sm"
                      onClick={addOrderedSlot}
                      disabled={
                        pending ||
                        summary.activeSlotCount >= MAX_DD_SLOTS
                      }
                    >
                      + Slot
                    </button>
                  )}
                </div>

                {/* Bounds meter — token + distractor pills colour-code
                    against the NCLEX 4–10 pool window and the soft
                    2× recommendation (see classifications.ts header). */}
                <div className="auth-dd-bounds">
                  <span
                    className={`auth-dd-bounds-item auth-dd-${slotMeterState}`}
                  >
                    {summary.activeSlotCount} slot
                    {summary.activeSlotCount === 1 ? '' : 's'} ({MIN_DD_SLOTS}
                    –{MAX_DD_SLOTS})
                  </span>
                  <span
                    className={`auth-dd-bounds-item auth-dd-${tokenMeterState}`}
                    title={`NCLEX cap: ${DD_TOKEN_POOL_ABSOLUTE_MAX}. Recommended: ${summary.tokenRecommended} (≈2× slots).`}
                  >
                    {summary.tokenCount} token
                    {summary.tokenCount === 1 ? '' : 's'} (
                    {summary.tokenFloor}–{summary.tokenCap})
                  </span>
                  <span
                    className={`auth-dd-bounds-item auth-dd-${distractorMeterState}`}
                    title={`At least ${distractorRequired} required. Recommended: ${distractorRecommended}.`}
                  >
                    {summary.distractorCount} distractor
                    {summary.distractorCount === 1 ? '' : 's'} (≥{distractorRequired})
                  </span>
                  <span
                    className={`auth-dd-bounds-item auth-dd-${assignmentMeterState}`}
                  >
                    {summary.unassignedActive} unassigned
                  </span>
                </div>

                {/* Tab strip — one tab per slot (actives first, then
                    orphans). Status dot reflects per-slot validity:
                    green when a token is assigned, amber when empty.
                    Orphan tabs use a dashed warning style. */}
                {slots.length > 0 && (
                  <div className="auth-dd-tabs" role="tablist">
                    {activeSlots.map((s, i) => {
                      const isActive = s.id === activeSlotId;
                      const dot: ValidityState = s.assigned_token_id
                        ? 'ok'
                        : 'warn';
                      const labelN =
                        subtype === 'SENTENCE' ? slotIdToN(s.id) : i + 1;
                      const tabLabel =
                        subtype === 'SENTENCE'
                          ? `[${labelN}]`
                          : `Slot ${labelN}`;
                      return (
                        <button
                          type="button"
                          role="tab"
                          key={s.id}
                          aria-selected={isActive}
                          className={
                            'auth-dd-tab' +
                            (isActive ? ' auth-dd-tab-active' : '')
                          }
                          onClick={() => setActiveSlotId(s.id)}
                          disabled={pending}
                        >
                          <span className={`auth-dd-tab-dot auth-dd-${dot}`} />
                          {tabLabel}
                        </button>
                      );
                    })}
                    {orphanSlots.map((s) => {
                      const isActive = s.id === activeSlotId;
                      const n = slotIdToN(s.id);
                      return (
                        <button
                          type="button"
                          role="tab"
                          key={s.id}
                          aria-selected={isActive}
                          className={
                            'auth-dd-tab auth-dd-tab-orphan' +
                            (isActive ? ' auth-dd-tab-active' : '')
                          }
                          onClick={() => setActiveSlotId(s.id)}
                          disabled={pending}
                          title="This slot's marker is no longer in the stem. Click to view; re-type the marker to reconnect."
                        >
                          <span className="auth-dd-tab-dot auth-dd-warn" />
                          {`[${n}]`} · orphan
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Single active slot panel (or empty state). */}
                <div className="auth-dd-slot-panel-wrap">
                  {slots.length === 0 ? (
                    <div className="auth-dd-slots-empty">
                      {subtype === 'SENTENCE'
                        ? 'Type [1], [2], … in the stem (or click "+ Insert slot marker") to create slots.'
                        : 'No slots yet — click "+ Slot" to add one.'}
                    </div>
                  ) : activeSlot ? (
                    <SlotCard
                      key={activeSlot.id}
                      slot={activeSlot}
                      subtype={subtype}
                      isActive={isSlotActive(activeSlot)}
                      isOrphan={!isSlotActive(activeSlot)}
                      showRemove={
                        subtype === 'ORDERED' &&
                        summary.activeSlotCount > MIN_DD_SLOTS
                      }
                      availableTokens={tokensAvailableFor(activeSlot.id)}
                      disabled={pending}
                      onTargetText={(v) =>
                        setSlotField(activeSlot.id, { target_text: v })
                      }
                      onAssignedToken={(v) =>
                        setSlotField(activeSlot.id, { assigned_token_id: v })
                      }
                      onFeedback={(v) =>
                        setSlotField(activeSlot.id, { feedback: v })
                      }
                      onRemove={
                        subtype === 'ORDERED'
                          ? () => removeOrderedSlot(activeSlot.id)
                          : undefined
                      }
                    />
                  ) : null}
                </div>
              </div>

              {/* Token pool */}
              <div className="auth-fg">
                <div className="auth-label-row">
                  <label className="auth-label">Token pool *</label>
                  <button
                    type="button"
                    className="auth-btn auth-btn-ghost auth-btn-sm"
                    onClick={addToken}
                    disabled={
                      pending ||
                      tokens.length >= DD_TOKEN_POOL_ABSOLUTE_MAX
                    }
                  >
                    + Token
                  </button>
                </div>
                <p className="auth-hint">
                  NCLEX drag-drop pools hold <strong>{DD_TOKEN_POOL_ABSOLUTE_MIN}–
                  {DD_TOKEN_POOL_ABSOLUTE_MAX}</strong> tokens with at least one
                  distractor. For this question:{' '}
                  <strong>{summary.tokenFloor} required, {summary.tokenCap} max</strong>.
                  We recommend ≈ {summary.tokenRecommended} tokens (about 2× slots) so
                  students can&apos;t solve by elimination.
                </p>
                <div className="auth-dd-tokens-wrap">
                  {tokens.map((t) => (
                    <div key={t.id} className="auth-dd-token-row">
                      <span className="auth-dd-token-id">{t.id}</span>
                      <input
                        type="text"
                        value={t.text}
                        onChange={(e) => updateTokenText(t.id, e.target.value)}
                        placeholder="Token text…"
                        className="auth-input"
                        disabled={pending}
                      />
                      <button
                        type="button"
                        className="auth-btn auth-btn-ghost auth-btn-sm"
                        onClick={() => removeToken(t.id)}
                        disabled={pending || tokens.length <= 1}
                        aria-label={`Remove token ${t.id}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <HiddenSerialisers
                subtype={subtype}
                slots={slots}
                tokens={tokens}
              />

              <RichRationaleFields
                rationale={rationale}
                onRationaleChange={(doc) => { setRationale(doc); onDirty?.(); }}
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
                questionType="DRAG_DROP"
                defaults={{
                  marks: liveMarks,
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
          <DragDropPreview
            instruction={instruction}
            stem={stem}
            subtype={subtype}
            slots={slots}
            tokens={tokens}
            activeMarkers={activeMarkers}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
        </div>
      </RovingProvider>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// DragDropEditor — default standalone modal host. Same wiring as
// the other editors.
// ─────────────────────────────────────────────────────────────

export interface DragDropEditorProps {
  initial: DragDropEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function DragDropEditor({
  initial,
  onClose,
  onSaved,
  onDeleted,
}: DragDropEditorProps) {
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
      title={
        isEdit
          ? `Edit Drag-drop — ${initial.itemId}`
          : 'New Drag-drop question'
      }
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
      <DragDropEditorBody
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
