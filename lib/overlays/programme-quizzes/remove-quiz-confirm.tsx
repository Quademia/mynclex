// mynclex/lib/overlays/programme-quizzes/remove-quiz-confirm.tsx
//
// Happy-path "remove from programme" confirm (Tutor Quiz Slice 5,
// §9.3). Recoverable action — the quiz stays in the tutor's
// library, can be re-attached, past attempts are unaffected — so
// a simple red Remove + Cancel pair, not a type-to-confirm gate
// (mirrors the curriculum DeleteActivityConfirm precedent).

'use client';

import type { ProgrammeQuizRow } from '@/lib/programme-quizzes/types';

interface RemoveQuizConfirmProps {
  quiz: ProgrammeQuizRow;
  programmeTitle: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RemoveQuizConfirm({
  quiz,
  programmeTitle,
  pending,
  onCancel,
  onConfirm,
}: RemoveQuizConfirmProps) {
  return (
    <div
      className="prog-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Remove quiz from programme"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">Remove from programme?</h2>
        <p className="confirm-dialog-body">
          <strong>{quiz.title}</strong> will be detached from{' '}
          <strong>{programmeTitle}</strong>. Students will no longer
          see it on the programme&apos;s Quizzes page.
        </p>
        <p className="confirm-dialog-body pq-confirm-body-soft">
          The quiz itself stays in your library — you can re-attach it
          later. Past attempts are unaffected.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Keep attached
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Removing…' : 'Remove from programme'}
          </button>
        </div>
      </div>
    </div>
  );
}
