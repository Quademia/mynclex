// mynclex/lib/practice/runner/types/drag-order.tsx
//
// DRAG_ORDER runner — the ORDERED half of the old DRAG_DROP type, split
// into its own standalone type. A numbered slot list (1st, 2nd, …) renders
// below the stem; the curator's `slot.target_text` is each slot's label and
// students tap-to-place tokens from a pool. There are NO stem markers — the
// stem is a plain rich prompt rendered by the host page, NOT here — so this
// runner renders only the slot list + token pool.
//
// Interaction model — CLICK-TO-PLACE, not real HTML5 drag-and-drop.
// The audience is phone-first and HTML5 DnD's touch story is bad. The
// type is named DRAG_ORDER for product reasons but the implementation is
// tap-token-then-tap-slot, which is fully accessible and works on every
// device:
//   • Tap a token in the pool      → token becomes "armed" (lift +
//                                     accent border).
//   • Tap an empty slot            → armed token moves into it; pool
//                                     shrinks.
//   • Tap an already-armed token   → disarm (cancel).
//   • Tap a FILLED slot, no arm    → token returns to pool, slot
//                                     empties.
//   • Tap a FILLED slot, w/ arm    → swap: old returns to pool, new
//                                     fills.
//   • A token is "in the pool" or "in a slot" — never both. Tokens are
//     only placeable from the pool.
//
// Submit gate — every slot must be filled. Distractors can stay
// unplaced. Hint when blocked: "X of N slots filled — finish all to
// submit". A half-placed answer isn't an opinion, it's incomplete.
//
// Review-mode prose: a single "Correct order" block. For each slot in
// canonical (rank) order, render a green answer-key card (number +
// target_text + correct token) with the rationale stacked beneath it.
// Feedback is keyed by TOKEN, so a slot's rationale is the rationale on
// its CORRECT token, and every distractor carries its own rationale
// (shown in the distractor strip). The student's own pick verdict already
// lives in the slot rows above, so we don't repeat "you placed X" here.

'use client';

import { useMemo, useState } from 'react';
import type {
  DragOrderContent,
  DragOrderCorrect,
  DragOrderSlot,
  DragOrderToken,
} from '@/lib/bank/types';
import type { DragOrderAnswer } from '@/lib/scoring';
import { parseRichDoc, isEmptyRichDoc } from '@/lib/authoring/rich-doc';
import { RichRender } from '@/lib/authoring/rich-render';

