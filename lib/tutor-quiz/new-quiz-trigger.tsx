// mynclex/lib/tutor-quiz/new-quiz-trigger.tsx
//
// Client wrapper that owns the modal-open state for the create flow.
// Renders the "+ New quiz" button and conditionally mounts
// <QuizFormModal mode="create">. Two visual variants — 'header' on
// the list's top-right, 'empty' as the empty-state CTA.

'use client';

import { useState } from 'react';
import { QuizFormModal } from './quiz-form-modal';

interface NewQuizTriggerProps {
  variant?: 'header' | 'empty';
}

export function NewQuizTrigger({ variant = 'header' }: NewQuizTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const buttonClass =
    variant === 'header' ? 'quizzes-new-btn' : 'quizzes-empty-cta';
  const buttonLabel =
    variant === 'header' ? '+ New quiz' : '+ Create your first quiz';

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => setIsOpen(true)}
      >
        {buttonLabel}
      </button>
      {isOpen && (
        <QuizFormModal mode="create" onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
