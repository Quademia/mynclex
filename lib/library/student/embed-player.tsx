// mynclex/lib/library/student/embed-player.tsx
//
// The inline embedded-questions player (slice 11.13b) — the read view's
// "read → try → feedback → read on" practice break. Loads its block's
// questions on mount (answerable content only, no key), walks them
// sequentially, grades each via the secure submit action, and shows
// inline feedback. Always a fresh pass on (re)open; each submit appends
// to history (server-side).
//
// The question rendering + green/red review styling are the EXISTING
// bank-runner components (MCQ / TF / SATA / Select-N) + RationaleBlock,
// so it matches the rest of the app. This file is just the player chrome
// (Question N-of-M header, submit/next foot, end-of-set summary) + the
// type dispatch. Type-dispatched from day one so future types (matrix,
// highlight) slot in as a registry entry, not a rewrite.

'use client';

import { useEffect, useState } from 'react';
import {
  McqRunner,
  TfRunner,
  SataRunner,
  SelectNRunner,
  RationaleBlock,
  isMcqComplete,
  isTfComplete,
  isSataComplete,
  isSelectNComplete,
} from '@/lib/practice/runner';
import type { BankItemAnswer } from '@/lib/scoring';
import type {
  McqContent,
  McqCorrect,
  TfContent,
  TfCorrect,
  SataContent,
  SataCorrect,
  SelectNContent,
  SelectNCorrect,
} from '@/lib/bank/types';
import {
  loadEmbedBlock,
  submitEmbedAnswer,
  type EmbedPlayQuestion,
  type EmbedSubmitResult,
} from './embed-player-actions';

type ReviewOk = Extract<EmbedSubmitResult, { ok: true }>;

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; questions: EmbedPlayQuestion[]; answeredBefore: boolean };

export function EmbedPlayer({
  noteId,
  blockId,
}: {
  noteId: string;
  blockId: string;
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    loadEmbedBlock(noteId, blockId).then((res) => {
      if (!live) return;
      if (!res) {
        setLoad({ status: 'error' });
      } else if (res.questions.length === 0) {
        setLoad({ status: 'empty' });
      } else {
        setLoad({
          status: 'ready',
          questions: res.questions,
          answeredBefore: res.questions.some((q) => q.priorAttempts > 0),
        });
      }
    });
    return () => {
      live = false;
    };
  }, [noteId, blockId]);

  if (load.status === 'loading') {
    return <div className="eq-player eq-player--state">Loading practice…</div>;
  }
  if (load.status === 'empty') return null;
  if (load.status === 'error') {
    return (
      <div className="eq-player eq-player--state">
        Practice questions are unavailable.
      </div>
    );
  }

  return (
    <EmbedPlayerRun
      noteId={noteId}
      blockId={blockId}
      questions={load.questions}
      answeredBefore={load.answeredBefore}
    />
  );
}

function initialAnswer(type: EmbedPlayQuestion['questionType']): BankItemAnswer {
  return type === 'MCQ' || type === 'TF' ? null : [];
}

function isComplete(q: EmbedPlayQuestion, answer: BankItemAnswer): boolean {
  switch (q.questionType) {
    case 'MCQ':
      return isMcqComplete(answer as string | null);
    case 'TF':
      return isTfComplete(answer as string | null);
    case 'SATA':
      return isSataComplete(answer as string[]);
    case 'SELECT_N':
      return isSelectNComplete(
        answer as string[],
        (q.content as SelectNContent).select_count,
      );
  }
}