type DragOrderRunnerProps = {
  stem:    string;
  content: DragOrderContent;
} & (
  | {
      mode:     'answering';
      selected: DragOrderAnswer;
      onChange: (next: DragOrderAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: DragOrderAnswer;
      correct:       DragOrderCorrect;
    }
);

export function isDragOrderComplete(
  answer:  DragOrderAnswer | undefined,
  content: DragOrderContent,
): boolean {
  if (!answer) return false;
  for (const s of content.slots) {
    if (!answer[s.id]) return false;
  }
  return true;
}


export function DragOrderRunner(props: DragOrderRunnerProps) {
  const { content } = props;
  const isReview          = props.mode === 'review';
  const [armedTokenId, setArmedTokenId] = useState<string | null>(null);

  // Convenience handles to the right answer / rubric for the active mode.
  const currentAnswer: DragOrderAnswer        = isReview ? props.studentAnswer : props.selected;
  const correctAnswer: DragOrderCorrect | null = isReview ? props.correct : null;

  // Lookup maps (stable identities for cheap renders).
  const tokenById = useMemo(() => {
    const m = new Map<string, DragOrderToken>();
    for (const t of content.tokens) m.set(t.id, t);
    return m;
  }, [content.tokens]);

  // Tokens currently sitting in any slot — they're not in the pool.
  const placedTokens = useMemo(() => {
    const set = new Set<string>();
    for (const tid of Object.values(currentAnswer)) {
      if (tid) set.add(tid);
    }
    return set;
  }, [currentAnswer]);

  const availableTokens = useMemo(
    () => content.tokens.filter((t) => !placedTokens.has(t.id)),
    [content.tokens, placedTokens],
  );

  const filledCount = useMemo(
    () => content.slots.filter((s) => Boolean(currentAnswer[s.id])).length,
    [content.slots, currentAnswer],
  );
  const totalCount = content.slots.length;

  function handleTokenClick(tokenId: string) {
    if (isReview) return;
    setArmedTokenId((prev) => (prev === tokenId ? null : tokenId));
  }

  function handleSlotClick(slotId: string) {
    if (isReview) return;
    const occupant = currentAnswer[slotId];
    const next     = { ...props.selected };

    if (armedTokenId) {
      // Place — bumped occupant returns to pool by virtue of leaving
      // the answer map.
      next[slotId] = armedTokenId;
      setArmedTokenId(null);
    } else if (occupant) {
      // Tap filled slot, nothing armed → unplace.
      delete next[slotId];
    } else {
      return; // empty slot, nothing armed → no-op
    }
    props.onChange(next);
  }

  // Progressive hint copy — mirrors SELECT_N / HIGHLIGHT / CLOZE pattern.
  let hintText: string;
  if (armedTokenId) {
    hintText = 'Token ready — tap a slot to place it.';
  } else if (filledCount === 0) {
    hintText = 'Tap a token, then tap a slot to place it.';
  } else if (filledCount === totalCount) {
    hintText = `All ${totalCount} slots filled · tap a slot to undo if needed.`;
  } else {
    hintText = `${filledCount} of ${totalCount} slots filled · tap a token to continue.`;
  }

  return (
    <>
      {!isReview && <div className="rn-dd-hint">{hintText}</div>}

      <div className="rn-dd-slots">
        {content.slots.map((slot, idx) => {
          const placedTokenId = currentAnswer[slot.id];
          const placedToken   = placedTokenId ? tokenById.get(placedTokenId) : undefined;
          const isCorrect     = isReview && correctAnswer
            ? placedTokenId === correctAnswer.slots[slot.id]
            : false;
          const isArmedTarget =
            !isReview && armedTokenId !== null && !placedTokenId;

          return (
            <SlotRow
              key={slot.id}
              idx={idx}
              slot={slot}
              placedToken={placedToken}
              isReview={isReview}
              isCorrect={isCorrect}
              isArmedTarget={isArmedTarget}
              onClick={() => handleSlotClick(slot.id)}
            />
          );
        })}
      </div>

      {!isReview && (
        <div className="rn-dd-pool">
          <div className="rn-dd-pool-label">
            {availableTokens.length === 0 ? 'All tokens placed' : 'Tokens'}
          </div>
          <div className="rn-dd-pool-tokens">
            {availableTokens.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`rn-dd-token${armedTokenId === t.id ? ' armed' : ''}`}
                onClick={() => handleTokenClick(t.id)}
                aria-pressed={armedTokenId === t.id}
              >
                {t.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {isReview && correctAnswer && (
        <DragOrderFeedbackList
          slots={content.slots}
          tokens={content.tokens}
          correct={correctAnswer}
        />
      )}
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface SlotRowProps {
  idx:           number;
  slot:          DragOrderSlot;
  placedToken:   DragOrderToken | undefined;
  isReview:      boolean;
  isCorrect:     boolean;
  isArmedTarget: boolean;
  onClick:       () => void;
}
function SlotRow({
  idx, slot, placedToken, isReview, isCorrect, isArmedTarget, onClick,
}: SlotRowProps) {
  const cls = ['rn-dd-slot-row'];
  if (placedToken) cls.push('filled');
  if (!isReview && isArmedTarget) cls.push('armed-target');
  if (isReview) {
    cls.push('locked');
    if      (!placedToken) cls.push('skipped');
    else if (isCorrect)    cls.push('right');
    else                   cls.push('wrong');
  }

  return (
    <button
      type="button"
      className={cls.join(' ')}
      onClick={isReview ? undefined : onClick}
      disabled={isReview}
      aria-label={`Slot ${idx + 1}: ${slot.target_text || 'unlabelled'}`}
    >
      <span className="rn-dd-slot-num" aria-hidden="true">{idx + 1}</span>
      {slot.target_text && (
        <span className="rn-dd-slot-label">{slot.target_text}</span>
      )}
      <span className="rn-dd-slot-drop">
        {isReview && placedToken && (
          <span className="rn-dd-slot-mark" aria-hidden="true">
            {isCorrect ? '✓' : '✕'}
          </span>
        )}
        <span className="rn-dd-slot-text">
          {placedToken ? placedToken.text : (isReview ? '(skipped)' : 'tap to place')}
        </span>
      </span>
    </button>
  );
}


interface FeedbackListProps {
  slots:   DragOrderSlot[];
  tokens:  DragOrderToken[];
  correct: DragOrderCorrect;
}
function DragOrderFeedbackList({
  slots, tokens, correct,
}: FeedbackListProps) {
  if (slots.length === 0) return null;

  const tokenById = new Map<string, DragOrderToken>();
  for (const t of tokens) tokenById.set(t.id, t);

  // Distractors — tokens that aren't the rubric answer for any slot.
  // Surfaced as a strip at the bottom of the feedback area so students
  // can name what was a "trap" option, even if they correctly left it
  // in the pool.
  const correctTokenIds = new Set(Object.values(correct.slots));
  const distractors     = tokens.filter((t) => !correctTokenIds.has(t.id));

  // Single unified feedback block. For each slot in canonical (rank) order,
  // render a green answer-key card (number + target_text + correct token)
  // with the rationale stacked beneath it. The student's own pick verdict
  // already lives in the slot rows above, so we don't repeat "you placed X"
  // here — the comparison is "slot rows (your picks) vs feedback (the correct
  // order)".
  return (
    <div className="rn-dd-feedback ordered">
      <div className="rn-dd-feedback-heading">Correct order</div>
      {slots.map((s, idx) => {
        const correctTokenId = correct.slots[s.id];
        const correctToken   = correctTokenId ? tokenById.get(correctTokenId) : undefined;
        // Feedback is a rich doc keyed by the correct TOKEN, read-coerced so
        // legacy plain feedback still renders. Slot label + token text plain.
        const fbRaw          = correctTokenId ? correct.feedback?.[correctTokenId] : undefined;
        const fbDoc          = fbRaw ? parseRichDoc(fbRaw) : null;
        const hasFb          = fbDoc !== null && !isEmptyRichDoc(fbDoc);

        return (
          <div key={s.id} className="rn-dd-feedback-row-card">
            <div className="rn-dd-feedback-row-head">
              <span className="rn-dd-feedback-row-num" aria-hidden="true">{idx + 1}</span>
              {s.target_text && (
                <span className="rn-dd-feedback-row-label">{s.target_text}</span>
              )}
              <span className="rn-dd-feedback-row-token">
                {correctToken?.text ?? correctTokenId ?? '—'}
              </span>
            </div>
            {hasFb && (
              <div className="rn-dd-feedback-row-rationale">
                <RichRender doc={fbDoc} inline />
              </div>
            )}
          </div>
        );
      })}
      <DistractorStrip distractors={distractors} feedback={correct.feedback} />
    </div>
  );
}


function DistractorStrip({
  distractors,
  feedback,
}: {
  distractors: DragOrderToken[];
  feedback?: Record<string, string>;
}) {
  if (distractors.length === 0) return null;
  return (
    <div className="rn-dd-feedback-distractors">
      <div className="rn-dd-feedback-distractors-label">
        Distractors — not part of the correct answer
      </div>
      <div className="rn-dd-feedback-distractors-tokens">
        {distractors.map((t) => {
          // Per-token rationale (rich, read-coerced). Token text stays plain.
          const fbRaw = feedback?.[t.id];
          const fbDoc = fbRaw ? parseRichDoc(fbRaw) : null;
          const hasFb = fbDoc !== null && !isEmptyRichDoc(fbDoc);
          return (
            <div key={t.id} className="rn-dd-feedback-distractor">
              <span className="rn-dd-feedback-distractor-text">{t.text}</span>
              {hasFb && (
                <div className="rn-dd-feedback-distractor-rationale">
                  <RichRender doc={fbDoc} inline />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
