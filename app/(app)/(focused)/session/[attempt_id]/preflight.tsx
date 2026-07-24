// mynclex/app/(app)/(focused)/session/[attempt_id]/preflight.tsx
//
// Pre-Q1 confirmation screen. Shown when attempt.started_at is NULL —
// the runner gate in runner.tsx evaluates that and renders <Preflight>
// instead of the runner chrome.
//
// "Start session" calls nclex_mark_attempt_started (slice 2.2b), then
// router.refresh() so the page re-renders with started_at populated and
// the gate evaluates false → runner mounts.
//
// Localstorage "skip preflight next time" flag is deferred (slice 4.6 /
// the wider preflight polish work). For 4.1 every fresh attempt sees
// the preflight at least once.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { markStartedAction, startReadinessAttemptAction } from './actions';
import type { AttemptHeader } from '@/lib/practice/runner';
import { exitBackLabel } from '@/lib/practice/runner/resolve-exit-href';
import { modeLabelFor } from '@/lib/practice/builder/filter-config';
import { preflightBrief } from '@/lib/practice/runner/mode-brief';

// Mode labels resolve through modeLabelFor(intent, mode) — see the note on
// that helper. This file used to keep its own hardcoded map, which could not
// express TIMED_FREE_NAV being named differently under each intent.

const SOURCE_LABELS: Record<AttemptHeader['source'], string> = {
  CUSTOM_BUILT:       'Custom-built',
  READINESS_PACK:     'Readiness pack',
  PROGRAMME_ASSIGNED: 'Programme-assigned',
};

interface Props {
  attempt:   AttemptHeader;
  itemCount: number;
  /** Slice 3a — source-aware destination resolved server-side. Same
   *  href used by the runner topbar's ← Exit and the results popup. */
  exitHref:  string;
}

function durationStr(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h}h ${mm}m`;
  if (h) return `${h}h`;
  return `${mm}m`;
}

export function Preflight({ attempt, itemCount, exitHref }: Props) {
  const router = useRouter();
  const [error, setError]     = useState<string | null>(null);
  const [pending, startTrans] = useTransition();

  const isReadiness = attempt.source === 'READINESS_PACK';

  const onStart = () => {
    startTrans(async () => {
      const r = isReadiness
        ? await startReadinessAttemptAction(attempt.attempt_id)
        : await markStartedAction(attempt.attempt_id);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  };

  const onBack = () => router.push(exitHref);

  // Readiness packs get a full-stop, one-shot preflight (§2 / §7) — the
  // heaviest of the three gates. Pressing Start here spends the credit.
  if (isReadiness) {
    return (
      <ReadinessPreflight
        itemCount={itemCount}
        duration={durationStr(attempt.duration_seconds)}
        pending={pending}
        error={error}
        onDismissError={() => setError(null)}
        onStart={onStart}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="rn-preflight">
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      <div className="rn-preflight-card">
        <h1 className="rn-preflight-title">Ready when you are</h1>
        <p className="rn-preflight-sub">
          You&apos;re about to start a {itemCount}-question session.
        </p>

        <dl className="rn-preflight-summary">
          <dt>Mode</dt>      <dd>{modeLabelFor(attempt.intent, attempt.mode)}</dd>
          <dt>Intent</dt>    <dd>{attempt.intent === 'STUDY' ? 'Study' : 'Exam'}</dd>
          <dt>Questions</dt> <dd>{itemCount}</dd>
          <dt>Source</dt>    <dd>{SOURCE_LABELS[attempt.source]}</dd>
        </dl>

        {/* Was a build note ("In 4.1 every mode runs with per-question submit
            ... land with slice 4.5") — internal slice jargon shown to a
            student, and false since 4.5 shipped. Now the real behaviour of
            the mode they are about to start, from the one shared source. */}
        <p className="rn-preflight-note">
          {preflightBrief(attempt.intent, attempt.mode, attempt.duration_seconds)}
        </p>

        <div className="rn-preflight-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            disabled={pending}
          >
            {exitBackLabel(attempt.source, attempt.mode)}
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={onStart}
            disabled={pending}
          >
            {pending ? 'Starting…' : 'Start session →'}
          </button>
        </div>
      </div>
    </div>
  );
}


// The readiness pack full-stop preflight. Deliberately heavier than the
// generic one: it names the irreversible facts (one shot, no reset, timer
// can't pause, quitting scores as-is) before the student can commit, because
// pressing Start spends a paid credit and closes the pack forever (§2).
function ReadinessPreflight({
  itemCount,
  duration,
  pending,
  error,
  onDismissError,
  onStart,
  onBack,
}: {
  itemCount: number;
  duration: string;
  pending: boolean;
  error: string | null;
  onDismissError: () => void;
  onStart: () => void;
  onBack: () => void;
}) {
  return (
    <div className="rn-preflight">
      <ErrorToast error={error} onDismiss={onDismissError} />

      <div className="rn-preflight-card rn-preflight-oneshot">
        <div className="rn-oneshot-flag">Your one shot</div>
        <h1 className="rn-preflight-title">This is your one attempt</h1>
        <p className="rn-preflight-sub">
          You&apos;re about to sit a {itemCount}-question readiness exam
          {duration ? `, with ${duration} on the clock` : ''}. Read this before you begin.
        </p>

        <ul className="rn-oneshot-list">
          <li>
            <strong>One shot — no retakes, no resets.</strong> Once you start, this pack is
            closed to you for good, whatever your score.
          </li>
          <li>
            <strong>The timer runs to the end and can&apos;t be paused.</strong> Leaving
            mid-exam ends it and scores what you&apos;ve answered — unanswered questions
            count as zero.
          </li>
          <li>
            <strong>A dropped connection won&apos;t end it.</strong> You can come back and
            keep going while the clock is still running — but the clock never stops.
          </li>
          <li>
            <strong>Questions can&apos;t be revisited.</strong> This is a timed, sequential
            exam — you move forward through it, exam-style.
          </li>
        </ul>

        <div className="rn-preflight-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            disabled={pending}
          >
            Not yet — back to my packs
          </button>
          <button
            type="button"
            className="btn rn-oneshot-start"
            onClick={onStart}
            disabled={pending}
          >
            {pending ? 'Starting…' : 'Start my one attempt →'}
          </button>
        </div>
      </div>
    </div>
  );
}
