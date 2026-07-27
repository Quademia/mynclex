// mynclex/lib/bank/editors/drag-cloze-editor.tsx
//
// DRAG_CLOZE editor — sentence-mode drag-and-drop cloze.
//
// The stem contains [N] markers (single brackets, unlike HIGHLIGHT's
// [[double]] and CLOZE's {N}); each marker maps to one slot. A slot card
// is "active" iff its id (sN) matches an active marker in the stem.
// Orphans (card in state, marker no longer in stem) stay in editor state
// but render dimmed and are dropped on save by the parser.
//
// Layout: paned slot cards. A tab strip lists every slot (one tab each,
// with a status dot for assigned/unassigned) and a single slot card
// renders below for the active tab. Keeps the editor pane from becoming a
// long scroll when all 8 slots are populated. Token pool is stacked below
// the slot panel (still always visible since slot dropdowns reference it).
//
// Stem ↔ editor sync: stem is controlled state passed in/out of
// <RichStemField>. The "[N] Insert slot marker" toolbar button touches the
// live roving editor for cursor position.
//
// Dual-mode preview ships from day one. Default view: student.
//
// FormData contract (must match save-question.ts DRAG_CLOZE branch):
//   dcz_slot_id                (parallel array, incl. orphans)
//   dcz_slot_target_text       (parallel)
//   dcz_slot_assigned_token_id (parallel; '' = unassigned)
//   dcz_token_id               (parallel, no orphan concept)
//   dcz_token_text             (parallel)
//   dcz_token_feedback         (parallel; rich — every token can be explained)

'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  DCZ_MIN_SLOTS,
  DCZ_MAX_SLOTS,
  DCZ_RECOMMENDED_MIN_SLOTS,
  DCZ_TOKEN_POOL_MAX_OVER_SLOTS,
  DCZ_TOKEN_POOL_RECOMMENDED_MIN,
  DCZ_TOKEN_POOL_ABSOLUTE_MAX,
  DCZ_TOKEN_POOL_MIN_EXTRA,
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
  STEM_IMAGE_KEYS,
} from '@/lib/authoring/rich-atoms';
import { RichRender, RichRenderWithSlots } from '@/lib/authoring/rich-render';
import { curatorBankImageRenderer } from '@/lib/authoring/bank-image-render';
import { richTextToPlainLabel } from '@/lib/authoring/bank-image-doc';
import { useAuthUploadsInFlight } from '@/lib/authoring/use-uploads-in-flight';
import {
  parseRichDoc,
  serializeRichDoc,
  isEmptyRichDoc,
  EMPTY_RICH_DOC,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import {
  dragClozeStemScanText,
  appendMarkerToDoc,
} from './drag-cloze-stem-doc';
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
  type DragClozeEditorInitial,
  type DragClozeEditorSlot,
  type DragClozeEditorToken,
} from './drag-cloze-row-mapper';

export type { DragClozeEditorInitial };

// Single-bracket positive integer, e.g. [1] [12]. Shared with the parser
// at lib/bank/parsers/drag-cloze.ts. Inside-bracket value is captured.
const MARKER_RE = /\[(\d+)\]/g;
const FORM_ID = 'auth-drag-cloze-form';

type ValidityState = 'ok' | 'warn' | 'err';

// ─────────────────────────────────────────────────────────────
// Helpers (private).
// ─────────────────────────────────────────────────────────────

export function extractActiveMarkers(stem: string): Set<number> {
  const out = new Set<number>();
  for (const m of stem.matchAll(MARKER_RE)) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= DCZ_MAX_SLOTS) out.add(n);
  }
  return out;
}

function slotIdToN(slotId: string): number {
  const n = parseInt(slotId.slice(1), 10);
  return Number.isFinite(n) ? n : NaN;
}

function nextFreeMarkerN(used: Set<number>): number | null {
  for (let n = 1; n <= DCZ_MAX_SLOTS; n++) {
    if (!used.has(n)) return n;
  }
  return null;
}

function nextFreeTokenN(used: Set<string>): number {
  let n = 1;
  while (used.has(`t${n}`)) n++;
  return n;
}

