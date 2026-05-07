// mynclex/lib/bank/runner/types/highlight.tsx
//
// HIGHLIGHT runner — passage with [[bracketed]] clickable chunks.
//
// The stem field on the item carries the passage text WITH double-
// bracket markers around clickable spans. Single brackets are literal
// passage text (medical notation like [K+] = 3.2 stays intact). The
// runner parses the stem positionally and matches the i-th [[..]] to
// content.chunks[i] to get the chunk ID for click handling.
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

import { useMemo } from 'react';
import type {
  HighlightContent,
  HighlightCorrect,
  HighlightChunk,
} from '@/lib/bank/types';
import type { HighlightAnswer } from '@/lib/scoring';

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

type Segment =
  | { kind: 'plain'; text: string }
  | { kind: 'chunk'; idx: number; id: string; text: string };

// Splits the stem into a sequence of plain-text and chunk segments.
// The i-th [[..]] in the stem maps to content.chunks[i] for its ID.
// Curator-side editor enforces that the markup count matches chunks
// length; if they desync (corrupt snapshot), we fall back to a
// synthetic ID so the chunk still renders as something clickable.
function parseStem(stem: string, chunks: HighlightChunk[]): Segment[] {
  const out:    Segment[] = [];
  const regex = /\[\[(.*?)\]\]/g;

  let lastIdx  = 0;
  let chunkIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(stem)) !== null) {
    if (match.index > lastIdx) {
      out.push({ kind: 'plain', text: stem.slice(lastIdx, match.index) });
    }
    const c = chunks[chunkIdx];
    out.push({
      kind: 'chunk',
      idx:  chunkIdx,
      id:   c?.id ?? `_h${chunkIdx + 1}`,
      text: match[1],
    });
    lastIdx  = match.index + match[0].length;
    chunkIdx += 1;
  }

  if (lastIdx < stem.length) {
    out.push({ kind: 'plain', text: stem.slice(lastIdx) });
  }
  return out;
}

export function HighlightRunner(props: HighlightRunnerProps) {
  const { stem, content } = props;
  const isReview = props.mode === 'review';

  const segments = useMemo(
    () => parseStem(stem, content.chunks),
    [stem, content.chunks],
  );

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

  return (
    <>
      <div className="rn-highlight-stem">
        {segments.map((seg, i) => {
          if (seg.kind === 'plain') {
            return <span key={i}>{seg.text}</span>;
          }

          const isPicked  = studentSet.has(seg.id);
          const isCorrect = correctSet?.has(seg.id) ?? false;

          // In review mode, neutral chunks (not picked, not correct)
          // render as plain text — no clickable chrome competing for
          // attention with the chunks that participated.
          if (isReview && !isPicked && !isCorrect) {
            return <span key={i}>{seg.text}</span>;
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
              key={i}
              type="button"
              className={cls.join(' ')}
              disabled={isReview}
              onClick={isReview ? undefined : () => toggle(seg.id)}
              aria-pressed={!isReview ? isPicked : undefined}
            >
              {seg.text}
            </button>
          );
        })}
      </div>

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
