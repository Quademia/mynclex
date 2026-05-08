// mynclex/lib/bank/runner/types/bowtie.tsx
//
// BOWTIE runner — fixed NGN bow-tie: 2 left + 1 centre + 2 right = 5
// picks. Renders as a literal bow-tie shape: 5 empty drop slots laid
// out in a 3-column grid (left wing top + bottom on the sides, centre
// in the middle row, right wing top + bottom on the sides). A token
// pool below mirrors the three wings as separate bordered columns.
//
// Interaction — CLICK-TO-PLACE (same model as DRAG_DROP):
//   • Tap a token in the pool        → token becomes "armed" (lift +
//                                       accent border + shadow).
//   • Tap an empty slot in the
//     matching wing                  → token moves to slot, leaves
//                                       pool. Empty slots in the
//                                       matching wing pulse-glow as
//                                       "drop here" while a token of
//                                       that wing is armed.
//   • Tap a filled slot, no arm      → token returns to its pool
//                                       column.
//   • Tap a filled slot, w/ arm
//     of the same wing               → swap: old returns to pool, new
//                                       fills.
//   • A token's wing membership is fixed by which wing it belongs to
//     in content.{left|centre|right}.tokens. Tokens can only be
//     placed in slots of their own wing — clicks on other-wing slots
//     are silent no-ops while their armed-target highlight is absent.
//
// Slot-position semantics for left/right wings — the schema's
// `BowtieAnswer.left` is `string[]` (set, not ordered). UI renders
// slot[0] = answer.left[0], slot[1] = answer.left[1]. Removing slot[0]
// when slot[1] is also filled rotates the second pick up to slot[0];
// this keeps state derivation pure (no separate slot-position state)
// and the visual rotation is consistent and predictable.
//
// Submit gate — every wing filled to capacity (2 + 1 + 2). Hint when
// blocked: "X of 5 picks made — each wing needs 2 + 1 + 2".
//
// Review-mode — bow-tie keeps its shape; filled slots tint to green ✓
// (right) or red ✕ (wrong); empty slots stay amber-dashed (skipped,
// defensive). Pool columns transform into feedback columns with all
// tokens shown in SATA's 4-state palette (right / wrong / missed /
// dim) + per-token rationale below each — the curator authored
// feedback for every token, so every token displays its rationale.
// Settled in design mock (docs/scratch/bowtie-design-mock.html).

'use client';

import { useMemo, useState } from 'react';
import type {
  BowtieContent,
  BowtieCorrect,
  BowtieToken,
} from '@/lib/bank/types';
import type { BowtieAnswer } from '@/lib/scoring';

type WingKey = 'left' | 'centre' | 'right';

