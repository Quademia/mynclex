// mynclex/app/(app)/(focused)/session/[attempt_id]/session-stub.tsx
//
// Client component for the stub page. Holds the Discard handler and
// surfaces errors via the existing ErrorToast. When 4.1 (runner shell)
// lands, the parent page replaces this stub with the real runner.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/bank/atoms/error-toast';
import { discardAttemptAction } from '@/lib/bank/builder/actions';

interface Attempt {
  attempt_id: string;
  status: string;
  intent: string;
  mode: string;
  requested_question_count: number;
  actual_question_count: number;
  actual_unit_count: number;
  started_at: string | null;
  created_at: string;
}

interface Props {
  attempt: Attempt;
  itemCount: number;
}

export function SessionStub({ attempt, itemCount }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onDiscard = () => {
    if (!confirm('Discard this attempt? The snapshot rows will be deleted.')) return;
    start(async () => {
      const res = await discardAttemptAction(attempt.attempt_id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/student/bank/practice');
    });
  };

  return (
    <div className="bk-stub">
      <ErrorToast error={error} onDismiss={() => setError(null)} />
      <h1>Quiz built — runner coming next slice</h1>
      <p>
        The attempt was created and the question snapshots are in the database.
        Slice 4.1 will replace this stub with the actual runner (preflight, Q1, submit, review).
        For now, you can verify the row materialised below or discard it.
      </p>
      <div className="bk-stub-meta">
        <div><strong>attempt_id:</strong> {attempt.attempt_id}</div>
        <div><strong>status:</strong> {attempt.status}</div>
        <div><strong>intent · mode:</strong> {attempt.intent} · {attempt.mode}</div>
        <div>
          <strong>questions:</strong> {attempt.actual_question_count} delivered
          {' '}of {attempt.requested_question_count} requested
          {' '}({attempt.actual_unit_count} units, {itemCount} item rows)
        </div>
        <div><strong>started_at:</strong> {attempt.started_at ?? '— (preflight not confirmed)'}</div>
      </div>
      <div className="bk-stub-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => router.push('/student/bank/practice')}
        >
          ← Back to Practice
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={pending}
          onClick={onDiscard}
        >
          {pending ? 'Discarding…' : 'Discard attempt'}
        </button>
      </div>
    </div>
  );
}