function EmbedPlayerRun({
  noteId,
  blockId,
  questions,
  answeredBefore,
}: {
  noteId: string;
  blockId: string;
  questions: EmbedPlayQuestion[];
  answeredBefore: boolean;
}) {
  const total = questions.length;
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<BankItemAnswer>(
    initialAnswer(questions[0].questionType),
  );
  const [review, setReview] = useState<ReviewOk | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const q = questions[idx];

  async function onSubmit() {
    if (review || submitting || !isComplete(q, answer)) return;
    setSubmitting(true);
    setError(null);
    const res = await submitEmbedAnswer({
      noteId,
      blockId,
      itemId: q.itemId,
      answer,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setReview(res);
    setResults((r) => [...r, res.isCorrect]);
  }

  function onNext() {
    if (idx + 1 < total) {
      const next = idx + 1;
      setIdx(next);
      setAnswer(initialAnswer(questions[next].questionType));
      setReview(null);
      setError(null);
    } else {
      setDone(true);
    }
  }

  if (done) {
    const correct = results.filter(Boolean).length;
    return (
      <div className="eq-player eq-player--done">
        <span className="eq-player-done-ic" aria-hidden="true">
          ✓
        </span>
        <div>
          <div className="eq-player-done-title">
            You got {correct} of {total} right.
          </div>
          <div className="eq-player-done-sub">
            Your answers are saved. Reading continues below.
          </div>
        </div>
      </div>
    );
  }

  const doneCount = review ? idx + 1 : idx;

  return (
    <div className="eq-player">
      <div className="eq-player-head">
        <span className="eq-player-tab">
          <span aria-hidden="true">✦</span>{' '}
          {total > 1 ? `Question ${idx + 1} of ${total}` : 'Practice question'}
        </span>
        {total > 1 && (
          <span className="eq-player-dots" aria-hidden="true">
            {questions.map((_, i) => (
              <span
                key={i}
                className={
                  'eq-player-dot' +
                  (i < doneCount
                    ? ' is-done'
                    : i === idx
                      ? ' is-current'
                      : '')
                }
              />
            ))}
          </span>
        )}
      </div>

      {answeredBefore && idx === 0 && !review && results.length === 0 && (
        <div className="eq-player-prior">
          ↻ You&apos;ve practised this before — this is a fresh attempt.
        </div>
      )}

      <div className="eq-player-body">
        <div className="rn-stem">{q.stem}</div>
        {q.instruction && <p className="rn-instruction">{q.instruction}</p>}

        <PerTypeRunner q={q} answer={answer} onChange={setAnswer} review={review} />

        {review && (
          <RationaleBlock
            isCorrect={review.isCorrect}
            scoreAwarded={review.scoreAwarded}
            marksMax={review.marks}
            rationale={review.rationale}
            rationaleImg={review.rationaleImg}
          />
        )}
      </div>

      <div className="eq-player-foot">
        {error && <span className="eq-player-error">{error}</span>}
        <span className="eq-player-foot-spacer" />
        {!review ? (
          <button
            type="button"
            className="eq-player-btn eq-player-btn--submit"
            disabled={!isComplete(q, answer) || submitting}
            onClick={onSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        ) : (
          <button
            type="button"
            className="eq-player-btn eq-player-btn--next"
            onClick={onNext}
          >
            {idx + 1 < total ? 'Next →' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  );
}

// Dispatch to the existing bank-runner component for this question's type,
// in answering or review mode. Module-level (not nested in render).
function PerTypeRunner({
  q,
  answer,
  onChange,
  review,
}: {
  q: EmbedPlayQuestion;
  answer: BankItemAnswer;
  onChange: (next: BankItemAnswer) => void;
  review: ReviewOk | null;
}) {
  switch (q.questionType) {
    case 'MCQ': {
      const content = q.content as McqContent;
      return review ? (
        <McqRunner
          mode="review"
          content={content}
          studentAnswer={answer as string | null}
          correct={review.correct as McqCorrect}
        />
      ) : (
        <McqRunner
          mode="answering"
          content={content}
          selected={answer as string | null}
          onChange={(id) => onChange(id)}
        />
      );
    }
    case 'TF': {
      const content = q.content as TfContent;
      return review ? (
        <TfRunner
          mode="review"
          content={content}
          studentAnswer={answer as string | null}
          correct={review.correct as TfCorrect}
        />
      ) : (
        <TfRunner
          mode="answering"
          content={content}
          selected={answer as string | null}
          onChange={(id) => onChange(id)}
        />
      );
    }
    case 'SATA': {
      const content = q.content as SataContent;
      return review ? (
        <SataRunner
          mode="review"
          content={content}
          studentAnswer={answer as string[]}
          correct={review.correct as SataCorrect}
        />
      ) : (
        <SataRunner
          mode="answering"
          content={content}
          selected={answer as string[]}
          onChange={(next) => onChange(next)}
        />
      );
    }
    case 'SELECT_N': {
      const content = q.content as SelectNContent;
      return review ? (
        <SelectNRunner
          mode="review"
          content={content}
          studentAnswer={answer as string[]}
          correct={review.correct as SelectNCorrect}
        />
      ) : (
        <SelectNRunner
          mode="answering"
          content={content}
          selected={answer as string[]}
          onChange={(next) => onChange(next)}
        />
      );
    }
  }
}
