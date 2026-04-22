// mynclex/lib/bank/editors/drag-drop-editor.tsx
//
// Drag-drop authoring UI. Two subtypes:
//
//   ORDERED  — student ranks tokens into positions (1st, 2nd, ...).
//              All slot cards are always active.
//
//   SENTENCE — stem contains [N] markers; student drags tokens into
//              those markers. A slot card is "active" iff its id (sN)
//              matches an active marker in the stem. Orphans (card
//              in state, marker removed from stem) stay in state but
//              render dimmed and are dropped on save by the parser.
//
// Curator slot assignment is a <select> per slot (dropdown) — not
// drag-and-drop inside the editor. Student-side DnD is the runner's
// problem.
//
// Stem ↔ editor sync for SENTENCE: reads the shell's stem textarea by
// id (`bank-stem`) with an input listener, same pattern established
// by Cloze (Slice 1.8) and Highlight (1.9). Lifting stem into shared
// shell state is flagged for a future slice.
//
// FormData contract (hidden inputs):
//   dd_subtype                (single value)
//   dd_slot_id                (parallel array, incl. orphans for SENTENCE)
//   dd_slot_target_text       (parallel)
//   dd_slot_assigned_token_id (parallel; '' = unassigned)
//   dd_slot_feedback          (parallel)
//   dd_token_id               (parallel, no orphan concept)
//   dd_token_text             (parallel)

'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  MIN_DD_SLOTS,
  MAX_DD_SLOTS,
  DD_TOKEN_POOL_MAX_OVER_SLOTS,
  DD_TOKEN_POOL_ABSOLUTE_MAX,
} from '../classifications';

type Subtype = 'ORDERED' | 'SENTENCE';

interface SlotRow {
  id: string;
  target_text: string;
  assigned_token_id: string;
  feedback: string;
}

interface TokenRow {
  id: string;
  text: string;
}

// Shared with the server parser. Captures [1]..[99]; parser enforces 1..8.
const MARKER_RE = /\[(\d+)\]/g;
const STEM_DOM_ID = 'bank-stem';

// Default scaffold when the curator hits a fresh editor (or switches subtype).
function defaultSlots(subtype: Subtype): SlotRow[] {
  if (subtype === 'ORDERED') {
    return [
      { id: 's1', target_text: '1st', assigned_token_id: '', feedback: '' },
      { id: 's2', target_text: '2nd', assigned_token_id: '', feedback: '' },
      { id: 's3', target_text: '3rd', assigned_token_id: '', feedback: '' },
    ];
  }
  // SENTENCE — start empty so the curator's + Slot clicks drive the list.
  // The editor will auto-grow cards for markers typed into the stem.
  return [];
}

function defaultTokens(): TokenRow[] {
  return [
    { id: 't1', text: '' },
    { id: 't2', text: '' },
    { id: 't3', text: '' },
  ];
}

// Find the lowest positive integer N in [1..MAX_DD_SLOTS] that isn't
// already in `used`. Returns null if the cap is hit.
function nextFreeMarkerN(used: Set<number>): number | null {
  for (let n = 1; n <= MAX_DD_SLOTS; n++) {
    if (!used.has(n)) return n;
  }
  return null;
}

// Find the lowest positive integer N such that `tN` isn't in `used`.
// Unbounded — tokens only have a pool cap, not an id cap.
function nextFreeTokenN(used: Set<string>): number {
  let n = 1;
  while (used.has(`t${n}`)) n++;
  return n;
}

// Extract the set of active marker numbers from a SENTENCE stem.
// Duplicates are counted once (the parser rejects duplicate markers,
// but the editor has to handle the transient state without crashing).
function extractActiveMarkers(stem: string): Set<number> {
  const out = new Set<number>();
  for (const m of stem.matchAll(MARKER_RE)) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= MAX_DD_SLOTS) out.add(n);
  }
  return out;
}

interface DragDropEditorProps {
  initialSubtype: Subtype;
  initialSlots: SlotRow[];
  initialTokens: TokenRow[];
  initialStem: string;
}

