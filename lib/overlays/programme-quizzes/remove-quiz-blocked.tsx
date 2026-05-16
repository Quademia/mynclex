// mynclex/lib/overlays/programme-quizzes/remove-quiz-blocked.tsx
//
// Blocked-remove rejection (Tutor Quiz Slice 5, §9.3). Surfaces
// when the tutor tries to remove a quiz that's still linked to
// one or more activities in this programme. Per spec §9.3 the
// copy is verbatim; the tutor's next step is Curriculum, where
// they unlink, then come back here to retry.
//
// Stripped to the minimum the spec called for — no deep-link
// activity list (that was prototype-only). One CTA: "Go to
// Curriculum". Cancel returns to the list.

'use client';

import Link from 'next/link';
import type {
  BlockingActivity,
  ProgrammeQuizRow,
} from '@/lib/programme-quizzes/types';

interface RemoveQuizBlockedProps {
  quiz: ProgrammeQuizRow;
  programmeId: string;
  activities: BlockingActivity[];
  onClose: () => void;
}

export function RemoveQuizBlocked({
  quiz,
  programmeId,
  activities,
  onClose,
}: RemoveQuizBlockedProps) {
  const n = activities.length;
  const noun = n === 1 ? 'activity' : 'activities';

  return (
    <div
      className="prog-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label="Can't remove this quiz"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">Can&apos;t remove this quiz</h2>
        <p className="confirm-dialog-body">
          This quiz is linked to {n} {noun} in this programme. Unlink
          it from those activities first.
        </p>
        <p className="confirm-dialog-body pq-confirm-body-soft">
          <strong>{quiz.title}</strong> is in use in the curriculum.
          Open Curriculum and switch each linked activity to a
          different quiz (or leave its quiz field empty), then come
          back here to remove it.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onClose}
            autoFocus
          >
            Cancel
          </button>
          <Link
            href={`/tutor/programme/${programmeId}/curriculum`}
            className="prog-btn prog-btn-primary"
          >
            Go to Curriculum
          </Link>
        </div>
      </div>
    </div>
  );
}
