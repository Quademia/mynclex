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
// Per-blank feedback below the stem: a left-accented "Blank N" header
// followed by every option for that blank. The student's actual pick is
// NOT marked here — the stem pill already shows it (Sam, 2026-05-08,
// design mock B′).
//
// ⚠ ONLY THE CORRECT OPTION IS COLOURED (Sam, 2026-08-03). It was green
// for correct and a softened red (#9b2c2c) for every other option; the
// rest are now ordinary body text. Red was marking DISTRACTORS, not
// mistakes — a student who answered the blank correctly still saw two or
// three red options under a header reading CORRECT, which is the same
// defect class as the review strip telling a partial scorer "wrong".
// ⓘ `drag-cloze` keeps its red deliberately: its distractors sit inside a
// box captioned DISTRACTORS, so the colour is explained. This list has no
// caption, so the same red reads as "you got these wrong".
//
// ⚠ THE SEPARATOR FOLLOWS THE CONTENT, and it has to. The original design
// assumed every choice carried a rationale, so the options read as prose
// ("low — Correct. In shock… high — A high blood pressure…"). Measured
// against the real bank: only 68 of 1,557 choices (4.4%) have a rationale
// and 455 of 473 blanks (96%) have none at all — so what students
// actually saw was "low high unchanged", three terms separated by one
// space. Bare labels are therefore comma-joined, while a blank whose
// choices DO carry rationales puts one option per line (a comma there
// would collide with the rationale's own sentence punctuation).
//
// Submit gate — CLOZE requires every blank filled. Unlike SATA /
// HIGHLIGHT (where "zero" is a deliberate "nothing applies" answer), an
// empty blank in a sentence-completion isn't an opinion — it's an
// unanswered question.

'use client';

import { useMemo, type ReactNode } from 'react';
import type {
  ClozeContent,
  ClozeCorrect,
  ClozeBlank,
} from '@/lib/bank/types';
import type { ClozeAnswer } from '@/lib/scoring';
import { parseRichDoc, isEmptyRichDoc } from '@/lib/authoring/rich-doc';
import { RichRender, RichRenderWithSlots } from '@/lib/authoring/rich-render';
import { bankImageRenderer } from '@/lib/authoring/bank-image-render';
import type { BankImageResolver } from '@/lib/authoring/bank-image-view';

