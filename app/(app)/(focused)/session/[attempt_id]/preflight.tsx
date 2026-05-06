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
import { ErrorToast } from '@/lib/bank/atoms/error-toast';
import { markStartedAction } from './actions';
import type { AttemptHeader } from '@/lib/bank/runner';

const MODE_LABELS: Record<AttemptHeader['mode'], string> = {
  UNTIMED_LEARNING:  'Untimed Learning',
  UNTIMED_TEST:      'Untimed Test',
  TIMED_FREE_NAV:    'Timed · free navigation',
  TIMED_SEQUENTIAL:  'Timed · sequential',
  CAT:               'CAT',
};

const SOURCE_LABELS: Record<AttemptHeader['source'], string> = {
  CUSTOM_BUILT:       'Custom-built',
  READINESS_PACK:     'Readiness pack',
  PROGRAMME_ASSIGNED: 'Programme-assigned',
};

interface Props {
  attempt:   AttemptHeader;
  itemCount: number;
}

export function Preflight({ attempt, itemCount }: Props) {
  const router = useRouter();
  const [error, setError]     = useState<string | null>(null);
  const [pending, startTrans] = useTransition();

  const onStart = () => {
    startTrans(async () => {
      const r = await markStartedAction(attempt.attempt_id);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  };

  const onBack = () => router.push('/student/bank/practice');

  return (
    <div className="rn-preflight">
      <ErrorToast error={error} onDismiss={() => setError(null)} />

      <div className="rn-preflight-card">
        <h1 className="rn-preflight-title">Ready when you are</h1>
        <p className="rn-preflight-sub">
          You're about to start a {itemCount}-question session.
        </p>

        <dl className="rn-preflight-summary">
          <dt>Mode</dt>      <dd>{MODE_LABELS[attempt.mode]}</dd>
          <dt>Intent</dt>    <dd>{attempt.intent === 'STUDY' ? 'Study' : 'Exam'}</dd>
          <dt>Questions</dt> <dd>{itemCount}</dd>
          <dt>Source</dt>    <dd>{SOURCE_LABELS[attempt.source]}</dd>
        </dl>

        <p className="rn-preflight-note">
          In 4.1 every mode runs with per-question submit and free navigation
          (Untimed-Learning behaviour). Timer, sequential lock, and batched
          submit land with slice 4.5.
        </p>

        <div className="rn-preflight-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onBack}
            disabled={pending}
          >
            ← Back to Practice
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
