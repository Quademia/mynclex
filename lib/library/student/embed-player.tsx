// mynclex/lib/library/student/embed-player.tsx
//
// The inline embedded-questions player (slice 11.13b) — the read view's
// "read → try → feedback → read on" practice break.
//
// States:
//   intro   — "Practice — N questions", a list of the student's past
//             sittings (each reviewable), and Start / Start again.
//   playing — a fresh pass: Question N-of-M → answer → Submit → feedback
//             → Next. One pass = one play_id (minted on Start), sent with
//             every answer.
//   done    — end-of-set summary.
//   review  — a past sitting replayed read-only from its frozen snapshots.
//
// The question rendering + green/red review styling are the EXISTING
// bank-runner components (MCQ / TF / SATA / Select-N) + RationaleBlock.

'use client';

import { useEffect, useRef, useState } from 'react';
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
import { RichRender } from '@/lib/authoring/rich-render';
import { parseRichDoc } from '@/lib/authoring/rich-doc';
import { bankImageRenderer } from '@/lib/authoring/bank-image-render';
import type { BankImageResolver } from '@/lib/authoring/bank-image-view';
import { getEmbedStemImageUrlAction } from './embed-image-actions';
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
import { formatRelative } from '../format';
import { useEmbedPlayGuard } from './embed-play-guard';
import { createSegment, moveTo, pause, resume, bank, type Segment } from '@/lib/practice/runner/time-tracker';
import {
  loadEmbedBlock,
  loadEmbedPlayReview,
  submitEmbedAnswer,
  type EmbedPlayQuestion,
  type EmbedReviewQuestion,
  type EmbedSitting,
  type EmbedSubmitResult,
} from './embed-player-actions';

type ReviewOk = Extract<EmbedSubmitResult, { ok: true }>;
type QuestionType = EmbedPlayQuestion['questionType'];

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'ready'; questions: EmbedPlayQuestion[]; sittings: EmbedSitting[] };

export function EmbedPlayer({
  noteId,
  blockId,
  title,
}: {
  noteId: string;
  blockId: string;
  /** Optional tutor-given name for this practice checkpoint. */
  title?: string;
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
          sittings: res.sittings,
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
      title={title}
      questions={load.questions}
      sittings={load.sittings}
    />
  );
}

