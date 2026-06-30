// mynclex/lib/bank/runner/types/highlight.tsx
//
// HIGHLIGHT runner — passage with [[bracketed]] clickable chunks.
//
// The stem field on the item carries the passage as a RICH doc (Slice 6e)
// with double-bracket markers around clickable spans living as PLAIN TEXT
// inside the formatted prose (Option B, decoupled). Single brackets are
// literal passage text (medical notation like [K+] = 3.2 stays intact). The
// shared RichRenderWithSlots renders the formatted passage and splices a
// clickable chunk at the i-th [[..]], matched positionally to
// content.chunks[i] to get the chunk ID for click handling. Legacy plain
// stems read-coerce through parseRichDoc — no migration.
//
// Visual language mirrors the highlight-editor's preview palette
// (auth-hl-preview-chunk) so curators see roughly the same render
// the student does:
//   default  — blue tint, dashed underline (clickable affordance)
//   sel      — yellow (highlighter feel, picked but not yet judged)
//   right    — green tint
//   wrong    — red tint with strikethrough
//   missed   — dashed amber border, no fill
//
// In review mode, chunks that the student didn't pick AND aren't
// correct render as PLAIN TEXT — no styling, no button. They're not
// part of the student's answer story so they shouldn't compete for
// attention with the chunks that ARE.
//
// Per-chunk feedback renders below the passage as a list, only for
// chunks that participated (picked or should-have-been-picked).
//
// Submit gate — HIGHLIGHT allows zero highlights. A deliberate "no
// chunks are relevant" answer is valid (per Sam, 2026-05-07; SATA
// precedent).

'use client';

import { useMemo, type ReactNode } from 'react';
import type {
  HighlightContent,
  HighlightCorrect,
  HighlightChunk,
} from '@/lib/bank/types';
import type { HighlightAnswer } from '@/lib/scoring';
import { parseRichDoc } from '@/lib/authoring/rich-doc';
import { RichRenderWithSlots } from '@/lib/authoring/rich-render';

type HighlightRunnerProps = {
  stem:    string;
  content: HighlightContent;
} & (
  | {
      mode:     'answering';
      selected: HighlightAnswer;
      onChange: (next: HighlightAnswer) => void;
    }
  | {
      mode:          'review';
      studentAnswer: HighlightAnswer;
      correct:       HighlightCorrect;
    }
);

export function isHighlightComplete(_answer: HighlightAnswer | undefined): boolean {
  return true; // zero allowed
}

export function HighlightRunner(props: HighlightRunnerProps) {
  const { stem, content } = props;
  const isReview = props.mode === 'review';

  // The stem is a rich doc (Slice 6e) with [[chunk]] markers as plain text
  // inside it; read-coerced so legacy plain stems still render. The i-th
  // marker maps positionally to content.chunks[i].
  const stemDoc = useMemo(() => parseRichDoc(stem), [stem]);

  const correctSet =
    isReview ? new Set(props.correct.correct_ids) : null;
  const studentSet =
    isReview ? new Set(props.studentAnswer)        : new Set(props.selected);

  function toggle(id: string) {
    if (isReview) return;
    const next = new Set(props.selected);
    if (next.has(id)) next.delete(id);
    else              next.add(id);
    props.onChange(Array.from(next));
  }

  // Render the clickable chunk spliced in at the i-th [[..]] marker. The
  // marker's inner text is `inner`; its ID comes positionally from
  // content.chunks[i] (a desync on a corrupt snapshot falls back to a
  // synthetic ID so the chunk still renders as something).
  const renderSlot = (inner: string, i: number): ReactNode => {
    const chunk: HighlightChunk | undefined = content.chunks[i];
    const id = chunk?.id ?? `_h${i + 1}`;
    const isPicked  = studentSet.has(id);
    const isCorrect = correctSet?.has(id) ?? false;

    // In review mode, neutral chunks (not picked, not correct) render as
    // plain text — no clickable chrome competing for attention with the
    // chunks that participated.
    if (isReview && !isPicked && !isCorrect) {
      return <>{inner}</>;
    }

    const cls = ['rn-highlight-chunk'];
    if (isReview) {
      cls.push('locked');
      if      (isCorrect && isPicked)   cls.push('right');
      else if (!isCorrect && isPicked)  cls.push('wrong');
      else if (isCorrect && !isPicked)  cls.push('missed');
    } else if (isPicked) {
      cls.push('sel');
    }

    return (
      <button
        type="button"
        className={cls.join(' ')}
        disabled={isReview}
        onClick={isReview ? undefined : () => toggle(id)}
        aria-pressed={!isReview ? isPicked : undefined}
      >
        {inner}
      </button>
    );
  };

  return (
    <>
      {/* Persistent orientation line above the passage. Universal
       * "no hint" treatment (design call 2026-05-08) means chunks
       * look like ordinary passage text — students must search.
       * The hint is the safety net: tells them the question is
       * interactive, so silent taps don't read as a broken page.
       * Pattern mirrors SELECT_N's progressive count line. */}
      {!isReview && (
        <div className="rn-highlight-hint">
          {studentSet.size === 0 ? (
            <>Tap a clinical finding in the passage to highlight it.</>
          ) : (
            <>
              <strong>{studentSet.size}</strong> highlighted
              <span className="sep">·</span>
              <span className="hint">tap a highlight to remove</span>
            </>
          )}
        </div>
      )}

      <RichRenderWithSlots
        className="rn-highlight-stem"
        doc={stemDoc}
        pattern={/\[\[(.+?)\]\]/}
        renderSlot={renderSlot}
      />

      {isReview && (
        <HighlightFeedbackList
          chunks={content.chunks}
          studentSet={studentSet}
          correctSet={correctSet!}
          feedback={props.correct.feedback}
        />
      )}
    </>
  );
}


interface FeedbackListProps {
  chunks:     HighlightChunk[];
  studentSet: Set<string>;
  correctSet: Set<string>;
  feedback:   Record<string, string>;
}

function HighlightFeedbackList({
  chunks,
  studentSet,
  correctSet,
  feedback,
}: FeedbackListProps) {
  // Only chunks the student engaged with (picked) or should have
  // engaged with (correct + missed). Neutral chunks aren't part of
  // the answer story.
  const items = chunks.filter((c) => studentSet.has(c.id) || correctSet.has(c.id));
  if (items.length === 0) return null;

  return (
    <div className="rn-highlight-feedback">
      {items.map((c) => {
        const isPicked  = studentSet.has(c.id);
        const isCorrect = correctSet.has(c.id);
        const fb = feedback?.[c.id];

        let icon: string;
        let iconCls: string;
        if      (isCorrect && isPicked)   { icon = '✓'; iconCls = 'right'; }
        else if (!isCorrect && isPicked)  { icon = '✕'; iconCls = 'wrong'; }
        else                              { icon = '⚠'; iconCls = 'missed'; }

        return (
          <div key={c.id} className="rn-highlight-feedback-item">
            <span className={`rn-highlight-feedback-icon ${iconCls}`}>{icon}</span>
            <span className="rn-highlight-feedback-text">
              <strong>{c.text}</strong>
              {fb ? <> — {fb}</> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
