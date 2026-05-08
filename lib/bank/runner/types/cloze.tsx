// mynclex/lib/bank/runner/types/cloze.tsx
//
// CLOZE runner — sentence with inline {N} markers, one dropdown per blank.
//
// The stem field carries the sentence WITH numeric-bracket markers around
// the slots that become dropdowns. Curator-side parser auto-renumbers
// gaps on save (`{1} {3}` → `{1} {2}`) and remaps blank IDs to match,
// so by the time we see a snapshot the i-th `{N}` always maps to
// `content.blanks[i]`.
//
// Architectural note (mirrors HIGHLIGHT, runner.html §5.3): CLOZE is
// the second type where the per-type runner takes over stem rendering.
// `RunnerQuestionArea` skips its `.rn-stem` render for CLOZE and the
// instruction line moves to ABOVE the stem — students need to know
// they're filling blanks before they read.
//
// Visual states for blanks:
//   default  — native <select> with "— choose —" placeholder (answering)
//   sel      — native <select> showing the picked choice (answering)
//   right    — green pill with ✓ + picked text (review, picked & correct)
//   wrong    — red pill with ✕ + picked text (review, picked & wrong)
//   skipped  — dashed amber pill with "(skipped)" (review, no pick)
//
// Per-blank feedback below the stem renders as flowing prose: per
// blank, a left-accented "Blank N" header followed by a paragraph
// where every option label flows inline with its per-choice rationale.
// The correct option's label is green, wrong options' labels are a
// softened red (#9b2c2c — clearly red, less alarmist than the stem
// pill so multiple wrong labels don't shout). The student's actual
// pick is NOT marked in the feedback prose — the stem pill already
// shows it (Sam, 2026-05-08, design mock B′).
//
// Submit gate — CLOZE requires every blank filled. Unlike SATA /
// HIGHLIGHT (where "zero" is a deliberate "nothing applies" answer), an
// empty blank in a sentence-completion isn't an opinion — it's an
// unanswered question.

'use client';

import { useMemo } from 'react';
import type {
  ClozeContent,
  ClozeCorrect,
  ClozeBlank,
} from '@/lib/bank/types';
import type { ClozeAnswer } from '@/lib/scoring';

type ClozeRunnerProps = {
  stem:    string;
  content: ClozeContent;
} & (
  | {
      mode:     'answering';
      selected: ClozeAnswer;
      onChange: (next: ClozeAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: ClozeAnswer;
      correct:       ClozeCorrect;
    }
);

// Submit gate — every blank declared in content must have an entry in
// the answer map. Empty string is treated as not-picked (placeholder
// option value).
export function isClozeComplete(
  answer:  ClozeAnswer | undefined,
  content: ClozeContent,
): boolean {
  if (!answer) return false;
  for (const b of content.blanks) {
    const v = answer[b.id];
    if (!v) return false;
  }
  return true;
}

type Segment =
  | { kind: 'plain'; text: string }
  | { kind: 'blank'; idx: number; blank: ClozeBlank };

// Splits the stem into a sequence of plain-text and blank-slot segments.
// The i-th `{N}` marker maps to content.blanks[i]. Curator-side parser
// renumbers gaps on save, so by the time we render a snapshot this
// positional mapping holds. If counts desync (corrupt snapshot), we
// fall back to a synthetic blank with an empty choice list — same
// defensive pattern as HIGHLIGHT.
function parseStem(stem: string, blanks: ClozeBlank[]): Segment[] {
  const out:    Segment[] = [];
  const regex = /\{(\d+)\}/g;

  let lastIdx = 0;
  let blankIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(stem)) !== null) {
    if (match.index > lastIdx) {
      out.push({ kind: 'plain', text: stem.slice(lastIdx, match.index) });
    }
    const b = blanks[blankIdx] ?? {
      id: `_b${blankIdx + 1}`,
      choices: [],
    };
    out.push({ kind: 'blank', idx: blankIdx, blank: b });
    lastIdx   = match.index + match[0].length;
    blankIdx += 1;
  }

  if (lastIdx < stem.length) {
    out.push({ kind: 'plain', text: stem.slice(lastIdx) });
  }
  return out;
}