interface BoundsSummary {
  activeSlotCount: number;
  tokenCount: number;
  tokenFloor: number;             // HARD pool minimum (slots + ≥1 distractor)
  tokenRecommendedFloor: number;  // advisory pool minimum (NCLEX 4-floor norm)
  tokenCap: number;               // pool maximum (NCLEX 10 ceiling)
  tokenRecommended: number;       // soft target ≈ 2 × slots, capped at tokenCap
  distractorCount: number;
  unassignedActive: number;
}

function summarise(
  slots: DragClozeEditorSlot[],
  tokens: DragClozeEditorToken[],
  isActive: (s: DragClozeEditorSlot) => boolean,
): BoundsSummary {
  const activeSlots = slots.filter(isActive);
  const activeSlotCount = activeSlots.length;
  const tokenCount = tokens.length;
  // HARD floor — one token per slot + at least one distractor.
  const tokenFloor = activeSlotCount + DCZ_TOKEN_POOL_MIN_EXTRA;
  // Advisory floor — the NCSBN 4-item norm (nudge only, doesn't block).
  const tokenRecommendedFloor = Math.max(
    tokenFloor,
    DCZ_TOKEN_POOL_RECOMMENDED_MIN,
  );
  const tokenCap = Math.min(
    activeSlotCount + DCZ_TOKEN_POOL_MAX_OVER_SLOTS,
    DCZ_TOKEN_POOL_ABSOLUTE_MAX,
  );
  // Soft 2x target — falls back to the cap when 2x exceeds NCLEX's 10.
  const tokenRecommended = Math.min(activeSlotCount * 2, tokenCap);
  return {
    activeSlotCount,
    tokenCount,
    tokenFloor,
    tokenRecommendedFloor,
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
  if (s.activeSlotCount < DCZ_MIN_SLOTS) return 'err';
  if (s.activeSlotCount > DCZ_MAX_SLOTS) return 'err';
  if (s.tokenCount < s.tokenFloor) return 'err';
  if (s.tokenCount > s.tokenCap) return 'err';
  if (tokenTextEmpty) return 'err';
  if (s.unassignedActive > 0) return 'warn';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────
// DragClozePreview — dual-mode preview rendered in the right pane.
// Student view: passage with empty inline boxes at each [N] + token
// pool. Answer-key view: each slot filled with its correct token;
// remaining tokens shown as "distractor" tags.
// ─────────────────────────────────────────────────────────────

interface DragClozePreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  slots: DragClozeEditorSlot[];
  tokens: DragClozeEditorToken[];
  activeMarkers: Set<number>;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function DragClozePreview({
  instruction,
  stem,
  slots,
  tokens,
  activeMarkers,
  viewMode,
  onViewModeChange,
}: DragClozePreviewProps) {
  const tokenById = useMemo(() => {
    const m = new Map<string, DragClozeEditorToken>();
    for (const t of tokens) m.set(t.id, t);
    return m;
  }, [tokens]);

  // Active slots in passage order (sN sorted by N) — matches the parser's
  // "form order with active filter" since SENTENCE slot cards are kept
  // sorted by N inside the editor.
  const activeSlots = useMemo(
    () =>
      slots.filter((s) => {
        const n = slotIdToN(s.id);
        return Number.isFinite(n) && activeMarkers.has(n);
      }),
    [slots, activeMarkers],
  );

  // Tokens NOT used by any active slot — distractors in the runner.
  const usedTokenIds = useMemo(() => {
    const used = new Set<string>();
    for (const s of activeSlots) {
      if (s.assigned_token_id) used.add(s.assigned_token_id);
    }
    return used;
  }, [activeSlots]);

  // Render the rich passage with an inline drop box spliced in at each [N]
  // marker (the shared RichRenderWithSlots — same engine the runner uses).
  // Off-card markers (sN with no card) shouldn't happen because the editor
  // auto-creates cards on marker insertion, but we render a "?" placeholder
  // if so for robustness during transient state.
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
      if (!slot || !Number.isFinite(n) || n < 1 || n > DCZ_MAX_SLOTS) {
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
        custom={curatorBankImageRenderer}
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

        {renderSentencePassage()}

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
// SlotCard — one card per slot. Active for SENTENCE-with-marker;
// orphan cards render dimmed for SENTENCE-without-marker. Curator picks
// the correct token via a <select>; the hint is optional. Slots are
// added/removed by editing [N] markers, not a remove button.
// ─────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot: DragClozeEditorSlot;
  isActive: boolean;
  isOrphan: boolean;
  availableTokens: DragClozeEditorToken[];
  disabled: boolean;
  onTargetText: (next: string) => void;
  onAssignedToken: (next: string) => void;
}

function SlotCard({
  slot,
  isActive,
  isOrphan,
  availableTokens,
  disabled,
  onTargetText,
  onAssignedToken,
}: SlotCardProps) {
  const cardClass =
    'auth-dd-slot-card' +
    (isOrphan
      ? ' auth-dd-slot-card-orphan'
      : slot.assigned_token_id
        ? ' auth-dd-slot-card-filled'
        : ' auth-dd-slot-card-empty');

  const idLabel = `[${slot.id.slice(1)}]`;

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
          <label className="auth-label">Hint (optional)</label>
          <input
            type="text"
            value={slot.target_text}
            onChange={(e) => onTargetText(e.target.value)}
            placeholder="e.g. most likely diagnosis"
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
          <p className="auth-hint auth-dd-slot-fb-note">
            Add the explanation on the token itself, in the Token pool below —
            it shows here in review when this token is the answer.
          </p>
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
  slots,
  tokens,
}: {
  slots: DragClozeEditorSlot[];
  tokens: DragClozeEditorToken[];
}) {
  return (
    <>
      {slots.map((s) => (
        <Fragment key={`hid-slot-${s.id}`}>
          <input type="hidden" name="dcz_slot_id" value={s.id} />
          <input type="hidden" name="dcz_slot_target_text" value={s.target_text} />
          <input
            type="hidden"
            name="dcz_slot_assigned_token_id"
            value={s.assigned_token_id}
          />
        </Fragment>
      ))}
      {tokens.map((t) => (
        <Fragment key={`hid-tok-${t.id}`}>
          <input type="hidden" name="dcz_token_id" value={t.id} />
          <input type="hidden" name="dcz_token_text" value={t.text} />
          <input
            type="hidden"
            name="dcz_token_feedback"
            value={serializeRichDoc(t.feedback)}
          />
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
// DragClozeEditorBody — two-pane edit + preview body. Mountable
// anywhere (modal host or sandbox).
// ─────────────────────────────────────────────────────────────

export interface DragClozeEditorBodyProps {
  initial: DragClozeEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function DragClozeEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: DragClozeEditorBodyProps) {
  const [tab, setTab] = useState<
    'content' | 'classification' | 'housekeeping'
  >('content');
  const [clientError, setClientError] = useState<string | null>(null);
  // DRAG_CLOZE defaults to 'student' — curator usually previews the
  // pool + empty slots first, then flips to answer-key to verify the
  // assignment.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');
  // Slice 8 — hold Save while a stem-image upload is in flight (saving
  // then would persist a not-yet-filled image block).
  const uploadsInFlight = useAuthUploadsInFlight();

  // Stem / instruction / rationale are rich docs. Read-coerce via
  // parseRichDoc (legacy plain text wraps as paragraphs; no migration). The
  // [N] markers live as plain text inside the stem doc (Option B, decoupled).
  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() =>
    parseRichDoc(initial.instruction),
  );
  const [rationale, setRationale] = useState<RichDoc>(() =>
    parseRichDoc(initial.rationale),
  );
  const [slots, setSlots] = useState<DragClozeEditorSlot[]>(initial.slots);
  const [tokens, setTokens] = useState<DragClozeEditorToken[]>(initial.tokens);
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
  // = first slot's id (or null on a fresh flow with empty stem).
  const [activeSlotId, setActiveSlotId] = useState<string | null>(
    () => initial.slots[0]?.id ?? null,
  );

  // Auto-create a slot card whenever a new [N] appears in the stem;
  // preserve existing cards as orphans when their marker is edited out.
  // Stem is controlled (via <RichStemField>) so we sync slot creation
  // directly inside the stem-change handler instead of via useEffect —
  // avoids the React 19 set-state-in-effect anti-pattern.
  const activeMarkers = useMemo(
    () => extractActiveMarkers(dragClozeStemScanText(stem)),
    [stem],
  );

  function reconcileSlotsToStem(stemDoc: RichDoc) {
    const markers = extractActiveMarkers(dragClozeStemScanText(stemDoc));
    let firstFreshId: string | null = null;
    setSlots((prev) => {
      const haveIds = new Set(prev.map((s) => s.id));
      const fresh: DragClozeEditorSlot[] = [];
      for (const n of markers) {
        const id = `s${n}`;
        if (!haveIds.has(id)) {
          fresh.push({
            id,
            target_text: '',
            assigned_token_id: '',
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
    // active one yet (covers the empty-stem start-up). Don't hijack the
    // tab if the curator was viewing a different slot.
    if (firstFreshId && activeSlotId === null) {
      setActiveSlotId(firstFreshId);
    }
  }

  function handleStemChange(next: RichDoc) {
    setStem(next);
    reconcileSlotsToStem(next);
  }

  // Derived: which slots are active right now (marker-based only).
  function isSlotActive(slot: DragClozeEditorSlot): boolean {
    const n = slotIdToN(slot.id);
    return Number.isFinite(n) && activeMarkers.has(n);
  }

  const tokenTextEmpty = tokens.some((t) => t.text.trim() === '');
  const summary = summarise(slots, tokens, isSlotActive);
  const validity = contentValidity(summary, tokenTextEmpty);
  const contentIncomplete = validity !== 'ok';
  const classificationIncomplete = !category;

  // Live marks for the Housekeeping readout: DRAG_CLOZE max = count of active
  // slots (slots whose [N] marker is in the stem; parser drops orphans).
  // summary.activeSlotCount matches the parser's `correct.slots` key count.
  const liveMarks = summary.activeSlotCount;

  // ─────────────────────────────────────────────────────────────
  // Insert [N] at the cursor in the stem.
  // ─────────────────────────────────────────────────────────────

  function handleInsertMarker() {
    const usedMarkers = extractActiveMarkers(dragClozeStemScanText(stem));
    const n = nextFreeMarkerN(usedMarkers);
    if (n === null) {
      window.alert(`Already at the ${DCZ_MAX_SLOTS}-marker maximum.`);
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
    patch: Partial<DragClozeEditorSlot>,
  ) {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Token pool mutations
  // ─────────────────────────────────────────────────────────────

  function addToken() {
    if (tokens.length >= DCZ_TOKEN_POOL_ABSOLUTE_MAX) return;
    const used = new Set(tokens.map((t) => t.id));
    const n = nextFreeTokenN(used);
    setTokens((prev) => [
      ...prev,
      { id: `t${n}`, text: '', feedback: { ...EMPTY_RICH_DOC } },
    ]);
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

  function updateTokenFeedback(tokenId: string, feedback: RichDoc) {
    setTokens((prev) =>
      prev.map((t) => (t.id === tokenId ? { ...t, feedback } : t)),
    );
    onDirty?.();
  }

  // For each slot's <select>: tokens NOT assigned to a different slot
  // (so duplicates can't be picked through the UI). The current slot's
  // own assignment stays selectable.
  function tokensAvailableFor(slotId: string): DragClozeEditorToken[] {
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
    if (uploadsInFlight) {
      setClientError('An image is still uploading — give it a moment, then save.');
      return;
    }
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

  // Bounds meter colour states (per pill). Advise > block: 'err' marks a
  // structural break that blocks Save; 'warn' is a norm nudge that saves fine.
  // Slot meter:
  //   err  — outside the structural 1–8 range (a single-blank cloze is valid).
  //   warn — valid but below the recommended 3 (a norm, not a wall).
  const slotMeterState: ValidityState =
    summary.activeSlotCount < DCZ_MIN_SLOTS ||
    summary.activeSlotCount > DCZ_MAX_SLOTS
      ? 'err'
      : summary.activeSlotCount < DCZ_RECOMMENDED_MIN_SLOTS
        ? 'warn'
        : 'ok';
  // Slot-count advisory line: in-range but below the recommended count.
  const slotCountAdvisory =
    summary.activeSlotCount >= DCZ_MIN_SLOTS &&
    summary.activeSlotCount < DCZ_RECOMMENDED_MIN_SLOTS;
  // Token meter:
  //   err  — pool below the structural floor (no distractor) or over cap
  //          (or some token has empty text).
  //   warn — pool valid but below the NCLEX 4-floor norm OR the 2×
  //          recommendation.
  //   ok   — meets or exceeds both.
  const tokenMeterState: ValidityState =
    summary.tokenCount < summary.tokenFloor ||
    summary.tokenCount > summary.tokenCap ||
    tokenTextEmpty
      ? 'err'
      : summary.tokenCount < summary.tokenRecommendedFloor ||
          summary.tokenCount < summary.tokenRecommended
        ? 'warn'
        : 'ok';
  // Distractor meter mirrors the token meter for the distractor count
  // specifically — below the structural ≥1 is err; below the recommended
  // amount is warn; meeting the recommendation is ok.
  const distractorRecommended = Math.max(
    0,
    summary.tokenRecommended - summary.activeSlotCount,
  );
  const distractorRequired = DCZ_TOKEN_POOL_MIN_EXTRA;
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
        type="DRAG_CLOZE"
        itemId={initial.itemId}
        surface={initial.surface}
      />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <EditorAuthorship
        realm={initial.surface}
        entityType={initial.surface === 'tutor' ? 'tutor_question' : 'bank_item'}
        itemId={initial.itemId}
        title={richTextToPlainLabel(initial.stem)}
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
              <RovingToolbar
                hint="Click into a field to format it"
                imageFieldKeys={STEM_IMAGE_KEYS}
              />
              <RichInstructionField
                value={instruction}
                onChange={(doc) => { setInstruction(doc); onDirty?.(); }}
              />
              <RichStemField
                value={stem}
                onChange={(doc) => { handleStemChange(doc); onDirty?.(); }}
              />

              {/* Marker toolbar */}
              <div className="auth-fg">
                <div className="auth-dd-toolbar">
                  <button
                    type="button"
                    className="auth-btn auth-btn-primary"
                    onClick={handleInsertMarker}
                    disabled={
                      pending ||
                      summary.activeSlotCount >= DCZ_MAX_SLOTS
                    }
                  >
                    [N] Insert slot marker
                  </button>
                  <span className="auth-hint">
                    Inserts the next free <code>[N]</code> at the
                    cursor in the stem. Each marker maps to one slot. Use single
                    brackets — double <code>[[…]]</code> is HIGHLIGHT syntax. Max{' '}
                    {DCZ_MAX_SLOTS}.
                  </span>
                </div>
              </div>

              <div className="auth-fg">
                <div className="auth-label-row">
                  <label className="auth-label">Slots *</label>
                </div>

                {/* Bounds meter — slot + token + distractor pills colour-code
                    against the structural floors (block Save) and the NCLEX
                    norms (amber nudge only; see classifications.ts header). */}
                <div className="auth-dd-bounds">
                  <span
                    className={`auth-dd-bounds-item auth-dd-${slotMeterState}`}
                    title={`Structural range ${DCZ_MIN_SLOTS}–${DCZ_MAX_SLOTS}. Most items use ${DCZ_RECOMMENDED_MIN_SLOTS}+.`}
                  >
                    {summary.activeSlotCount} slot
                    {summary.activeSlotCount === 1 ? '' : 's'} ({DCZ_MIN_SLOTS}
                    –{DCZ_MAX_SLOTS})
                  </span>
                  <span
                    className={`auth-dd-bounds-item auth-dd-${tokenMeterState}`}
                    title={`At least ${summary.tokenFloor} required, ${summary.tokenCap} max. NCLEX uses ${DCZ_TOKEN_POOL_RECOMMENDED_MIN}+; recommended ≈${summary.tokenRecommended} (2× slots).`}
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

                {/* Soft advisory — slot count is saveable but below the
                    recommended norm. Nudges, never blocks. */}
                {slotCountAdvisory && (
                  <p className="auth-dd-advisory">
                    Most NCLEX drag-cloze items use {DCZ_RECOMMENDED_MIN_SLOTS} or
                    more slots. This one has {summary.activeSlotCount} — that&apos;s
                    fine to save, just unusual.
                  </p>
                )}

                {/* Tab strip — one tab per slot (actives first, then
                    orphans). Status dot reflects per-slot validity:
                    green when a token is assigned, amber when empty.
                    Orphan tabs use a dashed warning style. */}
                {slots.length > 0 && (
                  <div className="auth-dd-tabs" role="tablist">
                    {activeSlots.map((s) => {
                      const isActive = s.id === activeSlotId;
                      const dot: ValidityState = s.assigned_token_id
                        ? 'ok'
                        : 'warn';
                      const labelN = slotIdToN(s.id);
                      const tabLabel = `[${labelN}]`;
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
                      Type [1], [2], … in the stem (or click &quot;+ Insert slot
                      marker&quot;) to create slots.
                    </div>
                  ) : activeSlot ? (
                    <SlotCard
                      key={activeSlot.id}
                      slot={activeSlot}
                      isActive={isSlotActive(activeSlot)}
                      isOrphan={!isSlotActive(activeSlot)}
                      availableTokens={tokensAvailableFor(activeSlot.id)}
                      disabled={pending}
                      onTargetText={(v) =>
                        setSlotField(activeSlot.id, { target_text: v })
                      }
                      onAssignedToken={(v) =>
                        setSlotField(activeSlot.id, { assigned_token_id: v })
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
                      tokens.length >= DCZ_TOKEN_POOL_ABSOLUTE_MAX
                    }
                  >
                    + Token
                  </button>
                </div>
                <p className="auth-hint">
                  Every slot needs its token plus at least one distractor. For
                  this question:{' '}
                  <strong>{summary.tokenFloor} required, {summary.tokenCap} max</strong>.
                  NCLEX pools typically hold{' '}
                  <strong>{DCZ_TOKEN_POOL_RECOMMENDED_MIN}–{DCZ_TOKEN_POOL_ABSOLUTE_MAX}</strong>{' '}
                  tokens; we recommend ≈ {summary.tokenRecommended} (about 2× slots)
                  so students can&apos;t solve by elimination.
                </p>
                <div className="auth-dd-tokens-wrap">
                  {tokens.map((t) => {
                    const isCorrect = slots.some(
                      (s) => s.assigned_token_id === t.id,
                    );
                    return (
                    <div key={t.id} className="auth-dd-token-card">
                      <div className="auth-dd-token-row">
                        <span className="auth-dd-token-id">{t.id}</span>
                        <input
                          type="text"
                          value={t.text}
                          onChange={(e) => updateTokenText(t.id, e.target.value)}
                          placeholder="Token text…"
                          className="auth-input"
                          disabled={pending}
                        />
                        <span
                          className={
                            'auth-dd-token-role' +
                            (isCorrect ? ' is-correct' : ' is-distractor')
                          }
                        >
                          {isCorrect ? 'Answer' : 'Distractor'}
                        </span>
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
                      {/* Feedback is rich (shows in review — at this token's slot
                          if it's the answer, or in the distractor strip if it's a
                          trap). The single HiddenSerialisers emits every token's
                          feedback in lockstep, so noHiddenInput (Cloze/Bow-tie
                          pattern). Token text stays plain. */}
                      <div className="auth-fg auth-dd-token-fb">
                        <label className="auth-label">Feedback (optional)</label>
                        <RovingRichField
                          fieldKey={`dcz-fb-${t.id}`}
                          name="dcz_token_feedback"
                          value={t.feedback}
                          onChange={(v) => updateTokenFeedback(t.id, v)}
                          inline
                          noHiddenInput
                          className="auth-rrf-option-fb"
                          ariaLabel={`Feedback for token ${t.id}`}
                          placeholder={
                            isCorrect
                              ? 'Why this is the right choice — shown after submit.'
                              : 'Why this is a trap — shown after submit.'
                          }
                        />
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              <HiddenSerialisers
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
                  difficulty_irt: initial.difficulty_irt,
                  difficulty_source: initial.difficulty_source,
                  bloom_level: initial.bloom_level,
                  tags: initial.tags,
                }}
              />
            </TabPanel>

            <TabPanel id="housekeeping">
              <HousekeepingFields
                mode={initial.mode}
                questionType="DRAG_CLOZE"
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
          <DragClozePreview
            instruction={instruction}
            stem={stem}
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
// DragClozeEditor — default standalone modal host. Same wiring as
// the other editors.
// ─────────────────────────────────────────────────────────────

export interface DragClozeEditorProps {
  initial: DragClozeEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function DragClozeEditor({
  initial,
  onClose,
  onSaved,
  onDeleted,
}: DragClozeEditorProps) {
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
          ? `Edit Drag-and-drop cloze — ${initial.itemId}`
          : 'New Drag-and-drop cloze question'
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
      <DragClozeEditorBody
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
