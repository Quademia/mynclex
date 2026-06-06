// mynclex/lib/tutor-quiz/quiz-card.tsx
//
// Server component — one card in the /tutor/quizzes grid. The whole
// card is a link into the quiz editor; there's no in-card Edit
// affordance (metadata editing lives on the editor page itself).
//
// Tutor Quiz Slice 5 — adds the "Used in N programmes" chip
// (§9.4.2). Three tones: not-in-any-programme (muted), 1 (linked),
// 2+ (linked, semibold). Forward-compat single-segment for v1; the
// future "Used in 2 programmes, 1 readiness pack" shape extends
// naturally.

import Link from 'next/link';
import type { QuizListRow } from './types';
import {
  formatItemCount,
  formatQuizKind,
  formatQuizMode,
  formatQuizStatus,
  quizStatusPillClass,
} from './format';
import { formatUsedInProgrammes } from '@/lib/programme-quizzes/format';
import { EditQuizTrigger } from './edit-quiz-trigger';

export function QuizCard({ quiz }: { quiz: QuizListRow }) {
  const isMuted = quiz.status === 'ARCHIVED';

  // The pencil is a sibling of the link (a button can't be nested in an
  // anchor), positioned into the card's top-right lane by .quiz-card-wrap.
  return (
    <div className="quiz-card-wrap">
      <Link
        href={`/tutor/quiz/${quiz.quiz_id}`}
        className={`quiz-card ${isMuted ? 'is-muted' : ''}`}
      >
        <div className="quiz-card-head">
          <h2 className="quiz-card-title">{quiz.title}</h2>
          <div className="quiz-card-head-pills">
            {quiz.status === 'DRAFT' && quiz.item_count === 0 && (
              <span
                className="quiz-needs-q"
                title="This quiz has no questions yet — add at least one to publish it."
              >
                Needs questions
              </span>
            )}
            <span className={`quiz-pill ${quizStatusPillClass(quiz.status)}`}>
              {formatQuizStatus(quiz.status)}
            </span>
          </div>
        </div>

        {quiz.description && (
          <p className="quiz-card-desc">{quiz.description}</p>
        )}

        <UsedInProgrammesChip count={quiz.used_in_programmes} />

        <div className="quiz-card-foot">
          <span className="quiz-card-kind">
            {formatQuizKind(quiz.quiz_kind)}
          </span>
          <span className="quiz-card-meta">
            {formatItemCount(quiz.item_count)} · {formatQuizMode(quiz.mode)}
          </span>
        </div>
      </Link>

      <EditQuizTrigger quiz={quiz} />
    </div>
  );
}

function UsedInProgrammesChip({ count }: { count: number }) {
  // Three tones — none / one / many — drives the §9.4.2 chip.
  const toneClass =
    count === 0 ? 'is-none' : count === 1 ? 'is-some' : 'is-many';
  const title =
    count === 0
      ? "This quiz isn't in any programme yet."
      : count === 1
        ? 'This quiz is attached to 1 programme.'
        : `This quiz is attached to ${count} programmes.`;
  return (
    <span className={`quiz-card-used-chip ${toneClass}`} title={title}>
      {formatUsedInProgrammes(count)}
    </span>
  );
}
