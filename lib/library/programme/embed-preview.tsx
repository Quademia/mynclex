// mynclex/lib/library/programme/embed-preview.tsx
//
// Answerable-but-unsaved preview of an embedded-questions block, for the
// tutor's programme-library "student preview". The tutor experiences the
// practice exactly as a student does — select an answer, submit, see the
// green/red feedback + rationale — but NOTHING is written anywhere (no
// attempt history, no progress). It's a rehearsal, not a record.
//
// Loading: loadEmbedBlock returns answerable content (NO answer key) —
// works for the tutor because it gates on RLS note visibility, satisfied
// by ownership. Grading: gradeEmbedAnswerPreview reads the full question
// server-side and grades, returning the key + rationale for inline
// feedback — the same "key stays server-side until submit" rule the
// student player uses — but writes no row.
//
// One question at a time with Prev / Next (so a 20-question block isn't a
// wall of scroll). Answers + feedback persist in memory while paging;
// everything resets on a page reload, because nothing is stored. The
// question rendering reuses the bank-runner components (MCQ / TF / SATA /
// Select-N) + RationaleBlock, exactly like the student player.

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
  type EmbedPlayQuestion,
  type EmbedSubmitResult,
} from '../student/embed-player-actions';
import { gradeEmbedAnswerPreview } from './embed-grade-action';

type ReviewOk = Extract<EmbedSubmitResult, { ok: true }>;
type QType = EmbedPlayQuestion['questionType'];

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; questions: EmbedPlayQuestion[] };

export function EmbedPreview({
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
      if (!res) setLoad({ status: 'error' });
      else if (res.questions.length === 0) setLoad({ status: 'empty' });
      else setLoad({ status: 'ready', questions: res.questions });
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
    <EmbedPreviewPaged
      noteId={noteId}
      blockId={blockId}
      questions={load.questions}
    />
  );
}

function initialAnswer(type: QType): BankItemAnswer {
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

function EmbedPreviewPaged({
  noteId,
  blockId,
  questions,
}: {
  noteId: string;
  blockId: string;
  questions: EmbedPlayQuestion[];
}) {
  const total = questions.length;
  const [idx, setIdx] = useState(0);
  // Answers + feedback persist across paging (in memory only).
  const [answers, setAnswers] = useState<BankItemAnswer[]>(() =>
    questions.map((q) => initialAnswer(q.questionType)),
  );
  const [reviews, setReviews] = useState<(ReviewOk | null)[]>(() =>
    questions.map(() => null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = questions[idx];
  const answer = answers[idx];
  const review = reviews[idx];

  function setAnswer(next: BankItemAnswer) {
    setAnswers((prev) => {
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }

  async function onSubmit() {
    if (review || submitting || !isComplete(q, answer)) return;
    setSubmitting(true);
    setError(null);
    const res = await gradeEmbedAnswerPreview({
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
    setReviews((prev) => {
      const copy = prev.slice();
      copy[idx] = res;
      return copy;
    });
  }

  function goto(next: number) {
    setError(null);
    setIdx(Math.max(0, Math.min(total - 1, next)));
  }

  return (
    <div className="eq-player eq-preview">
      <div className="eq-preview-head">
        <span className="eq-player-tab">
          <span aria-hidden="true">✦</span> Practice
        </span>
        <span className="eq-preview-note">
          {total > 1 ? `Question ${idx + 1} of ${total}` : `${total} question`}
          <span className="eq-preview-unsaved"> · preview, not saved</span>
        </span>
      </div>

      <div className="eq-player-body">
        <div className="rn-stem">{q.stem}</div>
        {q.instruction && <p className="rn-instruction">{q.instruction}</p>}

        <PerTypeRunner
          questionType={q.questionType}
          content={q.content}
          answer={answer}
          onChange={setAnswer}
          review={review}
        />

        {review && (
          <RationaleBlock
            isCorrect={review.isCorrect}
            scoreAwarded={review.scoreAwarded}
            marksMax={review.marks}
            rationale={review.rationale}
            rationaleImg={review.rationaleImg}
          />
        )}

        {!review && (
          <div className="eq-preview-submit">
            {error && <span className="eq-player-error">{error}</span>}
            <button
              type="button"
              className="eq-player-btn eq-player-btn--submit"
              disabled={!isComplete(q, answer) || submitting}
              onClick={onSubmit}
            >
              {submitting ? 'Checking…' : 'Check answer'}
            </button>
          </div>
        )}
      </div>

      {total > 1 && (
        <div className="eq-player-foot">
          {idx > 0 && (
            <button
              type="button"
              className="eq-player-btn eq-player-btn--next"
              onClick={() => goto(idx - 1)}
            >
              ← Prev
            </button>
          )}
          <span className="eq-player-foot-spacer" />
          {idx + 1 < total && (
            <button
              type="button"
              className="eq-player-btn eq-player-btn--next"
              onClick={() => goto(idx + 1)}
            >
              Next →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Dispatch to the bank-runner component for this question's type, in
// answering or review mode — the same component the student player uses.
function PerTypeRunner({
  questionType,
  content,
  answer,
  onChange,
  review,
}: {
  questionType: QType;
  content: unknown;
  answer: BankItemAnswer;
  onChange: (next: BankItemAnswer) => void;
  review: ReviewOk | null;
}) {
  switch (questionType) {
    case 'MCQ': {
      const c = content as McqContent;
      return review ? (
        <McqRunner
          mode="review"
          content={c}
          studentAnswer={answer as string | null}
          correct={review.correct as McqCorrect}
        />
      ) : (
        <McqRunner
          mode="answering"
          content={c}
          selected={answer as string | null}
          onChange={(id) => onChange(id)}
        />
      );
    }
    case 'TF': {
      const c = content as TfContent;
      return review ? (
        <TfRunner
          mode="review"
          content={c}
          studentAnswer={answer as string | null}
          correct={review.correct as TfCorrect}
        />
      ) : (
        <TfRunner
          mode="answering"
          content={c}
          selected={answer as string | null}
          onChange={(id) => onChange(id)}
        />
      );
    }
    case 'SATA': {
      const c = content as SataContent;
      return review ? (
        <SataRunner
          mode="review"
          content={c}
          studentAnswer={answer as string[]}
          correct={review.correct as SataCorrect}
        />
      ) : (
        <SataRunner
          mode="answering"
          content={c}
          selected={answer as string[]}
          onChange={(next) => onChange(next)}
        />
      );
    }
    case 'SELECT_N': {
      const c = content as SelectNContent;
      return review ? (
        <SelectNRunner
          mode="review"
          content={c}
          studentAnswer={answer as string[]}
          correct={review.correct as SelectNCorrect}
        />
      ) : (
        <SelectNRunner
          mode="answering"
          content={c}
          selected={answer as string[]}
          onChange={(next) => onChange(next)}
        />
      );
    }
  }
}
