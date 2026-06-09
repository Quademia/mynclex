// mynclex/lib/tutor-quiz/quiz-card.tsx
//
// Server component — one card in the /tutor/quizzes grid (2026-06 Claude
// Design "Quiz UI Uplift" — List A, then the "badges row" pass). Layout:
// a padded head (kind tag · readiness flag · status pill) + title +
// description, then a footer split into two rows — a meta row
// (questions · mode · duration) and a dedicated badges row (Tags ·
// Programmes · Activities, each with a hover-peek).
//
// Click model: the editor link wraps the head/title/description AND the
// meta row, so most of the card opens the editor. The badges row sits
// OUTSIDE the link as an independent interactive strip (its buttons pin
// their peeks), and the ⋯ menu stays a corner sibling. The card switches
// to overflow:visible so peeks escape its edge.

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
import { QuizCardBadges } from './quiz-card-badges';

export function QuizCard({ quiz }: { quiz: QuizListRow }) {
  const isMuted = quiz.status === 'ARCHIVED';
  const isMock = quiz.quiz_kind === 'MOCK';
  const needsQuestions = quiz.status === 'DRAFT' && quiz.item_count === 0;
  const durationLabel = formatDuration(quiz.duration_seconds);

  return (
    <div className="quiz-card-wrap">
      <div
        className={`quiz-card qc-vis ${isMock ? 'is-mock' : 'is-practice'} ${
          isMuted ? 'is-muted' : ''
        }`}
      >
        <Link href={`/tutor/quiz/${quiz.quiz_id}`} className="quiz-card-hit">
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

          <div className="quiz-card-foot qc-foot-row is-meta">
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
          </div>
        </Link>

        <div className="quiz-card-foot qc-foot-row is-badges">
          <QuizCardBadges
            tags={quiz.tags}
            programmes={quiz.programmes}
            activities={quiz.activities}
          />
        </div>
      </div>

      <QuizCardMenu quiz={quiz} />
    </div>
  );
}