type BowtieRunnerProps = {
  content: BowtieContent;
} & (
  | {
      mode:     'answering';
      selected: BowtieAnswer;
      onChange: (next: BowtieAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: BowtieAnswer;
      correct:       BowtieCorrect;
    }
);

export function isBowtieComplete(answer: BowtieAnswer | undefined): boolean {
  if (!answer) return false;
  return (
    answer.left.length === 2 &&
    answer.centre !== null &&
    answer.right.length === 2
  );
}


export function BowtieRunner(props: BowtieRunnerProps) {
  const { content } = props;
  const isReview    = props.mode === 'review';

  const currentAnswer: BowtieAnswer = isReview
    ? props.studentAnswer
    : props.selected;
  const correctAnswer: BowtieCorrect | null = isReview ? props.correct : null;

  const [armedTokenId, setArmedTokenId] = useState<string | null>(null);

  // Wing membership lookup — each token belongs to exactly one wing.
  const tokenWing = useMemo(() => {
    const m = new Map<string, WingKey>();
    content.left.tokens.forEach((t)   => m.set(t.id, 'left'));
    content.centre.tokens.forEach((t) => m.set(t.id, 'centre'));
    content.right.tokens.forEach((t)  => m.set(t.id, 'right'));
    return m;
  }, [content]);

  const armedWing: WingKey | null = armedTokenId
    ? tokenWing.get(armedTokenId) ?? null
    : null;

  // Tokens currently placed in any slot — they're not in the pool.
  const placedTokens = useMemo(() => {
    const set = new Set<string>();
    currentAnswer.left.forEach((t)  => set.add(t));
    if (currentAnswer.centre) set.add(currentAnswer.centre);
    currentAnswer.right.forEach((t) => set.add(t));
    return set;
  }, [currentAnswer]);

  // Per-wing correct-token sets, used for verdict styling in review.
  const correctSets = useMemo(() => {
    if (!correctAnswer) return null;
    return {
      left:   new Set(correctAnswer.left),
      centre: correctAnswer.centre,
      right:  new Set(correctAnswer.right),
    };
  }, [correctAnswer]);

  function handleTokenClick(tokenId: string) {
    if (isReview) return;
    setArmedTokenId((prev) => (prev === tokenId ? null : tokenId));
  }

  function handleCentreSlotClick() {
    if (isReview) return;
    if (armedTokenId && armedWing === 'centre') {
      props.onChange({ ...currentAnswer, centre: armedTokenId });
      setArmedTokenId(null);
    } else if (currentAnswer.centre && !armedTokenId) {
      props.onChange({ ...currentAnswer, centre: null });
    }
    // else no-op (empty + nothing armed, OR armed token from wrong wing)
  }

  function handleSideSlotClick(wing: 'left' | 'right', slotIdx: 0 | 1) {
    if (isReview) return;
    const sideArr = currentAnswer[wing];
    const occupant = sideArr[slotIdx];

    if (armedTokenId && armedWing === wing) {
      // Place or swap.
      let newArr: string[];
      if (occupant !== undefined) {
        // Swap at this index.
        newArr = [...sideArr];
        newArr[slotIdx] = armedTokenId;
      } else {
        // Append (slot is past current array length — first empty slot).
        newArr = [...sideArr, armedTokenId];
      }
      props.onChange({ ...currentAnswer, [wing]: newArr });
      setArmedTokenId(null);
    } else if (occupant !== undefined && !armedTokenId) {
      // Tap filled slot, nothing armed → unplace.
      const newArr = sideArr.filter((_, i) => i !== slotIdx);
      props.onChange({ ...currentAnswer, [wing]: newArr });
    }
    // else no-op
  }

  // Progressive hint above the bow-tie.
  const totalPicked =
    currentAnswer.left.length +
    (currentAnswer.centre ? 1 : 0) +
    currentAnswer.right.length;
  let hintText: string;
  if (armedTokenId) {
    const wingLabel =
      armedWing === 'left'   ? content.left.label   :
      armedWing === 'centre' ? content.centre.label :
      armedWing === 'right'  ? content.right.label  : '';
    hintText = `Token armed · tap a ${wingLabel} slot to place it.`;
  } else if (totalPicked === 0) {
    hintText = `Pick 2 in ${content.left.label}, 1 in ${content.centre.label}, 2 in ${content.right.label}.`;
  } else if (totalPicked === 5) {
    hintText = 'All wings filled · ready to submit.';
  } else {
    hintText = `${totalPicked} of 5 picks made · finish each wing to submit.`;
  }

  // Resolve the token text for a slot occupant.
  function tokenText(tokenId: string | null | undefined): string | null {
    if (!tokenId) return null;
    const t =
      content.left.tokens.find((x)   => x.id === tokenId) ||
      content.centre.tokens.find((x) => x.id === tokenId) ||
      content.right.tokens.find((x)  => x.id === tokenId);
    return t?.text ?? tokenId;
  }

  return (
    <>
      {!isReview && <div className="rn-bt-hint">{hintText}</div>}

      <div className="rn-bt-shape">
        <div className="rn-bt-shape-label left">{content.left.label}</div>
        <div className="rn-bt-shape-label centre">{content.centre.label}</div>
        <div className="rn-bt-shape-label right">{content.right.label}</div>

        <Slot
          position="left-top"
          tokenId={currentAnswer.left[0] ?? null}
          tokenText={tokenText(currentAnswer.left[0])}
          isReview={isReview}
          isCorrect={isCorrectAt('left', currentAnswer.left[0], correctSets)}
          isArmedTarget={!isReview && armedWing === 'left' && currentAnswer.left[0] === undefined}
          onClick={() => handleSideSlotClick('left', 0)}
        />
        <Slot
          position="centre"
          tokenId={currentAnswer.centre}
          tokenText={tokenText(currentAnswer.centre)}
          isReview={isReview}
          isCorrect={isCorrectAt('centre', currentAnswer.centre, correctSets)}
          isArmedTarget={!isReview && armedWing === 'centre' && !currentAnswer.centre}
          onClick={handleCentreSlotClick}
        />
        <Slot
          position="right-top"
          tokenId={currentAnswer.right[0] ?? null}
          tokenText={tokenText(currentAnswer.right[0])}
          isReview={isReview}
          isCorrect={isCorrectAt('right', currentAnswer.right[0], correctSets)}
          isArmedTarget={!isReview && armedWing === 'right' && currentAnswer.right[0] === undefined}
          onClick={() => handleSideSlotClick('right', 0)}
        />

        <Slot
          position="left-bot"
          tokenId={currentAnswer.left[1] ?? null}
          tokenText={tokenText(currentAnswer.left[1])}
          isReview={isReview}
          isCorrect={isCorrectAt('left', currentAnswer.left[1], correctSets)}
          isArmedTarget={!isReview && armedWing === 'left' && currentAnswer.left[1] === undefined}
          onClick={() => handleSideSlotClick('left', 1)}
        />
        <Slot
          position="right-bot"
          tokenId={currentAnswer.right[1] ?? null}
          tokenText={tokenText(currentAnswer.right[1])}
          isReview={isReview}
          isCorrect={isCorrectAt('right', currentAnswer.right[1], correctSets)}
          isArmedTarget={!isReview && armedWing === 'right' && currentAnswer.right[1] === undefined}
          onClick={() => handleSideSlotClick('right', 1)}
        />
      </div>

      <div className="rn-bt-pool">
        <PoolOrFeedbackColumn
          wing={content.left}
          wingKey="left"
          capN={2}
          pickedCount={currentAnswer.left.length}
          placedTokens={placedTokens}
          armedTokenId={armedTokenId}
          isReview={isReview}
          studentPickedSet={isReview ? new Set(currentAnswer.left) : null}
          correctSet={correctSets?.left ?? null}
          feedback={correctAnswer?.feedback}
          onTokenClick={handleTokenClick}
        />
        <PoolOrFeedbackColumn
          wing={content.centre}
          wingKey="centre"
          capN={1}
          pickedCount={currentAnswer.centre ? 1 : 0}
          placedTokens={placedTokens}
          armedTokenId={armedTokenId}
          isReview={isReview}
          studentPickedSet={
            isReview && currentAnswer.centre
              ? new Set([currentAnswer.centre])
              : (isReview ? new Set() : null)
          }
          correctSet={
            correctSets ? new Set([correctSets.centre]) : null
          }
          feedback={correctAnswer?.feedback}
          onTokenClick={handleTokenClick}
          isCentreColumn
        />
        <PoolOrFeedbackColumn
          wing={content.right}
          wingKey="right"
          capN={2}
          pickedCount={currentAnswer.right.length}
          placedTokens={placedTokens}
          armedTokenId={armedTokenId}
          isReview={isReview}
          studentPickedSet={isReview ? new Set(currentAnswer.right) : null}
          correctSet={correctSets?.right ?? null}
          feedback={correctAnswer?.feedback}
          onTokenClick={handleTokenClick}
        />
      </div>
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isCorrectAt(
  wing:        WingKey,
  tokenId:     string | null | undefined,
  correctSets: { left: Set<string>; centre: string; right: Set<string> } | null,
): boolean {
  if (!correctSets || !tokenId) return false;
  if (wing === 'left')   return correctSets.left.has(tokenId);
  if (wing === 'right')  return correctSets.right.has(tokenId);
  if (wing === 'centre') return tokenId === correctSets.centre;
  return false;
}


// ─────────────────────────────────────────────────────────────
// Bow-tie slot — one of the 5 drop targets in the bow-tie shape.
// ─────────────────────────────────────────────────────────────

interface SlotProps {
  position:      'left-top' | 'left-bot' | 'centre' | 'right-top' | 'right-bot';
  tokenId:       string | null;
  tokenText:     string | null;
  isReview:      boolean;
  isCorrect:     boolean;
  isArmedTarget: boolean;
  onClick:       () => void;
}

function Slot({
  position, tokenId, tokenText, isReview, isCorrect, isArmedTarget, onClick,
}: SlotProps) {
  const cls = ['rn-bt-slot', position];
  if (tokenId)         cls.push('filled');
  if (!isReview && isArmedTarget) cls.push('armed-target');
  if (isReview) {
    cls.push('locked');
    if      (!tokenId)            cls.push('skipped');
    else if (isCorrect)            cls.push('right');
    else                           cls.push('wrong');
  }

  return (
    <button
      type="button"
      className={cls.join(' ')}
      onClick={isReview ? undefined : onClick}
      disabled={isReview}
    >
      {isReview && tokenId && (
        <span className="rn-bt-slot-mark" aria-hidden="true">
          {isCorrect ? '✓' : '✕'}
        </span>
      )}
      <span className="rn-bt-slot-text">
        {tokenText ?? (isReview ? '(skipped)' : 'tap')}
      </span>
    </button>
  );
}


// ─────────────────────────────────────────────────────────────
// Pool / feedback column — answering: shows available tokens with
// arm state. Review: shows ALL tokens with 4-state palette + per-
// token rationale below.
// ─────────────────────────────────────────────────────────────

interface PoolOrFeedbackColumnProps {
  wing:             { label: string; tokens: BowtieToken[] };
  wingKey:          WingKey;
  capN:             number;
  pickedCount:      number;
  placedTokens:     Set<string>;
  armedTokenId:     string | null;
  isReview:         boolean;
  studentPickedSet: Set<string> | null;
  correctSet:       Set<string> | null;
  feedback:         Record<string, string> | undefined;
  onTokenClick:     (tokenId: string) => void;
  isCentreColumn?:  boolean;
}

function PoolOrFeedbackColumn(props: PoolOrFeedbackColumnProps) {
  const {
    wing, capN, pickedCount, placedTokens, armedTokenId, isReview,
    studentPickedSet, correctSet, feedback, onTokenClick, isCentreColumn,
  } = props;

  // Header copy differs answering vs review.
  let headerSummary: string;
  if (isReview) {
    const right = wing.tokens.filter((t) =>
      studentPickedSet?.has(t.id) && correctSet?.has(t.id)
    ).length;
    const wrong = wing.tokens.filter((t) =>
      studentPickedSet?.has(t.id) && !correctSet?.has(t.id)
    ).length;
    if (wrong === 0) headerSummary = `${right} right`;
    else             headerSummary = `${right} right · ${wrong} wrong`;
  } else if (pickedCount === 0) {
    headerSummary = `Pick ${capN}`;
  } else if (pickedCount === capN) {
    headerSummary = `${pickedCount} of ${capN} chosen ✓`;
  } else {
    headerSummary = `${pickedCount} of ${capN} chosen`;
  }

  return (
    <div className={`rn-bt-pool-col${isCentreColumn ? ' centre' : ''}`}>
      <div className="rn-bt-pool-header">
        <span className="rn-bt-pool-label">{wing.label}</span>
        <span className={`rn-bt-pool-count${pickedCount === capN && !isReview ? ' full' : ''}`}>
          {headerSummary}
        </span>
      </div>
      <ul className="rn-bt-pool-tokens">
        {wing.tokens.map((t) => {
          if (isReview) {
            return (
              <FeedbackTokenItem
                key={t.id}
                token={t}
                isPicked={studentPickedSet?.has(t.id) ?? false}
                isCorrect={correctSet?.has(t.id) ?? false}
                feedback={feedback?.[t.id]}
              />
            );
          }
          // Answering — only show tokens that aren't already in a slot.
          if (placedTokens.has(t.id)) return null;
          const isArmed = armedTokenId === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`rn-bt-pool-token${isArmed ? ' armed' : ''}`}
                onClick={() => onTokenClick(t.id)}
                aria-pressed={isArmed}
              >
                {t.text}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


interface FeedbackTokenItemProps {
  token:     BowtieToken;
  isPicked:  boolean;
  isCorrect: boolean;
  feedback:  string | undefined;
}

function FeedbackTokenItem({
  token, isPicked, isCorrect, feedback,
}: FeedbackTokenItemProps) {
  let stateCls: string;
  let verdict: string | null;
  if      (isPicked && isCorrect)   { stateCls = 'right';  verdict = '✓ Correct'; }
  else if (isPicked && !isCorrect)  { stateCls = 'wrong';  verdict = '✕ Wrong pick'; }
  else if (!isPicked && isCorrect)  { stateCls = 'missed'; verdict = '⚠ Missed'; }
  else                              { stateCls = 'dim';    verdict = null; }

  return (
    <li className="rn-bt-fb-item">
      <div className={`rn-bt-fb-pill ${stateCls}`}>
        <span className="rn-bt-fb-text">{token.text}</span>
        {verdict && <span className="rn-bt-fb-verdict">{verdict}</span>}
      </div>
      {feedback && <div className="rn-bt-fb-rationale">{feedback}</div>}
    </li>
  );
}
