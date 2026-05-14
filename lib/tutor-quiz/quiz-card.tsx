// mynclex/lib/tutor-quiz/quiz-card.tsx
//
// Server component — one card in the /tutor/quizzes grid. The whole
// card is a link into the quiz editor; there's no in-card Edit
// affordance (metadata editing lives on the editor page itself).

import Link from 'next/link';
import type { QuizListRow } from './types';
import {
  formatItemCount,
  formatQuizKind,
  formatQuizMode,
  formatQuizStatus,
  quizStatusPillClass,
} from './format';

export function QuizCard({ quiz }: { quiz: QuizListRow }) {
  const isMuted = quiz.status === 'ARCHIVED';

  return (
    <Link
      href={`/tutor/quiz/${quiz.quiz_id}`}
      className={`quiz-card ${isMuted ? 'is-muted' : ''}`}
    >
      <div className="quiz-card-head">
        <h2 className="quiz-card-title">{quiz.title}</h2>
        <span className={`quiz-pill ${quizStatusPillClass(quiz.status)}`}>
          {formatQuizStatus(quiz.status)}
        </span>
      </div>

      {quiz.description && (
        <p className="quiz-card-desc">{quiz.description}</p>
      )}

      <div className="quiz-card-foot">
        <span className="quiz-card-kind">
          {formatQuizKind(quiz.quiz_kind)}
        </span>
        <span className="quiz-card-meta">
          {formatItemCount(quiz.item_count)} · {formatQuizMode(quiz.mode)}
        </span>
      </div>
    </Link>
  );
}
