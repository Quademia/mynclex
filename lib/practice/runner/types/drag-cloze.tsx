// mynclex/lib/practice/runner/types/drag-cloze.tsx
//
// DRAG_CLOZE runner — sentence-mode drag-and-drop cloze.
//
// The stem carries `[N]` markers (single brackets, distinct from CLOZE's
// `{N}`) which become inline drop boxes flowing inside the prose. Token pool
// sits below the stem. The i-th `[N]` ↔ content.slots[i] positionally; if a
// snapshot desyncs we fall back to a synthetic slot — same defensive pattern
// as HIGHLIGHT / CLOZE.
//
// Interaction model — CLICK-TO-PLACE, not real HTML5 drag-and-drop.
// The audience is phone-first and HTML5 DnD's touch story is bad. The
// type is named DRAG_CLOZE for product reasons but the implementation is
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
// submit". Same logic as CLOZE: a half-placed answer isn't an opinion,
// it's incomplete.
//
// Review-mode prose mirrors CLOZE: per-slot verdict header
// (`<num> CORRECT / WRONG / SKIPPED`) coloured by state, then the
// rationale prose. Feedback is keyed by TOKEN (not slot), so a slot's
// rationale is the rationale on its CORRECT token, and every distractor
// carries its own rationale (shown in the distractor strip). For
// wrong/skipped slots we still prepend "Correct answer: <token text>."
// so the answer key reaches the student even with no authored rationale.

'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type {
  DragClozeContent,
  DragClozeCorrect,
  DragClozeSlot,
  DragClozeToken,
} from '@/lib/bank/types';
import type { DragClozeAnswer } from '@/lib/scoring';
import { parseRichDoc, isEmptyRichDoc } from '@/lib/authoring/rich-doc';
import { RichRender, RichRenderWithSlots } from '@/lib/authoring/rich-render';

