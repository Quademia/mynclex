// mynclex/lib/tutor-quiz/quiz-publish-controls.tsx
//
// The quiz editor header's lifecycle controls — the prominent
// Publish / Unpublish toggle plus a quieter Archive / Restore action.
// Replaces the old 3-way Status dropdown that lived buried in the meta
// modal (one source of truth per action now).
//
// Rules:
//   • Publish (Draft → Published) is one-click, gated on ≥1 question
//     (the publish gate; button disabled with a tooltip otherwise).
//   • Leaving Published (Unpublish, or Archive while published) for a
//     quiz that's IN USE (live in programmes / linked to activities)
//     warns first — students would lose the ability to launch it.
//     Never blocks; pulling a quiz is a legitimate choice.
//   • Archiving a Draft / restoring an Archived quiz is harmless →
//     one-click, no warning (a non-published quiz has no student reach).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { LeavePublishedWarning } from './leave-published-warning';
import { quizUsageAction, setQuizStatusAction } from './actions';
import type { QuizStatus } from './types';
import type { QuizUsage } from './actions';

export function QuizPublishControls({
  quizId,
  status,
  itemCount,
}: {
  quizId: string;
  status: QuizStatus;
  itemCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The in-use warning, when leaving Published. Holds the target status
  // and the usage snapshot to render the consequence.
  const [warn, setWarn] = useState<{
    target: QuizStatus;
    usage: QuizUsage;
  } | null>(null);

  const canPublish = itemCount > 0;

  function applyStatus(target: QuizStatus) {
    setWarn(null);
    startTransition(async () => {
      const result = await setQuizStatusAction(quizId, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // Leaving Published (unpublish / archive-while-published): check
  // usage first; warn if the quiz currently reaches students.
  function requestLeavePublished(target: QuizStatus) {
    startTransition(async () => {
      const result = await quizUsageAction(quizId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { usage } = result;
      const inUse =
        usage.programmeCount > 0 || usage.activityLinks.length > 0;
      if (inUse) {
        setWarn({ target, usage });
      } else {
        applyStatus(target);
      }
    });
  }

  return (
    <>
      <div className="quiz-status-controls">
        {status === 'DRAFT' && (
          <>
            <button
              type="button"
              className="quiz-btn quiz-btn-ghost"
              onClick={() => applyStatus('ARCHIVED')}
              disabled={isPending}
            >
              Archive
            </button>
            <button
              type="button"
              className="quiz-btn quiz-btn-primary"
              onClick={() => applyStatus('PUBLISHED')}
              disabled={isPending || !canPublish}
              title={
                canPublish
                  ? undefined
                  : 'Add at least one question before publishing.'
              }
            >
              {isPending ? 'Working…' : 'Publish'}
            </button>
          </>
        )}

        {status === 'PUBLISHED' && (
          <>
            <span className="quiz-published-flag" aria-hidden="true">
              ● Published
            </span>
            <button
              type="button"
              className="quiz-btn quiz-btn-ghost"
              onClick={() => requestLeavePublished('ARCHIVED')}
              disabled={isPending}
            >
              Archive
            </button>
            <button
              type="button"
              className="quiz-btn quiz-btn-ghost"
              onClick={() => requestLeavePublished('DRAFT')}
              disabled={isPending}
            >
              {isPending ? 'Working…' : 'Unpublish'}
            </button>
          </>
        )}

        {status === 'ARCHIVED' && (
          <button
            type="button"
            className="quiz-btn quiz-btn-ghost"
            onClick={() => applyStatus('DRAFT')}
            disabled={isPending}
          >
            {isPending ? 'Working…' : 'Restore to draft'}
          </button>
        )}
      </div>

      {warn && <LeavePublishedWarning warn={warn} onCancel={() => setWarn(null)} onConfirm={() => applyStatus(warn.target)} pending={isPending} />}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}

// LeavePublishedWarning moved to ./leave-published-warning (shared with
// the card ⋯ menu).
