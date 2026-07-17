// mynclex/lib/bank/runner/types/select-n.tsx
//
// SELECT_N runner — multi-select with a fixed cap. The curator sets
// `select_count` (how many to pick); the student must select exactly
// that many to give a complete answer.
//
// Shape difference from SATA:
//   • content carries `select_count` (a number)
//   • toggle behaviour caps additions at N (deselect is always allowed)
//   • a small header above the options shows "Select N · X of N chosen"
//     in answering mode, so the student always knows the cap and their
//     progress against it
//   • when the cap is reached, unpicked options dim and become
//     non-interactive (reuses .rn-opt.dim — the user encounters this
//     only in answering mode, never alongside review-mode dimming)
//
// Review mode mirrors SATA exactly (4 states: right / wrong / missed /
// dim). The cap header is hidden in review since the visual states
// already tell the story.

'use client';

import type { SelectNContent, SelectNCorrect } from '@/lib/bank/types';
import type { SelectNAnswer } from '@/lib/scoring';
import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc } from '@/lib/authoring/rich-doc';
import { optionLetter } from '../option-order';

type SelectNRunnerProps = {
  content: SelectNContent;
} & (
  | {
      mode:     'answering';
      selected: SelectNAnswer;
      onChange: (next: SelectNAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: SelectNAnswer;
      correct:       SelectNCorrect;
    }
);

// Submit gate — SELECT_N requires EXACTLY `select_count` picks. Any
// fewer (or more — though the toggle handler caps additions) keeps
// the Submit button disabled with a count-aware hint.
export function isSelectNComplete(
  answer: SelectNAnswer | undefined,
  selectCount: number,
): boolean {
  return (answer?.length ?? 0) === selectCount;
}

export function SelectNRunner(props: SelectNRunnerProps) {
  const { content } = props;
  const isReview = props.mode === 'review';
  const N = content.select_count;

  const correctSet =
    isReview ? new Set(props.correct.answers) : null;
  const studentSet =
    isReview ? new Set(props.studentAnswer)    : new Set(props.selected);

  const atCap = !isReview && studentSet.size >= N;

  function toggle(id: string) {
    if (isReview) return;
    const selected = props.selected;
    const isPicked = selected.includes(id);
    if (isPicked) {
      // Deselect always allowed.
      props.onChange(selected.filter((x) => x !== id));
      return;
    }
    if (selected.length < N) {
      props.onChange([...selected, id]);
    }
    // At cap and not already picked → no-op. The caller dims the
    // option visually so the student understands.
  }

  return (
    <>
      {!isReview && (
        studentSet.size === 0 ? (
          <div className="rn-opt-count">
            Select <strong>{N}</strong>.
          </div>
        ) : (
          <div className="rn-opt-count">
            <strong>{studentSet.size}</strong> of <strong>{N}</strong> chosen
            <span className="sep">·</span>
            <span className={atCap ? 'hint met' : 'hint'}>
              {atCap ? 'tap a selected option to swap' : 'tap to deselect'}
            </span>
          </div>
        )
      )}

      <div className="rn-options" role={isReview ? undefined : 'group'}>
        {content.options.map((opt, i) => {
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
          } else if (atCap) {
            cls.push('dim');
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
              title={
                !isReview && !isPicked && atCap
                  ? `Selection limit reached — deselect one to add another`
                  : undefined
              }
            >
              <span className="rn-opt-letter" aria-hidden="true">{optionLetter(i)}</span>

              <div className="rn-opt-body">
                <div><RichRender doc={parseRichDoc(opt.text)} inline /></div>
                {feedback && (
                  <div className="rn-opt-fb"><RichRender doc={parseRichDoc(feedback)} inline /></div>
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
    </>
  );
}
