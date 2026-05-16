// mynclex/lib/curriculum/standalone-quiz-launch-viewer.tsx
//
// Student launch surface for STANDALONE programme quizzes (Tutor
// Quiz Slice 6). Sibling to `<QuizLaunchViewer>` — same modal
// shell, same body, same actions; the only differences are:
//   • Context source: getStandaloneQuizLaunchContext takes
//     (programmeId, quizId) instead of activityId.
//   • Start action: startStandaloneQuizAttemptAction wraps the
//     new RPC nclex_create_standalone_quiz_attempt.
//   • The modal title comes from the quiz itself (the activity-
//     linked viewer pulls it from the parent activity row).
//   • No description / note — standalone has no activity to
//     carry tutor-authored copy.
//
// Activity-linked rows on the Slice 6 page route to the EXISTING
// <QuizLaunchViewer> via the row's resolved primary_activity_id —
// this viewer is for standalone-only rows.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ViewerModalShell } from './viewer-modal-shell';
import {
  getStandaloneQuizLaunchContext,
  startStandaloneQuizAttemptAction,
} from './standalone-quiz-launch';
import type { QuizLaunchContext } from './quiz-launch';
import { QuizLaunchBody, QuizLaunchActions } from './quiz-launch-viewer';

export function StandaloneQuizLaunchViewer({
  programmeId,
  quizId,
  fallbackTitle,
  isRetake,
  onClose,
}: {
  programmeId: string;
  quizId: string;
  /** Title to show while the context is loading. */
  fallbackTitle: string;
  /** Flip the Start label to "Take again" — used when the row
   *  state is DONE and the student has attempts remaining. */
  isRetake: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [ctx, setCtx] = useState<QuizLaunchContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getStandaloneQuizLaunchContext(programmeId, quizId);
      if (cancelled) return;
      if (r.ok) setCtx(r.context);
      else setLoadError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [programmeId, quizId]);

  const goToAttempt = (attemptId: string) => {
    router.push(`/session/${attemptId}`);
  };

  const onResume = () => {
    if (!ctx?.in_progress_attempt_id) return;
    goToAttempt(ctx.in_progress_attempt_id);
  };

  const onStart = () => {
    setActionError(null);
    startTransition(async () => {
      const r = await startStandaloneQuizAttemptAction(programmeId, quizId);
      if (r.ok) {
        goToAttempt(r.attempt_id);
      } else {
        setActionError(r.error);
      }
    });
  };

  // Title prefers the resolved quiz title; fallback covers the
  // ~sub-100ms gap before the context resolves.
  const title = ctx?.quiz.title ?? fallbackTitle;

  return (
    <ViewerModalShell title={title} onClose={onClose}>
      <div className="viewer-modal-content">
        {loadError && (
          <p className="viewer-modal-broken">{loadError}</p>
        )}

        {!ctx && !loadError && (
          <p className="quiz-launch-loading">Loading quiz…</p>
        )}

        {ctx && <QuizLaunchBody ctx={ctx} />}

        {actionError && (
          <p className="viewer-modal-broken">{actionError}</p>
        )}

        {ctx && (
          <QuizLaunchActions
            ctx={ctx}
            pending={pending}
            onStart={onStart}
            onResume={onResume}
            startLabel={isRetake ? 'Take again' : 'Start quiz'}
          />
        )}
      </div>
    </ViewerModalShell>
  );
}
