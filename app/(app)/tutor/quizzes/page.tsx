// mynclex/app/(app)/tutor/quizzes/page.tsx
//
// Tutor "Quizzes" — list of reusable Mock / Practice quizzes the
// tutor owns (Tutor Quiz Slice 1). Quizzes are tutor-scoped and
// reusable across programmes; linking a quiz into a programme's
// curriculum happens later (Slice 2) via the activity editor.
//
// TUTOR role gate is in (app)/tutor/layout.tsx; chrome (topbar +
// global sidebar) comes from this folder's layout.tsx via
// <TutorGlobalShell>.

import { getMyQuizzes } from '@/lib/tutor-quiz/queries';
import { QuizList } from '@/lib/tutor-quiz/quiz-list';
import { QuizzesEmpty } from '@/lib/tutor-quiz/empty-state';
import { NewQuizTrigger } from '@/lib/tutor-quiz/new-quiz-trigger';

export const dynamic = 'force-dynamic';

export default async function TutorQuizzesPage() {
  const quizzes = await getMyQuizzes();

  return (
    <div className="quizzes-page">
      <header className="quizzes-head">
        <div>
          <div className="quizzes-eyebrow">My quizzes</div>
          <h1 className="quizzes-title">Quizzes</h1>
          <p className="quizzes-sub">
            Reusable Mock &amp; Practice question sets built from your own
            bank. Publish a quiz to attach it to any programme&apos;s
            curriculum.
          </p>
        </div>
        {quizzes.length > 0 && <NewQuizTrigger variant="header" />}
      </header>

      {quizzes.length === 0 ? (
        <QuizzesEmpty />
      ) : (
        <QuizList quizzes={quizzes} />
      )}
    </div>
  );
}
