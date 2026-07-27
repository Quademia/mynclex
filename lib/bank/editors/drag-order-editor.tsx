// mynclex/lib/bank/editors/drag-order-editor.tsx
//
// DRAG_ORDER editor — the ORDERED half of the old DRAG_DROP type, split
// into its own standalone type. The student ranks tokens into positions
// (1st, 2nd, …). All slot cards are always active; the curator clicks
// "+ Slot" to add up to DO_MAX_SLOTS. There are NO stem markers — the stem
// is a plain rich prompt — and NO subtype switch (SENTENCE now lives in
// DRAG_CLOZE).
//
// Layout: paned slot cards. A tab strip lists every slot (one tab each,
// with a status dot for assigned/unassigned) and a single slot card renders
// below for the active tab. Keeps the editor pane from becoming a long
// scroll when all 8 slots are populated. Token pool is stacked below the
// slot panel (still always visible since slot dropdowns reference it).
//
// Dual-mode preview ships from day one. Default view: student.
//
// FormData contract (must match save-question.ts DRAG_ORDER branch):
//   do_slot_id                (parallel array)
//   do_slot_target_text       (parallel)
//   do_slot_assigned_token_id (parallel; '' = unassigned)
//   do_token_id               (parallel)
//   do_token_text             (parallel)
//   do_token_feedback         (parallel; rich — every token can be explained)

'use client';

import { Fragment, useState } from 'react';
import {
  DO_MIN_SLOTS,
  DO_MAX_SLOTS,
  DO_RECOMMENDED_MIN_SLOTS,
  DO_TOKEN_POOL_MAX_OVER_SLOTS,
  DO_TOKEN_POOL_ABSOLUTE_MAX,
  DO_TOKEN_POOL_MIN_EXTRA,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { EditorAuthorship } from '@/lib/audit/authorship-line';
import {
  RovingProvider,
  RovingToolbar,
  RovingRichField,
} from '@/lib/authoring/roving-rich';
import {
  RichStemField,
  RichInstructionField,
  RichRationaleFields,
  STEM_IMAGE_KEYS,
} from '@/lib/authoring/rich-atoms';
import { RichRender } from '@/lib/authoring/rich-render';
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
  type DragOrderEditorInitial,
  type DragOrderEditorSlot,
  type DragOrderEditorToken,
} from './drag-order-row-mapper';

export type { DragOrderEditorInitial };

const FORM_ID = 'auth-drag-order-form';

type ValidityState = 'ok' | 'warn' | 'err';

// ─────────────────────────────────────────────────────────────
// Helpers (private).
// ─────────────────────────────────────────────────────────────

function slotIdToN(slotId: string): number {
  const n = parseInt(slotId.slice(1), 10);
  return Number.isFinite(n) ? n : NaN;
}

function nextFreeTokenN(used: Set<string>): number {
  let n = 1;
  while (used.has(`t${n}`)) n++;
  return n;
}

interface BoundsSummary {
  activeSlotCount: number;
  tokenCount: number;
  tokenFloor: number;             // HARD pool minimum = slots (distractors optional)
  tokenCap: number;               // pool maximum (slots + extras, NCLEX 10 ceiling)
  distractorCount: number;
  unassignedActive: number;
}

function summarise(
  slots: DragOrderEditorSlot[],
  tokens: DragOrderEditorToken[],
): BoundsSummary {
  // ORDERED — every slot is active (no markers, no orphans).
  const activeSlotCount = slots.length;
  const tokenCount = tokens.length;
  // HARD floor — one token per position. Distractors are OPTIONAL for an
  // ordered-response item (classically you arrange exactly the given items),
  // so DO_TOKEN_POOL_MIN_EXTRA is 0 and there is no pool-size recommendation.
  const tokenFloor = activeSlotCount + DO_TOKEN_POOL_MIN_EXTRA;
  const tokenCap = Math.min(
    activeSlotCount + DO_TOKEN_POOL_MAX_OVER_SLOTS,
    DO_TOKEN_POOL_ABSOLUTE_MAX,
  );
  return {
    activeSlotCount,
    tokenCount,
    tokenFloor,
    tokenCap,
    distractorCount: Math.max(0, tokenCount - activeSlotCount),
    unassignedActive: slots.filter(
      (s) => s.assigned_token_id.trim() === '',
    ).length,
  };
}

