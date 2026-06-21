// mynclex/lib/tutor-quiz/activity-blocked-dialog.tsx
//
// Shared "this quiz is still linked to curriculum activities" rejection
// dialog. Two callers, same §9.3 "block, don't cascade" shape:
//   • delete (quiz-delete-section) — "Can't delete this quiz"
//   • kind switch (quiz-form-modal) — "Can't change the Kind"
// Each passes its own title + body copy; the activity list + curriculum
// links are the shared part. Presentational only — the caller owns the
// open/closed state.

'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { QuizActivityLink } from './types';

export function ActivityBlockedDialog({
  title,
  body,
  activities,
  onClose,
}: {
  title: string;
  body: ReactNode;
  activities: QuizActivityLink[];
  onClose: () => void;
}) {
  return (
    <div
      className="prog-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="confirm-dialog">
        <h2 className="confirm-dialog-title">{title}</h2>
        <p className="confirm-dialog-body">{body}</p>
        <ul className="quiz-blocking-list">
          {activities.map((a) => (
            <li key={a.activity_id} className="quiz-blocking-item">
              <Link
                href={
                  a.cohort_id
                    ? `/tutor/programme/${a.programme_id}/cohorts?cohort=${a.cohort_id}&tab=curriculum`
                    : `/tutor/programme/${a.programme_id}/curriculum`
                }
                className="quiz-blocking-link"
              >
                {a.programme_title}
                <span className="quiz-blocking-where">
                  {a.unit_title} · {a.activity_title || 'Untitled activity'}
                  {a.cohort_id && (
                    <span className="quiz-blocking-cohort">
                      {' '}
                      · Cohort-only
                      {a.cohort_name ? `: ${a.cohort_name}` : ''}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost"
            onClick={onClose}
            autoFocus
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