type DragClozeRunnerProps = {
  stem:    string;
  content: DragClozeContent;
} & (
  | {
      mode:     'answering';
      selected: DragClozeAnswer;
      onChange: (next: DragClozeAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: DragClozeAnswer;
      correct:       DragClozeCorrect;
    }
);

export function isDragClozeComplete(
  answer:  DragClozeAnswer | undefined,
  content: DragClozeContent,
): boolean {
  if (!answer) return false;
  for (const s of content.slots) {
    if (!answer[s.id]) return false;
  }
  return true;
}


export function DragClozeRunner(props: DragClozeRunnerProps) {
  const { stem, content } = props;
  const isReview          = props.mode === 'review';
  const [armedTokenId, setArmedTokenId] = useState<string | null>(null);

  // Convenience handles to the right answer / rubric for the active mode.
  const currentAnswer: DragClozeAnswer        = isReview ? props.studentAnswer : props.selected;
  const correctAnswer: DragClozeCorrect | null = isReview ? props.correct : null;

  // Lookup maps (stable identities for cheap renders).
  const tokenById = useMemo(() => {
    const m = new Map<string, DragClozeToken>();
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

  // The stem is a rich doc with [N] markers as plain text inside it;
  // read-coerced so legacy plain stems still render. The i-th [N] maps
  // positionally to content.slots[i].
  const stemDoc = useMemo(() => parseRichDoc(stem), [stem]);

  return (
    <>
      {!isReview && <div className="rn-dd-hint">{hintText}</div>}

      <RichRenderWithSlots
        className="rn-dd-stem"
        doc={stemDoc}
        pattern={/\[(\d+)\]/}
        renderSlot={(_key: string, index: number): ReactNode => {
          const slot =
            content.slots[index] ?? { id: `_s${index + 1}`, target_text: '' };
          const placedTokenId = currentAnswer[slot.id];
          const placedToken   = placedTokenId ? tokenById.get(placedTokenId) : undefined;
          const isCorrect     = isReview && correctAnswer
            ? placedTokenId === correctAnswer.slots[slot.id]
            : false;
          const isArmedTarget =
            !isReview && armedTokenId !== null && !placedTokenId;

          return (
            <SlotInline
              slotIdx={index}
              placedToken={placedToken}
              isReview={isReview}
              isCorrect={isCorrect}
              isArmedTarget={isArmedTarget}
              onClick={() => handleSlotClick(slot.id)}
            />
          );
        }}
      />

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
        <DragClozeFeedbackList
          slots={content.slots}
          tokens={content.tokens}
          studentAnswer={props.studentAnswer}
          correct={correctAnswer}
        />
      )}
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface SlotInlineProps {
  slotIdx:       number;
  placedToken:   DragClozeToken | undefined;
  isReview:      boolean;
  isCorrect:     boolean;
  isArmedTarget: boolean;
  onClick:       () => void;
}
function SlotInline({
  slotIdx, placedToken, isReview, isCorrect, isArmedTarget, onClick,
}: SlotInlineProps) {
  const cls = ['rn-dd-inline-box'];
  if (placedToken) cls.push('filled');
  if (!isReview && isArmedTarget) cls.push('armed-target');
  if (isReview) {
    cls.push('locked');
    if      (!placedToken)         cls.push('skipped');
    else if (isCorrect)            cls.push('right');
    else                           cls.push('wrong');
  }

  return (
    <button
      type="button"
      className={cls.join(' ')}
      onClick={isReview ? undefined : onClick}
      disabled={isReview}
      aria-label={`Slot ${slotIdx + 1}`}
    >
      <span className="rn-dd-inline-num" aria-hidden="true">{slotIdx + 1}</span>
      {isReview && placedToken && (
        <span className="rn-dd-inline-mark" aria-hidden="true">
          {isCorrect ? '✓' : '✕'}
        </span>
      )}
      <span className="rn-dd-inline-text">
        {placedToken ? placedToken.text : (isReview ? '(skipped)' : 'tap')}
      </span>
    </button>
  );
}


interface FeedbackListProps {
  slots:         DragClozeSlot[];
  tokens:        DragClozeToken[];
  studentAnswer: DragClozeAnswer;
  correct:       DragClozeCorrect;
}
function DragClozeFeedbackList({
  slots, tokens, studentAnswer, correct,
}: FeedbackListProps) {
  if (slots.length === 0) return null;

  const tokenById = new Map<string, DragClozeToken>();
  for (const t of tokens) tokenById.set(t.id, t);

  // Distractors — tokens that aren't the rubric answer for any slot.
  // Surfaced as a strip at the bottom of the feedback area so students
  // can name what was a "trap" option, even if they correctly left it
  // in the pool.
  const correctTokenIds = new Set(Object.values(correct.slots));
  const distractors     = tokens.filter((t) => !correctTokenIds.has(t.id));

  // Per-slot verdict prose (1 CORRECT / 2 WRONG / 3 SKIPPED). Slot order is
  // sentence position. The student's pick stays in the stem inline-pill, and
  // the feedback strip names each slot's verdict + rationale.
  return (
    <div className="rn-dd-feedback">
      {slots.map((s, idx) => {
        const pickedId   = studentAnswer[s.id];
        const correctId  = correct.slots[s.id];
        const correctTok = correctId ? tokenById.get(correctId) : undefined;
        // Feedback is a rich doc keyed by the correct TOKEN, read-coerced.
        const fbRaw      = correctId ? correct.feedback?.[correctId] : undefined;
        const fbDoc      = fbRaw ? parseRichDoc(fbRaw) : null;
        const hasFb      = fbDoc !== null && !isEmptyRichDoc(fbDoc);

        let verdict:    'right' | 'wrong' | 'skipped';
        let verdictTxt: string;
        if      (!pickedId)             { verdict = 'skipped'; verdictTxt = 'SKIPPED'; }
        else if (pickedId === correctId) { verdict = 'right';   verdictTxt = 'CORRECT'; }
        else                             { verdict = 'wrong';   verdictTxt = 'WRONG'; }

        return (
          <div key={s.id} className="rn-dd-feedback-blank">
            <div className={`rn-dd-feedback-blank-label ${verdict}`}>
              <span className="num">{idx + 1}</span>
              <span className="verdict">{verdictTxt}</span>
            </div>
            <p className="rn-dd-feedback-body">
              {(verdict === 'wrong' || verdict === 'skipped') && (
                <>
                  Correct answer:{' '}
                  <span className="rn-dd-feedback-correct-label">
                    {correctTok?.text ?? correctId ?? '—'}
                  </span>
                  .{hasFb ? ' ' : ''}
                </>
              )}
              {hasFb && <RichRender doc={fbDoc} inline />}
            </p>
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
  distractors: DragClozeToken[];
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
