// mynclex/lib/bank/runner/types/mcq.tsx
//
// MCQ runner — single-component-per-type with a `mode` prop per
// runner.html §2.2.1. The `mode` is per-item (not per-attempt) per
// §16.1.1's UL hybrid: in Untimed Learning a cell flips to "review"
// the moment its answer is submitted, while sealed cells stay
// "answering."
//
// Rendered shapes:
//
//   answering — interactive radio-style buttons; `selected` highlights
//               with the teal `.sel` class; clicking calls `onChange`.
//   review    — locked options. The correct option carries the green
//               `.right` class + a "Correct" verdict pill. The student's
//               pick (if wrong) carries `.wrong` + "Your pick" pill.
//               Per-option feedback (`.rn-opt-fb`) appears under the
//               correct option AND the student's pick (if different).
//
// The rationale block is rendered separately by the runner-question-
// area, not here — per the planning doc's component split.

'use client';

import type { McqContent, McqCorrect } from '@/lib/bank/types';
import type { McqAnswer } from '@/lib/scoring';
import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc } from '@/lib/authoring/rich-doc';
import { optionLetter } from '../option-order';

type McqRunnerProps = {
  content: McqContent;
} & (
  | {
      mode:     'answering';
      selected: McqAnswer;
      onChange: (id: McqAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: McqAnswer;
      correct:       McqCorrect;
    }
);

// Submit gate — true when the student has picked an option. MCQ /
// TF cannot be submitted with no pick (the answer key requires one).
export function isMcqComplete(answer: McqAnswer | undefined): boolean {
  return answer != null;
}

export function McqRunner(props: McqRunnerProps) {
  const { content } = props;
  const isReview    = props.mode === 'review';

  return (
    <div className="rn-options" role={isReview ? undefined : 'radiogroup'}>
      {content.options.map((opt, i) => {
        const isCorrectOpt = isReview && opt.id === props.correct.answer;
        const isStudentOpt = isReview && opt.id === props.studentAnswer;
        const isSelected   = !isReview && props.selected === opt.id;

        const cls = ['rn-opt'];
        if (isReview) {
          cls.push('locked');
          if (isCorrectOpt) cls.push('right');
          else if (isStudentOpt) cls.push('wrong');
          else cls.push('dim');
        } else if (isSelected) {
          cls.push('sel');
        }

        // Review mode shows per-option feedback for every option — the
        // role (correct / wrong pick / distractor) is conveyed by the
        // border + verdict pill, so the feedback line can be plain
        // prose under each option without a prefix.
        const feedback =
          isReview ? props.correct.feedback?.[opt.id] ?? null : null;

        return (
          <button
            key={opt.id}
            type="button"
            className={cls.join(' ')}
            disabled={isReview}
            onClick={isReview ? undefined : () => props.onChange(opt.id)}
            aria-pressed={!isReview && isSelected ? true : undefined}
          >
            <span className="rn-opt-letter" aria-hidden="true">{optionLetter(i)}</span>

            <div className="rn-opt-body">
              <div><RichRender doc={parseRichDoc(opt.text)} inline /></div>
              {feedback && (
                <div className="rn-opt-fb"><RichRender doc={parseRichDoc(feedback)} inline /></div>
              )}
            </div>

            {isReview && isCorrectOpt && (
              <span className="rn-opt-verdict">✓ Correct</span>
            )}
            {isReview && isStudentOpt && !isCorrectOpt && (
              <span className="rn-opt-verdict">✕ Your answer</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
