// mynclex/lib/tutor-quiz/quiz-list.tsx
//
// Client component — owns the "Show archived (N)" toggle. Splits the
// server-supplied quizzes into an active bank (DRAFT + PUBLISHED) and
// a hidden bank (ARCHIVED). Mirrors lib/programmes/programme-list.tsx.

'use client';

import { useMemo, useState } from 'react';
import { QuizCard } from './quiz-card';
import type { QuizListRow } from './types';

export function QuizList({ quizzes }: { quizzes: QuizListRow[] }) {
  const [showArchived, setShowArchived] = useState(false);

  const { active, hidden } = useMemo(() => {
    const active: QuizListRow[] = [];
    const hidden: QuizListRow[] = [];
    for (const q of quizzes) {
      if (q.status === 'ARCHIVED') hidden.push(q);
      else active.push(q);
    }
    return { active, hidden };
  }, [quizzes]);

  return (
    <>
      <div className="quizzes-grid">
        {active.map((q) => (
          <QuizCard key={q.quiz_id} quiz={q} />
        ))}
      </div>

      {hidden.length > 0 && (
        <>
          <button
            type="button"
            className="quizzes-archived-toggle"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived
              ? `Hide archived (${hidden.length})`
              : `Show archived (${hidden.length})`}
          </button>

          {showArchived && (
            <div className="quizzes-grid is-archived-bank">
              {hidden.map((q) => (
                <QuizCard key={q.quiz_id} quiz={q} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