type ClozeRunnerProps = {
  stem:    string;
  content: ClozeContent;
  // Slice 8 — attempt-bound resolver for bankImage nodes in the stem.
  resolveImageUrl?: BankImageResolver;
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

export function ClozeRunner(props: ClozeRunnerProps) {
  const { stem, content } = props;
  const isReview = props.mode === 'review';

  // The stem is a rich doc (Slice 6d) with {N} markers as plain text inside
  // it; read-coerced so legacy plain stems still render. The i-th marker maps
  // positionally to content.blanks[i] (the curator-side parser renumbers gaps
  // on save). A count desync (corrupt snapshot) falls back to a synthetic
  // empty blank — same defensive pattern as before.
  const stemDoc = useMemo(() => parseRichDoc(stem), [stem]);

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

  // Render one blank slot for the i-th marker. Persistent superscript number
  // (both modes) matches the "Blank N" headers in the feedback prose so a
  // student can map a dropdown / pill back to its rationale entry.
  const renderSlot = (_key: string, i: number): ReactNode => {
    const blank: ClozeBlank = content.blanks[i] ?? { id: `_b${i + 1}`, choices: [] };
    const num = (
      <span className="rn-cloze-blank-num" aria-hidden="true">
        {i + 1}
      </span>
    );

    if (!isReview) {
      const value = props.selected[blank.id] ?? '';
      return (
        <span className="rn-cloze-blank-wrap">
          {num}
          <select
            className={`rn-cloze-select${value ? ' sel' : ''}`}
            value={value}
            onChange={(e) => setBlank(blank.id, e.target.value)}
            aria-label={`Blank ${i + 1}`}
          >
            <option value="">— choose —</option>
            {blank.choices.map((c) => (
              <option key={c.id} value={c.id}>{c.text}</option>
            ))}
          </select>
        </span>
      );
    }

    // Review mode — render an inline pill instead of a <select>.
    const pickedId = props.studentAnswer[blank.id];
    const correctId = props.correct.answers[blank.id];
    const pickedChoice = blank.choices.find((c) => c.id === pickedId);
    const isCorrect = !!pickedId && pickedId === correctId;

    if (!pickedId) {
      return (
        <span className="rn-cloze-blank-wrap">
          {num}
          <span className="rn-cloze-pill skipped" aria-label={`Blank ${i + 1} skipped`}>
            (skipped)
          </span>
        </span>
      );
    }
    return (
      <span className="rn-cloze-blank-wrap">
        {num}
        <span
          className={`rn-cloze-pill ${isCorrect ? 'right' : 'wrong'}`}
          aria-label={`Blank ${i + 1} ${isCorrect ? 'correct' : 'wrong'}`}
        >
          <span className="rn-cloze-pill-mark" aria-hidden="true">
            {isCorrect ? '✓' : '✕'}
          </span>
          {pickedChoice?.text ?? pickedId}
        </span>
      </span>
    );
  };

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

      <RichRenderWithSlots
        className="rn-cloze-stem"
        doc={stemDoc}
        pattern={/\{(\d+)\}/}
        renderSlot={renderSlot}
        custom={bankImageRenderer(props.resolveImageUrl)}
      />

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

export interface ClozeFeedbackEntry {
  choice:    ClozeBlank['choices'][number];
  isCorrect: boolean;
  fbDoc:     ReturnType<typeof parseRichDoc> | null;
  hasFb:     boolean;
}

/**
 * Build one blank's feedback entries, and decide how the paragraph reads.
 *
 * Parses each choice's rationale ONCE (it is a rich doc since Slice 6d-ii,
 * read-coerced so legacy plain feedback still renders) and derives the
 * blank's shape from what actually came back:
 *
 *   'terms' — no choice carries a rationale. 455 of 473 blanks in the
 *             bank (96%). Bare labels, comma-joined by CSS.
 *   'prose' — at least one does. One option per line, because a comma
 *             would run straight into the rationale's own full stop.
 *
 * ⚠ Decided per BLANK, never per choice: a half-authored blank would
 * otherwise mix commas and line breaks inside a single paragraph.
 *
 * ⚠ An EMPTY rich doc counts as no rationale. A curator who opens the
 * feedback field and saves without typing leaves `{"type":"doc"...}` with
 * no content — truthy, so a bare `if (fbRaw)` would call that blank
 * 'prose' and give it one-per-line layout with nothing on the lines.
 */
export function clozeFeedbackEntries(
  choices:       ClozeBlank['choices'],
  correctId:     string | undefined,
  blankFeedback: Record<string, string> | undefined,
): { entries: ClozeFeedbackEntry[]; shape: 'prose' | 'terms' } {
  const entries: ClozeFeedbackEntry[] = choices.map((choice) => {
    const fbRaw = blankFeedback?.[choice.id];
    const fbDoc = fbRaw ? parseRichDoc(fbRaw) : null;
    return {
      choice,
      isCorrect: choice.id === correctId,
      fbDoc,
      hasFb: fbDoc !== null && !isEmptyRichDoc(fbDoc),
    };
  });
  return { entries, shape: entries.some((e) => e.hasFb) ? 'prose' : 'terms' };
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

        const { entries: rendered, shape } = clozeFeedbackEntries(
          b.choices,
          correctId,
          blankFeedback,
        );

        return (
          <div key={b.id} className="rn-cloze-feedback-blank">
            <div className={`rn-cloze-feedback-blank-label ${verdict}`}>
              <span className="num">{idx + 1}</span>
              <span className="verdict">{verdictTxt}</span>
            </div>
            <p className={`rn-cloze-feedback-rationales ${shape}`}>
              {rendered.map(({ choice, isCorrect, fbDoc, hasFb }) => (
                <span
                  key={choice.id}
                  className={`rn-cloze-feedback-item${isCorrect ? ' right' : ''}`}
                >
                  <span className="rn-cloze-feedback-label">{choice.text}</span>
                  {hasFb && <> — <RichRender doc={fbDoc!} inline /></>}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
