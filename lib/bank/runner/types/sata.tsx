// mynclex/lib/bank/runner/types/sata.tsx
//
// SATA (Select All That Apply) runner — multi-select option list.
//
// Differences from MCQ:
//   • Answer is `string[]` (zero-or-more option IDs picked).
//   • A click TOGGLES membership rather than replacing the pick.
//   • Review mode has 4 states per option (vs MCQ's 3):
//       right   = correct  AND picked
//       wrong   = NOT correct AND picked
//       missed  = correct  AND NOT picked   ← new
//       (dim)   = NOT correct AND NOT picked
//   • aria pattern is a group of toggle buttons (aria-pressed), not a
//     radiogroup.
//
// Per-option feedback in review mode renders under each option,
// regardless of state — the `correct.feedback` map is keyed by option
// ID, same shape as MCQ.

'use client';

import type { SataContent, SataCorrect } from '@/lib/bank/types';
import type { SataAnswer } from '@/lib/scoring';

type SataRunnerProps = {
  content: SataContent;
} & (
  | {
      mode:     'answering';
      selected: SataAnswer;
      onChange: (next: SataAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: SataAnswer;
      correct:       SataCorrect;
    }
);

// Submit gate — SATA always allows submit (per Sam, 2026-05-07).
// Zero selections is a deliberate "none of these apply" answer, scored
// the same way any other answer is scored. Untouched answers (Map has
// no entry → undefined) are coerced to [] at the call site.
export function isSataComplete(_answer: SataAnswer | undefined): boolean {
  return true;
}

export function SataRunner(props: SataRunnerProps) {
  const { content } = props;
  const isReview    = props.mode === 'review';

  const correctSet =
    isReview ? new Set(props.correct.answers) : null;
  const studentSet =
    isReview ? new Set(props.studentAnswer)    : new Set(props.selected);

  function toggle(id: string) {
    if (isReview) return;
    const next = new Set(props.selected);
    if (next.has(id)) next.delete(id);
    else              next.add(id);
    props.onChange(Array.from(next));
  }

  return (
    <div className="rn-options" role={isReview ? undefined : 'group'}>
      {content.options.map((opt) => {
        const isPicked  = studentSet.has(opt.id);
        const isCorrect = correctSet?.has(opt.id) ?? false;

        const cls = ['rn-opt'];
        if (isReview) {
          cls.push('locked');
          if (isCorrect && isPicked)        cls.push('right');
          else if (!isCorrect && isPicked)  cls.push('wrong');
          else if (isCorrect && !isPicked)  cls.push('missed');
          else                              cls.push('dim');
        } else if (isPicked) {
          cls.push('sel');
        }

        const feedback =
          isReview ? props.correct.feedback?.[opt.id] ?? null : null;

        return (
          <button
            key={opt.id}
            type="button"
            className={cls.join(' ')}
            disabled={isReview}
            onClick={isReview ? undefined : () => toggle(opt.id)}
            aria-pressed={!isReview ? isPicked : undefined}
          >
            <span className="rn-opt-letter" aria-hidden="true">{opt.id}</span>

            <div className="rn-opt-body">
              <div>{opt.text}</div>
              {feedback && (
                <div className="rn-opt-fb">{feedback}</div>
              )}
            </div>

            {isReview && isCorrect && isPicked && (
              <span className="rn-opt-verdict">✓ Correct</span>
            )}
            {isReview && !isCorrect && isPicked && (
              <span className="rn-opt-verdict">✕ Wrong pick</span>
            )}
            {isReview && isCorrect && !isPicked && (
              <span className="rn-opt-verdict">⚠ Missed</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