function contentValidity(
  s: BoundsSummary,
  tokenTextEmpty: boolean,
): ValidityState {
  if (s.activeSlotCount < DO_MIN_SLOTS) return 'err';
  if (s.activeSlotCount > DO_MAX_SLOTS) return 'err';
  if (s.tokenCount < s.tokenFloor) return 'err';
  if (s.tokenCount > s.tokenCap) return 'err';
  if (tokenTextEmpty) return 'err';
  if (s.unassignedActive > 0) return 'warn';
  return 'ok';
}

// ─────────────────────────────────────────────────────────────
// DragOrderPreview — dual-mode preview rendered in the right pane.
// Student view: numbered empty slot rows + token pool. Answer-key view:
// each slot filled with its correct token; remaining tokens shown as
// "distractor" tags.
// ─────────────────────────────────────────────────────────────

interface DragOrderPreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  slots: DragOrderEditorSlot[];
  tokens: DragOrderEditorToken[];
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function DragOrderPreview({
  instruction,
  stem,
  slots,
  tokens,
  viewMode,
  onViewModeChange,
}: DragOrderPreviewProps) {
  const tokenById = new Map<string, DragOrderEditorToken>();
  for (const t of tokens) tokenById.set(t.id, t);

  // Tokens used by any slot — distractors are the rest in the runner.
  const usedTokenIds = new Set<string>();
  for (const s of slots) {
    if (s.assigned_token_id) usedTokenIds.add(s.assigned_token_id);
  }

  function renderSlotBox(slot: DragOrderEditorSlot, displayIndex: number) {
    const token =
      slot.assigned_token_id ? tokenById.get(slot.assigned_token_id) : null;
    const filled = viewMode === 'answer-key' && token;
    const labelN = displayIndex + 1;
    const numberLabel = slot.target_text.trim() || ordinalLabel(labelN);

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
        {slot.target_text.trim() && (
          <span className="auth-dd-preview-slot-hint">
            {slot.target_text}
          </span>
        )}
      </div>
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

        {isEmptyRichDoc(stem) ? (
          <em className="auth-dd-preview-placeholder">
            Write the prompt above (e.g.{' '}
            <code>Place these steps in order…</code>).
          </em>
        ) : (
          <RichRender doc={stem} className="auth-dd-preview-passage" custom={curatorBankImageRenderer} />
        )}

        {/* Slot list — a numbered stack. */}
        <div className="auth-dd-preview-slots">
          {slots.length === 0 ? (
            <em className="auth-dd-preview-placeholder">
              Add slots in the editor — at least {DO_MIN_SLOTS} ranked
              positions ({DO_RECOMMENDED_MIN_SLOTS}+ recommended).
            </em>
          ) : (
            slots.map((s, i) => renderSlotBox(s, i))
          )}
        </div>

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
// SlotCard — one card per slot. ORDERED slots are always active.
// Curator picks the correct token via a <select>; the position label is
// optional.
// ─────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot: DragOrderEditorSlot;
  showRemove: boolean;
  availableTokens: DragOrderEditorToken[];
  disabled: boolean;
  onTargetText: (next: string) => void;
  onAssignedToken: (next: string) => void;
  onRemove?: () => void;
}

function SlotCard({
  slot,
  showRemove,
  availableTokens,
  disabled,
  onTargetText,
  onAssignedToken,
  onRemove,
}: SlotCardProps) {
  const cardClass =
    'auth-dd-slot-card' +
    (slot.assigned_token_id
      ? ' auth-dd-slot-card-filled'
      : ' auth-dd-slot-card-empty');

  return (
    <div className={cardClass}>
      <div className="auth-dd-slot-head">
        <div className="auth-dd-slot-title">
          <span className="auth-dd-slot-id">{slot.id}</span>
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

      <div className="auth-dd-slot-body">
        <div className="auth-fg">
          <label className="auth-label">Position label</label>
          <input
            type="text"
            value={slot.target_text}
            onChange={(e) => onTargetText(e.target.value)}
            placeholder="e.g. 1st action"
            className="auth-input"
            disabled={disabled}
          />
        </div>

        <div className="auth-fg">
          <label className="auth-label">Correct token *</label>
          <select
            value={slot.assigned_token_id}
            onChange={(e) => onAssignedToken(e.target.value)}
            className="auth-input auth-dd-slot-select"
            disabled={disabled}
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
// HiddenSerialisers — emit FormData inputs for every slot and every
// token. Token feedback is emitted in lockstep here (the RovingRichField
// uses noHiddenInput).
// ─────────────────────────────────────────────────────────────

function HiddenSerialisers({
  slots,
  tokens,
}: {
  slots: DragOrderEditorSlot[];
  tokens: DragOrderEditorToken[];
}) {
  return (
    <>
      {slots.map((s) => (
        <Fragment key={`hid-slot-${s.id}`}>
          <input type="hidden" name="do_slot_id" value={s.id} />
          <input type="hidden" name="do_slot_target_text" value={s.target_text} />
          <input
            type="hidden"
            name="do_slot_assigned_token_id"
            value={s.assigned_token_id}
          />
        </Fragment>
      ))}
      {tokens.map((t) => (
        <Fragment key={`hid-tok-${t.id}`}>
          <input type="hidden" name="do_token_id" value={t.id} />
          <input type="hidden" name="do_token_text" value={t.text} />
          <input
            type="hidden"
            name="do_token_feedback"
            value={serializeRichDoc(t.feedback)}
          />
        </Fragment>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// DragOrderEditorBody — two-pane edit + preview body. Mountable
// anywhere (modal host or sandbox).
// ─────────────────────────────────────────────────────────────

export interface DragOrderEditorBodyProps {
  initial: DragOrderEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function DragOrderEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: DragOrderEditorBodyProps) {
  const [tab, setTab] = useState<
    'content' | 'classification' | 'housekeeping'
  >('content');
  const [clientError, setClientError] = useState<string | null>(null);
  // DRAG_ORDER defaults to 'student' — curator usually previews the
  // pool + empty slots first, then flips to answer-key to verify the
  // assignment.
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');
  // Slice 8 — hold Save while a stem-image upload is in flight (saving
  // then would persist a not-yet-filled image block).
  const uploadsInFlight = useAuthUploadsInFlight();

  // Stem / instruction / rationale are rich docs. Read-coerce via
  // parseRichDoc (legacy plain text wraps as paragraphs; no migration). The
  // ORDERED stem is a plain prompt — no markers.
  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() =>
    parseRichDoc(initial.instruction),
  );
  const [rationale, setRationale] = useState<RichDoc>(() =>
    parseRichDoc(initial.rationale),
  );
  const [slots, setSlots] = useState<DragOrderEditorSlot[]>(initial.slots);
  const [tokens, setTokens] = useState<DragOrderEditorToken[]>(initial.tokens);
  const [category, setCategory] = useState(initial.client_needs_category);

  // The slots editor is paned: only one slot's card renders at a time,
  // with a tab strip above letting the curator switch. Initial active
  // = first slot's id.
  const [activeSlotId, setActiveSlotId] = useState<string | null>(
    () => initial.slots[0]?.id ?? null,
  );

  const tokenTextEmpty = tokens.some((t) => t.text.trim() === '');
  const summary = summarise(slots, tokens);
  const validity = contentValidity(summary, tokenTextEmpty);
  const contentIncomplete = validity !== 'ok';
  const classificationIncomplete = !category;

  // Live marks for the Housekeeping readout: DRAG_ORDER max = count of slots.
  // summary.activeSlotCount matches the parser's `correct.slots` key count.
  const liveMarks = summary.activeSlotCount;

  // ─────────────────────────────────────────────────────────────
  // + Slot / × Remove
  // ─────────────────────────────────────────────────────────────

  function addOrderedSlot() {
    if (summary.activeSlotCount >= DO_MAX_SLOTS) return;
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
  // Per-slot mutations
  // ─────────────────────────────────────────────────────────────

  function setSlotField(
    slotId: string,
    patch: Partial<DragOrderEditorSlot>,
  ) {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Token pool mutations
  // ─────────────────────────────────────────────────────────────

  function addToken() {
    if (tokens.length >= DO_TOKEN_POOL_ABSOLUTE_MAX) return;
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
  function tokensAvailableFor(slotId: string): DragOrderEditorToken[] {
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

  // The single slot card that's currently visible. Falls back to the
  // first slot if `activeSlotId` is stale (e.g. it pointed at a slot
  // that was removed).
  const activeSlot =
    slots.find((s) => s.id === activeSlotId) ?? slots[0] ?? null;

  // Bounds meter colour states (per pill). Advise > block: 'err' marks a
  // structural break that blocks Save; 'warn' is a norm nudge that saves fine.
  // Slot meter:
  //   err  — outside the structural 2–8 range.
  //   warn — valid but below the recommended 3 (a norm, not a wall).
  const slotMeterState: ValidityState =
    summary.activeSlotCount < DO_MIN_SLOTS ||
    summary.activeSlotCount > DO_MAX_SLOTS
      ? 'err'
      : summary.activeSlotCount < DO_RECOMMENDED_MIN_SLOTS
        ? 'warn'
        : 'ok';
  // Slot-count advisory line: in-range but below the recommended count.
  const slotCountAdvisory =
    summary.activeSlotCount >= DO_MIN_SLOTS &&
    summary.activeSlotCount < DO_RECOMMENDED_MIN_SLOTS;
  // Token meter (ordered-response): one token per position is the only hard
  // rule. Distractors are OPTIONAL, so there is no pool-size nudge — green
  // whenever the pool is in [slots, cap].
  //   err  — fewer tokens than positions, over cap, or a token has empty text.
  //   ok   — otherwise.
  const tokenMeterState: ValidityState =
    summary.tokenCount < summary.tokenFloor ||
    summary.tokenCount > summary.tokenCap ||
    tokenTextEmpty
      ? 'err'
      : 'ok';
  // Distractor meter is informational only — distractors are optional for an
  // ordering item, so it never errs or warns.
  const distractorMeterState: ValidityState = 'ok';
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
        type="DRAG_ORDER"
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
                onChange={(doc) => { setStem(doc); onDirty?.(); }}
              />

              <div className="auth-fg">
                <div className="auth-label-row">
                  <label className="auth-label">Slots *</label>
                  <button
                    type="button"
                    className="auth-btn auth-btn-ghost auth-btn-sm"
                    onClick={addOrderedSlot}
                    disabled={
                      pending ||
                      summary.activeSlotCount >= DO_MAX_SLOTS
                    }
                  >
                    + Slot
                  </button>
                </div>

                {/* Bounds meter — slot + token + distractor pills colour-code
                    against the structural floors (block Save) and the NCLEX
                    norms (amber nudge only; see classifications.ts header). */}
                <div className="auth-dd-bounds">
                  <span
                    className={`auth-dd-bounds-item auth-dd-${slotMeterState}`}
                    title={`Structural range ${DO_MIN_SLOTS}–${DO_MAX_SLOTS}. Most items use ${DO_RECOMMENDED_MIN_SLOTS}+.`}
                  >
                    {summary.activeSlotCount} slot
                    {summary.activeSlotCount === 1 ? '' : 's'} ({DO_MIN_SLOTS}
                    –{DO_MAX_SLOTS})
                  </span>
                  <span
                    className={`auth-dd-bounds-item auth-dd-${tokenMeterState}`}
                    title={`One token per position (${summary.tokenFloor} needed). Up to ${summary.tokenCap} allowed if you add optional distractors.`}
                  >
                    {summary.tokenCount} token
                    {summary.tokenCount === 1 ? '' : 's'} (
                    {summary.tokenFloor}–{summary.tokenCap})
                  </span>
                  <span
                    className={`auth-dd-bounds-item auth-dd-${distractorMeterState}`}
                    title="Distractors are optional for an ordering item."
                  >
                    {summary.distractorCount} distractor
                    {summary.distractorCount === 1 ? '' : 's'} (optional)
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
                    Most NCLEX drag-to-order items use {DO_RECOMMENDED_MIN_SLOTS} or
                    more slots. This one has {summary.activeSlotCount} — that&apos;s
                    fine to save, just unusual.
                  </p>
                )}

                {/* Tab strip — one tab per slot. Status dot reflects per-slot
                    validity: green when a token is assigned, amber when empty. */}
                {slots.length > 0 && (
                  <div className="auth-dd-tabs" role="tablist">
                    {slots.map((s, i) => {
                      const isActive = s.id === activeSlotId;
                      const dot: ValidityState = s.assigned_token_id
                        ? 'ok'
                        : 'warn';
                      const tabLabel = `Slot ${i + 1}`;
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
                  </div>
                )}

                {/* Single active slot panel (or empty state). */}
                <div className="auth-dd-slot-panel-wrap">
                  {slots.length === 0 ? (
                    <div className="auth-dd-slots-empty">
                      No slots yet — click &quot;+ Slot&quot; to add one.
                    </div>
                  ) : activeSlot ? (
                    <SlotCard
                      key={activeSlot.id}
                      slot={activeSlot}
                      showRemove={summary.activeSlotCount > DO_MIN_SLOTS}
                      availableTokens={tokensAvailableFor(activeSlot.id)}
                      disabled={pending}
                      onTargetText={(v) =>
                        setSlotField(activeSlot.id, { target_text: v })
                      }
                      onAssignedToken={(v) =>
                        setSlotField(activeSlot.id, { assigned_token_id: v })
                      }
                      onRemove={() => removeOrderedSlot(activeSlot.id)}
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
                      tokens.length >= DO_TOKEN_POOL_ABSOLUTE_MAX
                    }
                  >
                    + Token
                  </button>
                </div>
                <p className="auth-hint">
                  One token per position — for this question:{' '}
                  <strong>{summary.tokenFloor} required, {summary.tokenCap} max</strong>.
                  Distractors (extra tokens that don&apos;t belong in the order)
                  are <strong>optional</strong>: add a few if you want students to
                  rule them out, or none for a pure ordering task.
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
                          fieldKey={`do-fb-${t.id}`}
                          name="do_token_feedback"
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
                canReserveCat={initial.surface === 'admin'}
                mode={initial.mode}
                questionType="DRAG_ORDER"
                defaults={{
                  marks: liveMarks,
                  question_ref: initial.question_ref,
                  batch_id: initial.batch_id,
                  is_published: initial.is_published,
                  cat_pool: initial.cat_pool,
                  is_free_sample: initial.is_free_sample,
                  is_builder_visible: initial.is_builder_visible,
                  shuffle_options: initial.shuffle_options,
                }}
              />
            </TabPanel>
          </EditorTabs>
        </div>

        <div className="auth-preview">
          <DragOrderPreview
            instruction={instruction}
            stem={stem}
            slots={slots}
            tokens={tokens}
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
// DragOrderEditor — default standalone modal host. Same wiring as
// the other editors.
// ─────────────────────────────────────────────────────────────

export interface DragOrderEditorProps {
  initial: DragOrderEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function DragOrderEditor({
  initial,
  onClose,
  onSaved,
  onDeleted,
}: DragOrderEditorProps) {
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
          ? `Edit Drag to order — ${initial.itemId}`
          : 'New Drag-to-order question'
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
      <DragOrderEditorBody
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
