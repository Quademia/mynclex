// mynclex/lib/curriculum/quiz-launch-viewer.tsx
//
// Tutor-Quiz slice 3 — the student's launch surface for Mock /
// Practice quiz activities. Modal in the per-type viewer family
// (slices 10.2–10.5), shares <ViewerModalShell> with External link,
// Live session, PDF, and Text reading.
//
// Visual treatment is the same as the other viewers per Q5
// (settled 2026-05-17): stakes communicated by content, not chrome.
// Narrow variant of the shell; quiz title in the header; body
// renders quiz metadata + one primary action button at the foot.
//
// Three render states, derived from getQuizLaunchContext:
//   • in_progress_attempt_id present → "Resume" — navigates
//     directly to the existing attempt with no RPC call.
//   • attempts remaining (or unlimited) → "Start" — calls
//     startProgrammeQuizAction → navigates to the new attempt.
//   • exhausted (attempts_remaining = 0, no in-progress) → no
//     button; just the "No attempts remaining" line.
//
// Unlike the other viewers (pure prop renderers from a static
// activity), this one needs per-student data (attempts taken /
// remaining, in-progress lookup). Fetched via a server action on
// mount; brief loading state covers the round trip. Sub-100ms in
// practice so the loading flash is imperceptible.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ViewerModalShell } from './viewer-modal-shell';
import {
  getQuizLaunchContext,
  startProgrammeQuizAction,
  type QuizLaunchContext,
} from './quiz-launch';
import {
  formatDuration,
  formatItemCount,
  formatPassScore,
  formatQuizMode,
} from '@/lib/tutor-quiz/format';

// Exported as of Tutor Quiz Slice 6 so the standalone viewer
// (lib/curriculum/standalone-quiz-launch-viewer.tsx) can reuse the
// same body + actions cadence without duplicating the formatter.
export function formatAttemptsLine(ctx: QuizLaunchContext): string {
  const { attempts_taken, attempts_remaining, in_progress_attempt_id } = ctx;
  // Unlimited
  if (attempts_remaining === null) {
    if (in_progress_attempt_id) return 'In progress · unlimited attempts';
    if (attempts_taken === 0) return 'Unlimited attempts';
    return `${attempts_taken} taken · unlimited attempts`;
  }
  const total = ctx.quiz.max_attempts;
  // Exhausted
  if (attempts_remaining === 0 && !in_progress_attempt_id) {
    return 'No attempts remaining';
  }
  // Resume scenario — the in-progress attempt counts as the
  // current one
  const currentN = attempts_taken + 1;
  if (in_progress_attempt_id) {
    return `Attempt ${currentN} of ${total} · in progress`;
  }
  // Fresh start scenario — the next attempt is attempts_taken + 1
  return `Attempt ${currentN} of ${total}`;
}

/**
 * Activity-linked quiz launch surface. Tutor Quiz Slice 6 narrowed
 * the prop type from `ProgrammeActivity` to a focused shape — the
 * viewer only needs four fields, so callers don't need a full
 * activity row. Slice 6 row launches construct this shape from the
 * row's primary_activity_id + title; the Slice 3 curriculum
 * launcher (lib/curriculum/activity-action.tsx) passes its full
 * ProgrammeActivity (structurally compatible).
 */
export type QuizLaunchTarget = {
  activity_id: string;
  title: string;
  description: string | null;
  note: string | null;
};

export function QuizLaunchViewer({
  target,
  onClose,
}: {
  target: QuizLaunchTarget;
  onClose: () => void;
}) {
  const activity = target;
  const router = useRouter();
  const [ctx, setCtx] = useState<QuizLaunchContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Fetch on mount. Sub-100ms in practice; the brief loading line
  // covers slower devices / cold connections.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getQuizLaunchContext(activity.activity_id);
      if (cancelled) return;
      if (r.ok) setCtx(r.context);
      else setLoadError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [activity.activity_id]);

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
      const r = await startProgrammeQuizAction(activity.activity_id);
      if (r.ok) {
        goToAttempt(r.attempt_id);
      } else {
        setActionError(r.error);
      }
    });
  };

  return (
    <ViewerModalShell title={activity.title} onClose={onClose}>
      <div className="viewer-modal-content">
        {activity.description && (
          <p className="viewer-modal-desc">{activity.description}</p>
        )}
        {activity.note && (
          <p className="viewer-modal-note">
            <strong>Note:</strong> {activity.note}
          </p>
        )}

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
          />
        )}
      </div>
    </ViewerModalShell>
  );
}

// Exported as of Tutor Quiz Slice 6 (see formatAttemptsLine note).
export function QuizLaunchBody({ ctx }: { ctx: QuizLaunchContext }) {
  const durationLabel = formatDuration(ctx.quiz.duration_seconds);
  const passLabel = formatPassScore(ctx.quiz.pass_score);

  return (
    <div className="quiz-launch-meta">
      <p className="quiz-launch-mode">{formatQuizMode(ctx.quiz.mode)}</p>

      <dl className="quiz-launch-facts">
        <div>
          <dt>Questions</dt>
          <dd>{formatItemCount(ctx.quiz.question_count)}</dd>
        </div>
        {durationLabel && (
          <div>
            <dt>Duration</dt>
            <dd>{durationLabel}</dd>
          </div>
        )}
        {passLabel && (
          <div>
            <dt>Pass mark</dt>
            <dd>{passLabel}</dd>
          </div>
        )}
        <div>
          <dt>Attempts</dt>
          <dd>{formatAttemptsLine(ctx)}</dd>
        </div>
      </dl>
    </div>
  );
}

// Exported as of Tutor Quiz Slice 6. `startLabel` opt-in so the
// standalone viewer can render "Take again" on a re-take instead
// of the activity-default "Start quiz". Defaults preserve the
// existing activity-linked behaviour.
export function QuizLaunchActions({
  ctx,
  pending,
  onStart,
  onResume,
  startLabel = 'Start quiz',
}: {
  ctx: QuizLaunchContext;
  pending: boolean;
  onStart: () => void;
  onResume: () => void;
  startLabel?: string;
}) {
  // Resume takes precedence over Start. Either is gated by the
  // same `pending` flag while the action is in flight.
  if (ctx.in_progress_attempt_id) {
    return (
      <button
        type="button"
        className="viewer-modal-cta quiz-launch-cta"
        onClick={onResume}
        disabled={pending}
      >
        Resume attempt
      </button>
    );
  }

  // Exhausted — no button, message-only.
  if (ctx.attempts_remaining === 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="viewer-modal-cta quiz-launch-cta"
      onClick={onStart}
      disabled={pending}
    >
      {pending ? 'Starting…' : startLabel}
    </button>
  );
}