function initialAnswer(type: QuestionType): BankItemAnswer {
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
  title,
  questions,
  sittings,
}: {
  noteId: string;
  blockId: string;
  title?: string;
  questions: EmbedPlayQuestion[];
  sittings: EmbedSitting[];
}) {
  const guard = useEmbedPlayGuard();
  const total = questions.length;

  const [phase, setPhase] = useState<'intro' | 'playing' | 'done' | 'review'>(
    'intro',
  );
  const [playId, setPlayId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<BankItemAnswer>(
    initialAnswer(questions[0].questionType),
  );
  const [review, setReview] = useState<ReviewOk | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review-of-past-sitting state.
  const [reviewSitting, setReviewSitting] = useState<{
    label: string;
    questions: EmbedReviewQuestion[] | null; // null = loading
  } | null>(null);

  const q = questions[idx];

  // Per-question engaged time (time engine, attempt-creation §6.3.2). The
  // in-note player reuses the runner's pure tracker, but single-shot: time
  // from when a question is shown until Submit, pausing while the screen is
  // away. The write is append-only (submitEmbedAnswer), so this is naturally
  // decision time. Read at submit and passed to the existing timeSpentSec slot
  // (feeds the deferred tutor "time-on-block" analytics metric).
  const segRef = useRef<Segment>(createSegment());

  // Open a fresh segment whenever a new question is shown for answering.
  useEffect(() => {
    if (phase !== 'playing') return;
    segRef.current = moveTo(segRef.current, `q-${idx}`, performance.now()).seg;
  }, [phase, idx]);

  // Screen-away pause/resume so idle time isn't counted (only whole-screen
  // departures — the pure tracker excludes the gap).
  useEffect(() => {
    const onVis = () => {
      const now = performance.now();
      segRef.current = document.hidden
        ? pause(segRef.current, now).seg
        : resume(segRef.current, now);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Slice 8c — note-anchored resolver for bankImage nodes in embedded
  // stems (the attempt anchor doesn't exist here; the gate is the note).
  const resolveImageUrl: BankImageResolver = (id) =>
    getEmbedStemImageUrlAction(noteId, id);

  // Mid-play = a started, unfinished pass with at least one answer in.
  const midPlay = phase === 'playing' && results.length > 0;
  useEffect(() => {
    guard?.setBlockPlaying(blockId, midPlay);
    return () => guard?.setBlockPlaying(blockId, false);
  }, [guard, blockId, midPlay]);

  function start() {
    setPlayId(crypto.randomUUID());
    setIdx(0);
    setAnswer(initialAnswer(questions[0].questionType));
    setReview(null);
    setResults([]);
    setError(null);
    setPhase('playing');
  }

  function openReview(sitting: EmbedSitting, label: string) {
    setReviewSitting({ label, questions: null });
    setPhase('review');
    loadEmbedPlayReview(noteId, blockId, sitting.playId).then((qs) => {
      setReviewSitting((cur) => (cur ? { ...cur, questions: qs } : cur));
    });
  }

  function closeReview() {
    setReviewSitting(null);
    setPhase('intro');
  }

  async function onSubmit() {
    if (review || submitting || !playId || !isComplete(q, answer)) return;
    setSubmitting(true);
    setError(null);
    // Bank the engaged time for this question (excludes any screen-away gaps).
    const banked = bank(segRef.current, performance.now());
    segRef.current = banked.seg;
    const res = await submitEmbedAnswer({
      noteId,
      blockId,
      itemId: q.itemId,
      playId,
      answer,
      timeSpentSec: banked.flush?.seconds ?? 0,
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
      setPhase('done');
    }
  }

  // ── Review of a past sitting ──
  if (phase === 'review' && reviewSitting) {
    return (
      <ReviewPlay
        label={reviewSitting.label}
        questions={reviewSitting.questions}
        onBack={closeReview}
        resolveImageUrl={resolveImageUrl}
      />
    );
  }

  // ── Intro / Start card (+ past sittings) ──
  if (phase === 'intro') {
    return (
      <div className="eq-player eq-player--intro">
        <div className="eq-intro-head">
          <div className="eq-intro-main">
            <span className="eq-player-tab">
              <span aria-hidden="true">✦</span> Practice
            </span>
            <div className="eq-intro-title">
              {title && title.trim()
                ? title
                : `${total} question${total === 1 ? '' : 's'}`}
            </div>
            <div className="eq-intro-sub">
              {title && title.trim()
                ? `${total} question${total === 1 ? '' : 's'} · `
                : ''}
              {sittings.length > 0
                ? 'Practise again, or review a past attempt.'
                : 'Test yourself on what you just read.'}
            </div>
          </div>
          <button
            type="button"
            className="eq-player-btn eq-player-btn--submit"
            onClick={start}
          >
            {sittings.length > 0 ? 'Start again' : 'Start'}
          </button>
        </div>

        {sittings.length > 0 && (
          <ul className="eq-attempts">
            {sittings.map((s, i) => (
              <li key={s.playId} className="eq-attempt">
                <span className="eq-attempt-label">
                  Attempt {sittings.length - i}
                </span>
                <span className="eq-attempt-meta">
                  {formatRelative(s.at)} · {s.correct}/{s.answered} correct
                </span>
                <button
                  type="button"
                  className="eq-attempt-review"
                  onClick={() =>
                    openReview(s, `Attempt ${sittings.length - i}`)
                  }
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── End-of-set summary ──
  if (phase === 'done') {
    const correct = results.filter(Boolean).length;
    return (
      <div className="eq-player eq-player--done">
        <span className="eq-player-done-ic" aria-hidden="true">
          ✓
        </span>
        <div className="eq-player-done-main">
          <div className="eq-player-done-title">
            You got {correct} of {total} right.
          </div>
          <div className="eq-player-done-sub">
            Your answers are saved. Reading continues below.
          </div>
        </div>
        <button
          type="button"
          className="eq-attempt-review"
          onClick={() => setPhase('intro')}
        >
          Done
        </button>
      </div>
    );
  }

  // ── Playing ──
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

      <div className="eq-player-body">
        <div className="rn-stem">
          <RichRender
            doc={parseRichDoc(q.stem)}
            custom={bankImageRenderer(resolveImageUrl)}
          />
        </div>
        {q.instruction && (
          <p className="rn-instruction"><RichRender doc={parseRichDoc(q.instruction)} inline /></p>
        )}

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

// Read-only replay of one past sitting, paged question by question.
function ReviewPlay({
  label,
  questions,
  onBack,
  resolveImageUrl,
}: {
  label: string;
  questions: EmbedReviewQuestion[] | null;
  onBack: () => void;
  resolveImageUrl?: BankImageResolver;
}) {
  const [i, setI] = useState(0);

  if (questions === null) {
    return <div className="eq-player eq-player--state">Loading attempt…</div>;
  }
  if (questions.length === 0) {
    return (
      <div className="eq-player">
        <div className="eq-player-head">
          <button type="button" className="eq-attempt-review" onClick={onBack}>
            ← Back
          </button>
        </div>
        <div className="eq-player-body">Nothing to review.</div>
      </div>
    );
  }

  const rq = questions[i];
  const reviewObj: ReviewOk = {
    ok: true,
    isCorrect: rq.isCorrect,
    scoreAwarded: rq.scoreAwarded,
    marks: rq.marks,
    correct: rq.correct,
    rationale: rq.rationale,
    rationaleImg: rq.rationaleImg,
  };

  return (
    <div className="eq-player eq-player--review">
      <div className="eq-player-head">
        <button type="button" className="eq-attempt-review" onClick={onBack}>
          ← Back
        </button>
        <span className="eq-player-tab eq-review-tab">
          Reviewing {label} · Question {i + 1} of {questions.length}
        </span>
      </div>

      <div className="eq-player-body">
        <div className="rn-stem">
          <RichRender
            doc={parseRichDoc(rq.stem)}
            custom={bankImageRenderer(resolveImageUrl)}
          />
        </div>
        {rq.instruction && (
          <p className="rn-instruction"><RichRender doc={parseRichDoc(rq.instruction)} inline /></p>
        )}

        <PerTypeRunner
          questionType={rq.questionType}
          content={rq.content}
          answer={rq.studentAnswer as BankItemAnswer}
          onChange={() => {}}
          review={reviewObj}
        />

        <RationaleBlock
          isCorrect={rq.isCorrect}
          scoreAwarded={rq.scoreAwarded}
          marksMax={rq.marks}
          rationale={rq.rationale}
          rationaleImg={rq.rationaleImg}
        />
      </div>

      <div className="eq-player-foot">
        {i > 0 && (
          <button
            type="button"
            className="eq-player-btn eq-player-btn--next"
            onClick={() => setI((n) => Math.max(0, n - 1))}
          >
            ← Prev
          </button>
        )}
        <span className="eq-player-foot-spacer" />
        {i + 1 < questions.length && (
          <button
            type="button"
            className="eq-player-btn eq-player-btn--next"
            onClick={() => setI((n) => Math.min(questions.length - 1, n + 1))}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

// Dispatch to the existing bank-runner component for this question's type,
// in answering or review mode. Only needs the type + content (+ the
// review payload in review mode), so it serves both live play and
// past-sitting review.
function PerTypeRunner({
  questionType,
  content,
  answer,
  onChange,
  review,
}: {
  questionType: QuestionType;
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