export function ClozeRunner(props: ClozeRunnerProps) {
  const { stem, content } = props;
  const isReview = props.mode === 'review';

  const segments = useMemo(
    () => parseStem(stem, content.blanks),
    [stem, content.blanks],
  );

  const filledCount = isReview
    ? Object.values(props.studentAnswer).filter(Boolean).length
    : Object.values(props.selected).filter(Boolean).length;
  const totalCount = content.blanks.length;

  function setBlank(blankId: string, choiceId: string) {
    if (isReview) return;
    const next = { ...props.selected };
    if (choiceId === '') delete next[blankId];
    else                 next[blankId] = choiceId;
    props.onChange(next);
  }

  return (
    <>
      {/* Orientation hint — persistent above the stem, mirrors HIGHLIGHT
       * pattern. Empty state names the task; once any blank is filled
       * it becomes a state readout (X of N filled). */}
      {!isReview && (
        <div className="rn-cloze-hint">
          {filledCount === 0 ? (
            <>Choose one option for each blank.</>
          ) : (
            <>
              <strong>{filledCount}</strong> of <strong>{totalCount}</strong> blanks filled
              <span className="sep">·</span>
              <span className="hint">tap a dropdown to change</span>
            </>
          )}
        </div>
      )}

      <div className="rn-cloze-stem">
        {segments.map((seg, i) => {
          if (seg.kind === 'plain') {
            return <span key={i}>{seg.text}</span>;
          }

          // Persistent superscript number before every blank (both modes).
          // Matches the "Blank N" headers in the post-answer feedback prose
          // so students can map a dropdown / pill back to its rationale
          // entry without counting positions.
          const num = (
            <span className="rn-cloze-blank-num" aria-hidden="true">
              {seg.idx + 1}
            </span>
          );

          if (!isReview) {
            const value = props.selected[seg.blank.id] ?? '';
            return (
              <span key={i} className="rn-cloze-blank-wrap">
                {num}
                <select
                  className={`rn-cloze-select${value ? ' sel' : ''}`}
                  value={value}
                  onChange={(e) => setBlank(seg.blank.id, e.target.value)}
                  aria-label={`Blank ${seg.idx + 1}`}
                >
                  <option value="">— choose —</option>
                  {seg.blank.choices.map((c) => (
                    <option key={c.id} value={c.id}>{c.text}</option>
                  ))}
                </select>
              </span>
            );
          }

          // Review mode — render an inline pill instead of a <select>.
          const pickedId = props.studentAnswer[seg.blank.id];
          const correctId = props.correct.answers[seg.blank.id];
          const pickedChoice = seg.blank.choices.find((c) => c.id === pickedId);
          const isCorrect    = !!pickedId && pickedId === correctId;

          if (!pickedId) {
            return (
              <span key={i} className="rn-cloze-blank-wrap">
                {num}
                <span className="rn-cloze-pill skipped" aria-label={`Blank ${seg.idx + 1} skipped`}>
                  (skipped)
                </span>
              </span>
            );
          }
          return (
            <span key={i} className="rn-cloze-blank-wrap">
              {num}
              <span
                className={`rn-cloze-pill ${isCorrect ? 'right' : 'wrong'}`}
                aria-label={`Blank ${seg.idx + 1} ${isCorrect ? 'correct' : 'wrong'}`}
              >
                <span className="rn-cloze-pill-mark" aria-hidden="true">
                  {isCorrect ? '✓' : '✕'}
                </span>
                {pickedChoice?.text ?? pickedId}
              </span>
            </span>
          );
        })}
      </div>

      {isReview && (
        <ClozeFeedbackList
          blanks={content.blanks}
          studentAnswer={props.studentAnswer}
          correct={props.correct}
        />
      )}
    </>
  );
}


interface FeedbackListProps {
  blanks:        ClozeBlank[];
  studentAnswer: ClozeAnswer;
  correct:       ClozeCorrect;
}

function ClozeFeedbackList({ blanks, studentAnswer, correct }: FeedbackListProps) {
  if (blanks.length === 0) return null;

  return (
    <div className="rn-cloze-feedback">
      {blanks.map((b, idx) => {
        const correctId     = correct.answers[b.id];
        const blankFeedback = correct.feedback?.[b.id];
        const pickedId      = studentAnswer[b.id];

        // Per-blank verdict drives the header colour. Skipped is
        // defensive only — the submit gate forces every blank filled,
        // but if a snapshot reaches review-mode without a pick we
        // still render something coherent.
        let verdict:    'right' | 'wrong' | 'skipped';
        let verdictTxt: string;
        if      (!pickedId)              { verdict = 'skipped'; verdictTxt = 'SKIPPED'; }
        else if (pickedId === correctId) { verdict = 'right';   verdictTxt = 'CORRECT'; }
        else                             { verdict = 'wrong';   verdictTxt = 'WRONG'; }

        return (
          <div key={b.id} className="rn-cloze-feedback-blank">
            <div className={`rn-cloze-feedback-blank-label ${verdict}`}>
              <span className="num">{idx + 1}</span>
              <span className="verdict">{verdictTxt}</span>
            </div>
            <p className="rn-cloze-feedback-rationales">
              {b.choices.map((c) => {
                const isCorrect = c.id === correctId;
                const fb        = blankFeedback?.[c.id];
                return (
                  <span
                    key={c.id}
                    className={`rn-cloze-feedback-item${isCorrect ? ' right' : ''}`}
                  >
                    <span className="rn-cloze-feedback-label">{c.text}</span>
                    {fb && <> — {fb}</>}
                  </span>
                );
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
}
