// mynclex/lib/tutor-quiz/edit-quiz-trigger.tsx
//
// Client wrapper that puts the quiz meta-edit modal on a /tutor/quizzes
// card. Mirrors NewQuizTrigger (create) — owns the open/closed state and
// mounts the SHARED <QuizFormModal mode="edit"> untouched. Rendered as a
// sibling of the card's <Link> (a button can't live inside an anchor),
// so the pencil opens the modal instead of navigating into the editor.
//
// All the modal's edit inputs already live on the list row
// (QuizListRow), so the pencil opens the meta form with no extra fetch.
// Publishing itself lives on the editor header, not this modal.

'use client';

import { useState } from 'react';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import { QuizFormModal } from './quiz-form-modal';
import type { QuizFormValues, QuizListRow } from './types';

export function EditQuizTrigger({ quiz }: { quiz: QuizListRow }) {
  const [isOpen, setIsOpen] = useState(false);

  const initial: QuizFormValues = {
    title: quiz.title,
    description: quiz.description,
    quiz_kind: quiz.quiz_kind,
    mode: quiz.mode,
    duration_seconds: quiz.duration_seconds,
    pass_score: quiz.pass_score,
    max_attempts: quiz.max_attempts,
    status: quiz.status,
  };

  return (
    <>
      <button
        type="button"
        className="quiz-card-edit"
        aria-label="Edit quiz details"
        title="Edit details"
        onClick={(e) => {
          // The button sits over the card link — keep the click from
          // bubbling to the surrounding anchor / navigating away.
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
      >
        <NavIcon name="edit" />
      </button>
      {isOpen && (
        <QuizFormModal
          mode="edit"
          quizId={quiz.quiz_id}
          initial={initial}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
