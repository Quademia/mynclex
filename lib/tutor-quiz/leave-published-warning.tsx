// mynclex/lib/tutor-quiz/leave-published-warning.tsx
//
// Shared "you're about to remove student access" confirm — shown when
// leaving Published (Unpublish, or Archive while published) on a quiz
// that's IN USE (live in programmes / linked to activities). Used by
// both the editor header controls (QuizPublishControls) and the card ⋯
// menu (QuizCardMenu). Never blocks; pulling a quiz is a legitimate
// choice — it just makes the consequence explicit.

'use client';

import type { QuizStatus } from './types';
import type { QuizUsage } from './actions';

export function LeavePublishedWarning({
  warn,
  onCancel,
  onConfirm,
  pending,
}: {
  warn: { target: QuizStatus; usage: QuizUsage };
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const verb = warn.target === 'ARCHIVED' ? 'Archive' : 'Unpublish';
  const { programmeCount, activityLinks } = warn.usage;
  const progNoun = programmeCount === 1 ? 'programme' : 'programmes';
  const actNoun = activityLinks.length === 1 ? 'activity' : 'activities';

  return (
    <div
      className="prog-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label={`${verb} this quiz?`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">{verb} this quiz?</h2>
        <p className="confirm-dialog-body">
          It&apos;s currently live in{' '}
          <strong>
            {programmeCount} {progNoun}
          </strong>
          {activityLinks.length > 0 && (
            <>
              , including{' '}
              <strong>
                {activityLinks.length} curriculum {actNoun}
              </strong>
            </>
          )}
          . Students will no longer be able to launch it until it&apos;s
          published again.
        </p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onCancel}
            disabled={pending}
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-danger"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Working…' : `${verb} anyway`}
          </button>
        </div>
      </div>
    </div>
  );
}
