// mynclex/lib/tutor-quiz/empty-state.tsx
//
// First-login empty state for the /tutor/quizzes list — shown when
// the tutor has zero quizzes. CTA wires straight to <NewQuizTrigger>.

import { NewQuizTrigger } from './new-quiz-trigger';

export function QuizzesEmpty() {
  return (
    <div className="quizzes-empty">
      <h2 className="quizzes-empty-title">
        You haven&apos;t created any quizzes yet.
      </h2>
      <p className="quizzes-empty-sub">
        A quiz is a reusable Mock or Practice question set built from
        your own bank. Once a quiz is published you can attach it to
        any programme&apos;s curriculum.
      </p>
      <NewQuizTrigger variant="empty" />
    </div>
  );
}
