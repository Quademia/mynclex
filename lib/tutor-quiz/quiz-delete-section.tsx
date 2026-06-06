// mynclex/lib/tutor-quiz/quiz-delete-section.tsx
//
// The "Delete quiz" danger zone rendered at the foot of the shared
// QuizFormModal (edit mode only). Because the card pencil and the
// editor both open that same modal, this one section gives a delete
// affordance on BOTH surfaces with no extra plumbing.
//
// Flow (block, don't cascade — §9.3 applied quiz-wide):
//   1. Click Delete → quizDeletePreflightAction.
//   2. Still linked to curriculum activities → the BLOCKED dialog
//      (list each placement; the tutor unlinks from Curriculum first).
//   3. Clear → the type-to-confirm dialog (reuses the shared
//      DeleteConfirm atom) with a "results are kept" reassurance line.
//   4. Confirm → deleteQuizAction → land back on /tutor/quizzes.

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DeleteConfirm } from '@/lib/overlays/bank/delete-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { deleteQuizAction, quizDeletePreflightAction } from './actions';
import type { QuizActivityLink } from './types';

type Phase = 'idle' | 'blocked' | 'confirm';

export function QuizDeleteSection({
  quizId,
  quizTitle,
}: {
  quizId: string;
  quizTitle: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>('idle');
  const [blocking, setBlocking] = useState<QuizActivityLink[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [deleteText, setDeleteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function startDelete() {
    startTransition(async () => {
      const result = await quizDeletePreflightAction(quizId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.blockingActivities.length > 0) {
        setBlocking(result.blockingActivities);
        setPhase('blocked');
      } else {
        setAttemptCount(result.attemptCount);
        setDeleteText('');
        setPhase('confirm');
      }
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteQuizAction(quizId);
      if (!result.ok) {
        // A race could surface fresh activity links — fall back to the
        // blocked dialog if so, else a toast.
        if (result.blockingActivities && result.blockingActivities.length) {
          setBlocking(result.blockingActivities);
          setPhase('blocked');
        } else {
          setError(result.error);
          setPhase('idle');
        }
        return;
      }
      router.push('/tutor/quizzes');
      router.refresh();
    });
  }

  const attemptNote =
    attemptCount > 0 ? (
      <>
        <strong>
          {attemptCount} student attempt{attemptCount === 1 ? '' : 's'}
        </strong>{' '}
        recorded — their results and history are kept. The quiz is removed
        from your library and any programmes it&apos;s in.
      </>
    ) : (
      <>
        No student attempts recorded yet. The quiz is removed from your
        library and any programmes it&apos;s in.
      </>
    );

  return (
    <section className="quiz-danger-zone">
      <div className="quiz-danger-row">
        <div>
          <h3 className="quiz-danger-title">Delete this quiz</h3>
          <p className="quiz-danger-help">
            Permanent. Past student results are kept; the quiz is removed
            from your library and any programmes.
          </p>
        </div>
        <button
          type="button"
          className="quiz-btn quiz-btn-danger"
          onClick={startDelete}
          disabled={isPending}
        >
          {isPending && phase === 'idle' ? 'Checking…' : 'Delete quiz'}
        </button>
      </div>

      {/* Blocked — still linked to one or more curriculum activities. */}
      {phase === 'blocked' && (
        <div
          className="prog-modal-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-label="Can't delete this quiz"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhase('idle');
          }}
        >
          <div className="confirm-dialog">
            <h2 className="confirm-dialog-title">Can&apos;t delete this quiz</h2>
            <p className="confirm-dialog-body">
              <strong>{quizTitle}</strong> is still linked to{' '}
              {blocking.length}{' '}
              {blocking.length === 1 ? 'activity' : 'activities'} in your
              curriculum. Unlink it from {blocking.length === 1 ? 'that' : 'those'}{' '}
              first, then delete.
            </p>
            <ul className="quiz-blocking-list">
              {blocking.map((a) => (
                <li key={a.activity_id} className="quiz-blocking-item">
                  <Link
                    href={`/tutor/programme/${a.programme_id}/curriculum`}
                    className="quiz-blocking-link"
                  >
                    {a.programme_title}
                    <span className="quiz-blocking-where">
                      {a.unit_title} · {a.activity_title || 'Untitled activity'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="prog-btn prog-btn-ghost"
                onClick={() => setPhase('idle')}
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear — type-to-confirm. */}
      {phase === 'confirm' && (
        <DeleteConfirm
          itemId={quizTitle}
          deleteText={deleteText}
          pending={isPending}
          note={attemptNote}
          onTextChange={setDeleteText}
          onCancel={() => setPhase('idle')}
          onConfirm={confirmDelete}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </section>
  );
}
