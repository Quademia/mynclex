// mynclex/lib/student-quizzes/quiz-row.tsx
//
// One row on the student Quizzes page. Title + action button both
// mount the same launch modal (the view component routes between
// the activity-linked viewer and the standalone viewer based on
// the row's primary_activity_id). Status pill reuses the existing
// .student-activity-state class cadence (slice 9.3e + progress
// engine slice 2). Kind pill reuses the shared .quiz-pill-kind-*
// class hoisted from Slice 5.

'use client';

import {
  formatQuizKind,
  formatQuizMode,
  formatItemCount,
  formatDuration,
  formatPassScore,
} from '@/lib/tutor-quiz/format';
import {
  formatStudentAttemptCounter,
  getStudentRowAction,
  getStudentStatePillCopy,
} from './format';
import { StudentSourceHint } from './source-hint';
import type { StudentQuizRow } from './types';

export function StudentQuizRowView({
  row,
  hasAnyDone,
  onLaunch,
}: {
  row: StudentQuizRow;
  hasAnyDone: boolean;
  onLaunch: (row: StudentQuizRow) => void;
}) {
  const action = getStudentRowAction(row);
  const pill = getStudentStatePillCopy(row.state, hasAnyDone);
  const duration = formatDuration(row.duration_seconds);
  const pass = formatPassScore(row.pass_score);
  const counter = formatStudentAttemptCounter(row);

  const isExhausted = action.kind === 'exhausted';
  const rowCls =
    `sq-row ${isExhausted ? 'is-exhausted' : ''} ${row.state === 'DONE' ? 'is-done' : ''}`.trim();

  return (
    <article className={rowCls}>
      <div className="sq-row-body">
        <div className="sq-row-title-line">
          <button
            type="button"
            className="sq-row-link"
            onClick={() => onLaunch(row)}
            disabled={isExhausted}
          >
            <h3 className="sq-row-title">{row.title}</h3>
          </button>
          <span
            className={`quiz-pill-kind quiz-pill-kind-${row.quiz_kind.toLowerCase()}`}
          >
            {formatQuizKind(row.quiz_kind)}
          </span>
        </div>

        <div className="sq-row-meta">
          <span>{formatQuizMode(row.quiz_kind, row.mode)}</span>
          <span className="sq-row-meta-sep" aria-hidden="true">·</span>
          <span>{formatItemCount(row.item_count)}</span>
          {duration && (
            <>
              <span className="sq-row-meta-sep" aria-hidden="true">·</span>
              <span>{duration}</span>
            </>
          )}
          <span className="sq-row-meta-sep" aria-hidden="true">·</span>
          <span
            className={`sq-row-attempt ${isExhausted ? 'is-exhausted' : ''}`}
          >
            {counter}
          </span>
          {pass && (
            <>
              <span className="sq-row-meta-sep" aria-hidden="true">·</span>
              <span className="sq-row-pass">Pass: {pass}</span>
            </>
          )}
        </div>

        <StudentSourceHint hint={row.source_hint} />
      </div>

      <div className="sq-row-right">
        {pill && (
          <span
            className={`student-activity-state ${pill.className}`}
          >
            {pill.icon && (
              <span
                className="student-activity-state-icon"
                aria-hidden="true"
              >
                {pill.icon}
              </span>
            )}
            {pill.dot && (
              <span
                className="student-activity-state-dot"
                aria-hidden="true"
              />
            )}
            <span className="student-activity-state-label">
              {pill.label}
            </span>
          </span>
        )}
        <button
          type="button"
          className={`sq-action sq-action-${action.kind}`}
          disabled={isExhausted}
          onClick={() => onLaunch(row)}
          aria-label={`${action.label}: ${row.title}`}
        >
          {action.label}
        </button>
      </div>
    </article>
  );
}