export function DragDropEditor({
  initialSubtype,
  initialSlots,
  initialTokens,
  initialStem,
}: DragDropEditorProps) {
  const [subtype, setSubtype] = useState<Subtype>(initialSubtype);
  const [slots, setSlots]     = useState<SlotRow[]>(() => initialSlots);
  const [tokens, setTokens]   = useState<TokenRow[]>(() => initialTokens);
  const [stemText, setStemText] = useState<string>(initialStem);

  // SENTENCE-only: keep stemText in sync with the shell's stem textarea.
  // Auto-create a slot card when the curator types a new [N]; preserve
  // existing cards as orphans when they edit N back out.
  useEffect(() => {
    if (subtype !== 'SENTENCE') return;
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;

    const recompute = () => {
      const value = stemEl.value;
      setStemText(value);
      const active = extractActiveMarkers(value);

      setSlots((prev) => {
        // Preserve existing cards; append a new card for any newly-seen N.
        const haveIds = new Set(prev.map((s) => s.id));
        const next = [...prev];
        for (const n of active) {
          const id = `s${n}`;
          if (!haveIds.has(id)) {
            next.push({ id, target_text: '', assigned_token_id: '', feedback: '' });
          }
        }
        // Sort so sN cards appear in numeric order.
        next.sort((a, b) => {
          const an = parseInt(a.id.slice(1), 10);
          const bn = parseInt(b.id.slice(1), 10);
          return an - bn;
        });
        return next;
      });
    };

    // Initial recompute on mount + on every input.
    recompute();
    stemEl.addEventListener('input', recompute);
    return () => stemEl.removeEventListener('input', recompute);
  }, [subtype]);

  // Derive active vs orphan slots for rendering + bounds.
  const activeMarkers = useMemo(
    () => (subtype === 'SENTENCE' ? extractActiveMarkers(stemText) : null),
    [subtype, stemText],
  );
  const isSlotActive = (slot: SlotRow): boolean => {
    if (subtype === 'ORDERED') return true;
    const n = parseInt(slot.id.slice(1), 10);
    return Number.isFinite(n) && activeMarkers!.has(n);
  };
  const activeSlotCount = useMemo(
    () => slots.filter(isSlotActive).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, subtype, stemText],
  );

  const tokenCap = Math.min(
    activeSlotCount + DD_TOKEN_POOL_MAX_OVER_SLOTS,
    DD_TOKEN_POOL_ABSOLUTE_MAX,
  );
  const distractorCount = Math.max(0, tokens.length - activeSlotCount);

  // Bounds meter state — matches the handoff spec.
  let boundsState: 'ok' | 'warn' | 'err';
  if (
    activeSlotCount < MIN_DD_SLOTS ||
    activeSlotCount > MAX_DD_SLOTS ||
    tokens.length > tokenCap
  ) {
    boundsState = 'err';
  } else if (tokens.length < activeSlotCount) {
    boundsState = 'warn';
  } else {
    boundsState = 'ok';
  }

  // ── Handlers ──────────────────────────────────────────────────

  function handleSubtypeChange(next: Subtype) {
    if (subtype === next) return;
    const hasData =
      slots.some((s) => s.assigned_token_id || s.target_text || s.feedback) ||
      tokens.some((t) => t.text);
    if (
      hasData &&
      !window.confirm(
        'Switching subtype will clear all slots and tokens. The stem text is kept. Continue?',
      )
    ) {
      return;
    }
    setSubtype(next);
    setSlots(defaultSlots(next));
    setTokens(defaultTokens());
  }

  function addOrderedSlot() {
    if (activeSlotCount >= MAX_DD_SLOTS) return;
    const used = new Set(slots.map((s) => parseInt(s.id.slice(1), 10)).filter(Number.isFinite));
    let n = 1;
    while (used.has(n)) n++;
    const fallbackLabel = `${n}${suffix(n)}`;
    setSlots((prev) => [
      ...prev,
      { id: `s${n}`, target_text: fallbackLabel, assigned_token_id: '', feedback: '' },
    ]);
  }

  function removeSlot(slotId: string) {
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
  }

  function updateSlot(slotId: string, patch: Partial<SlotRow>) {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)));
  }

  // SENTENCE-only: insert a [N] marker at the stem textarea's cursor.
  // Finds the lowest unused N in 1..8; appends a new slot card for it.
  function insertSentenceMarker() {
    const stemEl = document.getElementById(STEM_DOM_ID) as HTMLTextAreaElement | null;
    if (!stemEl) return;
    const usedMarkers = extractActiveMarkers(stemEl.value);
    const n = nextFreeMarkerN(usedMarkers);
    if (n === null) {
      window.alert(`Already at the ${MAX_DD_SLOTS}-marker maximum.`);
      return;
    }
    const marker = `[${n}]`;
    const pre    = stemEl.value.slice(0, stemEl.selectionStart ?? stemEl.value.length);
    const post   = stemEl.value.slice(stemEl.selectionEnd ?? stemEl.value.length);
    const padded = pre.length > 0 && !/\s$/.test(pre) ? ` ${marker}` : marker;
    stemEl.value = pre + padded + post;
    // Fire input so the shell's controlled state + this editor's listener sync.
    stemEl.dispatchEvent(new Event('input', { bubbles: true }));
    // Place the cursor after the inserted marker.
    const caret = pre.length + padded.length;
    stemEl.focus();
    stemEl.setSelectionRange(caret, caret);
  }

  function addToken() {
    if (tokens.length >= tokenCap && boundsState !== 'err') {
      // Soft cap — the bounds meter will flip to err if exceeded, but we
      // still allow adding because the curator may be about to add slots
      // too. Hard cap is DD_TOKEN_POOL_ABSOLUTE_MAX.
    }
    if (tokens.length >= DD_TOKEN_POOL_ABSOLUTE_MAX) return;
    const used = new Set(tokens.map((t) => t.id));
    const n = nextFreeTokenN(used);
    setTokens((prev) => [...prev, { id: `t${n}`, text: '' }]);
  }

  function removeToken(tokenId: string) {
    if (tokens.length <= 1) return;
    setTokens((prev) => prev.filter((t) => t.id !== tokenId));
    // Unassign any slot that was pointing at the removed token.
    setSlots((prev) =>
      prev.map((s) => (s.assigned_token_id === tokenId ? { ...s, assigned_token_id: '' } : s)),
    );
  }

  function updateToken(tokenId: string, text: string) {
    setTokens((prev) => prev.map((t) => (t.id === tokenId ? { ...t, text } : t)));
  }

  // For each slot's dropdown: the list of tokens NOT already assigned
  // to a different slot (so duplicates can't be selected through the UI).
  function tokensAvailableFor(slotId: string): TokenRow[] {
    const takenElsewhere = new Set<string>();
    for (const s of slots) {
      if (s.id !== slotId && s.assigned_token_id) takenElsewhere.add(s.assigned_token_id);
    }
    return tokens.filter((t) => !takenElsewhere.has(t.id));
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="bank-fg">
      <label className="bank-label">Drag-drop authoring</label>

      {/* Subtype picker */}
      <div className="bank-dd-subtype-bar" role="radiogroup" aria-label="Drag-drop subtype">
        {(['ORDERED', 'SENTENCE'] as const).map((st) => (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={subtype === st}
            className={
              subtype === st
                ? 'bank-dd-subtype-opt active'
                : 'bank-dd-subtype-opt'
            }
            onClick={() => handleSubtypeChange(st)}
          >
            {st === 'ORDERED' ? 'Ordered list' : 'Sentence slots'}
          </button>
        ))}
      </div>

      {subtype === 'SENTENCE' && (
        <div className="bank-dd-stem-toolbar">
          <button
            type="button"
            onClick={insertSentenceMarker}
            className="bank-btn bank-btn-ghost bank-btn-sm"
          >
            + Slot marker
          </button>
          <span className="bank-hint">
            Inserts <code>[N]</code> at the cursor in the stem.
            Max {MAX_DD_SLOTS} markers. Each marker maps to one slot.
          </span>
        </div>
      )}

      {/* Slot cards */}
      <div className="bank-dd-slots-wrap">
        <div className="bank-dd-section-head">
          <strong>Slots</strong>
          {subtype === 'ORDERED' && (
            <button
              type="button"
              onClick={addOrderedSlot}
              disabled={activeSlotCount >= MAX_DD_SLOTS}
              className="bank-btn bank-btn-ghost bank-btn-sm"
            >
              + Slot
            </button>
          )}
        </div>

        {slots.length === 0 ? (
          <div className="bank-hint">
            {subtype === 'SENTENCE'
              ? 'Type [1], [2], … in the stem (or use "+ Slot marker") to create slots.'
              : 'No slots yet — click "+ Slot" to add one.'}
          </div>
        ) : (
          slots.map((slot) => {
            const active = isSlotActive(slot);
            return (
              <Fragment key={slot.id}>
                <div
                  className={
                    active
                      ? 'bank-dd-slot-card'
                      : 'bank-dd-slot-card orphan'
                  }
                >
                  <div className="bank-dd-slot-header">
                    <span className="bank-dd-slot-id">
                      {subtype === 'SENTENCE'
                        ? `[${slot.id.slice(1)}]`
                        : slot.id}
                    </span>
                    {!active && (
                      <span className="bank-dd-slot-orphan-tag">
                        orphan — will drop on save
                      </span>
                    )}
                    {subtype === 'ORDERED' && slots.length > MIN_DD_SLOTS && (
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.id)}
                        className="bank-btn bank-btn-ghost bank-btn-sm"
                        aria-label={`Remove slot ${slot.id}`}
                      >
                        × Remove
                      </button>
                    )}
                  </div>

                  <div className="bank-fg">
                    <label className="bank-label">
                      {subtype === 'ORDERED' ? 'Position label' : 'Hint (optional)'}
                    </label>
                    <input
                      type="text"
                      value={slot.target_text}
                      onChange={(e) =>
                        updateSlot(slot.id, { target_text: e.target.value })
                      }
                      placeholder={
                        subtype === 'ORDERED'
                          ? 'e.g. 1st action'
                          : 'e.g. most likely condition'
                      }
                      className="bank-input"
                    />
                  </div>

                  <div className="bank-fg">
                    <label className="bank-label">Correct token</label>
                    <select
                      value={slot.assigned_token_id}
                      onChange={(e) =>
                        updateSlot(slot.id, { assigned_token_id: e.target.value })
                      }
                      className="bank-dd-slot-select bank-input"
                      disabled={!active}
                    >
                      <option value="">— none —</option>
                      {tokensAvailableFor(slot.id).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.id}: {t.text || '(empty)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bank-fg">
                    <label className="bank-label">Feedback (optional)</label>
                    <textarea
                      value={slot.feedback}
                      onChange={(e) =>
                        updateSlot(slot.id, { feedback: e.target.value })
                      }
                      rows={2}
                      placeholder="Optional per-slot feedback shown after submit."
                      className="bank-dd-slot-feedback bank-input"
                      disabled={!active}
                    />
                  </div>
                </div>

                {/* Hidden serialisers for this slot — all slots, incl. orphans */}
                <input type="hidden" name="dd_slot_id" value={slot.id} />
                <input type="hidden" name="dd_slot_target_text" value={slot.target_text} />
                <input type="hidden" name="dd_slot_assigned_token_id" value={slot.assigned_token_id} />
                <input type="hidden" name="dd_slot_feedback" value={slot.feedback} />
              </Fragment>
            );
          })
        )}
      </div>

      {/* Token pool */}
      <div className="bank-dd-token-pool">
        <div className="bank-dd-section-head">
          <strong>Token pool</strong>
          <button
            type="button"
            onClick={addToken}
            disabled={tokens.length >= DD_TOKEN_POOL_ABSOLUTE_MAX}
            className="bank-btn bank-btn-ghost bank-btn-sm"
          >
            + Token
          </button>
        </div>

        {tokens.map((token) => (
          <Fragment key={token.id}>
            <div className="bank-dd-token-row">
              <span className="bank-dd-slot-id">{token.id}</span>
              <input
                type="text"
                value={token.text}
                onChange={(e) => updateToken(token.id, e.target.value)}
                placeholder="Token text"
                className="bank-input"
              />
              <button
                type="button"
                onClick={() => removeToken(token.id)}
                disabled={tokens.length <= 1}
                className="bank-btn bank-btn-ghost bank-btn-sm"
                aria-label={`Remove token ${token.id}`}
              >
                ×
              </button>
            </div>
            <input type="hidden" name="dd_token_id" value={token.id} />
            <input type="hidden" name="dd_token_text" value={token.text} />
          </Fragment>
        ))}
      </div>

      {/* Bounds meter */}
      <div className="bank-dd-bounds-meter">
        <span className={`bank-dd-bounds-item ${boundsState}`}>
          {activeSlotCount} of {MAX_DD_SLOTS} slots
        </span>
        <span className={`bank-dd-bounds-item ${boundsState}`}>
          {tokens.length} token{tokens.length === 1 ? '' : 's'}
        </span>
        <span className={`bank-dd-bounds-item ${distractorCount >= 0 ? 'ok' : 'warn'}`}>
          {distractorCount} distractor{distractorCount === 1 ? '' : 's'}
        </span>
        <span className="bank-hint">
          Pool: {activeSlotCount}–{tokenCap} tokens allowed.
        </span>
      </div>

      {/* Subtype serialiser */}
      <input type="hidden" name="dd_subtype" value={subtype} />
    </div>
  );
}

function suffix(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'st';
  if (mod10 === 2 && mod100 !== 12) return 'nd';
  if (mod10 === 3 && mod100 !== 13) return 'rd';
  return 'th';
}
