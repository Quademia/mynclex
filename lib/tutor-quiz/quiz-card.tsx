// mynclex/lib/tutor-quiz/quiz-card.tsx
//
// Server component — one card in the /tutor/quizzes grid (2026-06 Claude
// Design "Quiz UI Uplift" — List A). The whole card is a link into the
// editor; a quick-action pencil sits in the corner (a sibling of the
// link). Layout: a padded head (kind tag · readiness flag · status pill)
// + title + description, over a bordered footer tray (icon meta + the
// used-in-programmes chip). The kind colours a left accent edge.

import Link from 'next/link';
import type { QuizListRow } from './types';
import {
  formatDuration,
  formatQuizKind,
  formatQuizMode,
  formatQuizStatus,
  isTimedMode,
  quizStatusPillClass,
} from './format';
import { QuizIcon } from './quiz-icons';
import { QuizCardMenu } from './quiz-card-menu';

export function QuizCard({ quiz }: { quiz: QuizListRow }) {
  const isMuted = quiz.status === 'ARCHIVED';
  const isMock = quiz.quiz_kind === 'MOCK';
  const needsQuestions = quiz.status === 'DRAFT' && quiz.item_count === 0;
  const durationLabel = formatDuration(quiz.duration_seconds);

  return (
    <div className="quiz-card-wrap">
      <Link
        href={`/tutor/quiz/${quiz.quiz_id}`}
        className={`quiz-card ${isMock ? 'is-mock' : 'is-practice'} ${
          isMuted ? 'is-muted' : ''
        }`}
      >
        <div className="quiz-card-body">
          <div className="quiz-card-head">
            <span
              className={`quiz-kind-tag ${isMock ? 'is-mock' : 'is-practice'}`}
            >
              <QuizIcon name={isMock ? 'target' : 'sparkles'} />
              {formatQuizKind(quiz.quiz_kind)}
            </span>
            <div className="quiz-card-head-pills">
              {needsQuestions && (
                <span
                  className="quiz-needs-q"
                  title="This quiz has no questions yet — add at least one to publish it."
                >
                  <QuizIcon name="alert" />
                  Needs questions
                </span>
              )}
              <span className={`quiz-pill ${quizStatusPillClass(quiz.status)}`}>
                {formatQuizStatus(quiz.status)}
              </span>
            </div>
          </div>

          <h2 className="quiz-card-title">{quiz.title}</h2>

          {quiz.description && (
            <p className="quiz-card-desc">{quiz.description}</p>
          )}
        </div>

        <div className="quiz-card-foot">
          <span className="quiz-card-metaitem">
            <QuizIcon name="list-checks" />
            <b>{quiz.item_count}</b>{' '}
            {quiz.item_count === 1 ? 'question' : 'questions'}
          </span>
          <span className="quiz-card-metaitem">
            <QuizIcon name={isTimedMode(quiz.mode) ? 'timer' : 'clock'} />
            {formatQuizMode(quiz.mode)}
            {durationLabel ? ` · ${durationLabel}` : ''}
          </span>
          <UsedInProgrammesChip count={quiz.used_in_programmes} />
        </div>
      </Link>

      <QuizCardMenu quiz={quiz} />
    </div>
  );
}

function UsedInProgrammesChip({ count }: { count: number }) {
  const title =
    count === 0
      ? "This quiz isn't in any programme yet."
      : count === 1
        ? 'This quiz is attached to 1 programme.'
        : `This quiz is attached to ${count} programmes.`;
  return (
    <span
      className={`quiz-card-used-chip ${count === 0 ? 'is-none' : ''}`}
      title={title}
    >
      <QuizIcon name="programmes" />
      {count === 0 ? (
        'Unused'
      ) : (
        <>
          <b>{count}</b>&nbsp;{count === 1 ? 'programme' : 'programmes'}
        </>
      )}
    </span>
  );
}
