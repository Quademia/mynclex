// mynclex/lib/tutor-quiz/quiz-card-menu.tsx
//
// The card-corner ⋯ menu on /tutor/quizzes (2026-06 Claude Design "Quiz
// UI Uplift"). Replaces the single edit pencil with the full lifecycle
// at the list level — Edit details · Publish/Unpublish · Archive/Restore
// · Delete — without entering the editor. Pure COMPOSITION: every action
// + dialog already exists; this wires them to a dropdown.
//   • Edit         → the shared QuizFormModal (edit mode).
//   • Publish      → setQuizStatusAction (the ≥1-question gate applies;
//                    its error surfaces as a toast).
//   • Unpublish /
//     Archive-while-published → LeavePublishedWarning if the quiz is in
//                    use, then setQuizStatusAction. Never blocks.
//   • Archive (draft) / Restore → setQuizStatusAction, one click.
//   • Delete       → quizDeletePreflightAction → blocked dialog OR
//                    type-to-confirm (DeleteConfirm) → deleteQuizAction.
//
// Lives as a sibling of the card's <Link> (a button can't nest in an
// anchor); clicks stop propagation so the card doesn't navigate.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DeleteConfirm } from '@/lib/overlays/bank/delete-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { QuizIcon } from './quiz-icons';
import { QuizFormModal } from './quiz-form-modal';
import { ActivityBlockedDialog } from './activity-blocked-dialog';
import { LeavePublishedWarning } from './leave-published-warning';
import {
  deleteQuizAction,
  quizDeletePreflightAction,
  quizUsageAction,
  setQuizStatusAction,
} from './actions';
import type { QuizUsage } from './actions';
import type {
  QuizActivityLink,
  QuizFormValues,
  QuizListRow,
  QuizStatus,
} from './types';

type DeletePhase = 'idle' | 'blocked' | 'confirm';

export function QuizCardMenu({ quiz }: { quiz: QuizListRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<{
    target: QuizStatus;
    usage: QuizUsage;
  } | null>(null);
  const [deletePhase, setDeletePhase] = useState<DeletePhase>('idle');
  const [blocking, setBlocking] = useState<QuizActivityLink[]>([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [deleteText, setDeleteText] = useState('');

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const editInitial: QuizFormValues = {
    title: quiz.title,
    description: quiz.description,
    quiz_kind: quiz.quiz_kind,
    mode: quiz.mode,
    duration_seconds: quiz.duration_seconds,
    pass_score: quiz.pass_score,
    max_attempts: quiz.max_attempts,
    status: quiz.status,
  };

  function applyStatus(target: QuizStatus) {
    setWarn(null);
    startTransition(async () => {
      const result = await setQuizStatusAction(quiz.quiz_id, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // Leaving Published (unpublish / archive-while-published) — warn if
  // the quiz currently reaches students.
  function requestLeavePublished(target: QuizStatus) {
    setOpen(false);
    startTransition(async () => {
      const result = await quizUsageAction(quiz.quiz_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const inUse =
        result.usage.programmeCount > 0 ||
        result.usage.activityLinks.length > 0;
      if (inUse) setWarn({ target, usage: result.usage });
      else applyStatus(target);
    });
  }

  function startDelete() {
    setOpen(false);
    startTransition(async () => {
      const result = await quizDeletePreflightAction(quiz.quiz_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.blockingActivities.length > 0) {
        setBlocking(result.blockingActivities);
        setDeletePhase('blocked');
      } else {
        setAttemptCount(result.attemptCount);
        setDeleteText('');
        setDeletePhase('confirm');
      }
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteQuizAction(quiz.quiz_id);
      if (!result.ok) {
        if (result.blockingActivities?.length) {
          setBlocking(result.blockingActivities);
          setDeletePhase('blocked');
        } else {
          setError(result.error);
          setDeletePhase('idle');
        }
        return;
      }
      router.refresh();
    });
  }

  // Menu items per status.
  function chooseEdit() {
    setOpen(false);
    setEditOpen(true);
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
    <div className={`quiz-card-menu ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="quiz-card-menu-btn"
        aria-label="Quiz actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <QuizIcon name="more" />
      </button>

      {open && (
        <div className="quiz-card-menu-pop" role="menu">
          <button type="button" className="quiz-card-menu-item" onClick={chooseEdit}>
            <QuizIcon name="pencil" />
            Edit details
          </button>

          {quiz.status === 'DRAFT' && (
            <button
              type="button"
              className="quiz-card-menu-item"
              onClick={() => {
                setOpen(false);
                applyStatus('PUBLISHED');
              }}
            >
              <QuizIcon name="check-circle" />
              Publish
            </button>
          )}
          {quiz.status === 'PUBLISHED' && (
            <button
              type="button"
              className="quiz-card-menu-item"
              onClick={() => requestLeavePublished('DRAFT')}
            >
              <QuizIcon name="check-circle" />
              Unpublish
            </button>
          )}

          {quiz.status !== 'ARCHIVED' ? (
            <button
              type="button"
              className="quiz-card-menu-item"
              onClick={() => {
                if (quiz.status === 'PUBLISHED') {
                  requestLeavePublished('ARCHIVED');
                } else {
                  setOpen(false);
                  applyStatus('ARCHIVED');
                }
              }}
            >
              <QuizIcon name="archive" />
              Archive
            </button>
          ) : (
            <button
              type="button"
              className="quiz-card-menu-item"
              onClick={() => {
                setOpen(false);
                applyStatus('DRAFT');
              }}
            >
              <QuizIcon name="archive" />
              Restore to draft
            </button>
          )}

          <div className="quiz-card-menu-sep" />

          <button
            type="button"
            className="quiz-card-menu-item is-danger"
            onClick={startDelete}
          >
            <QuizIcon name="trash" />
            Delete
          </button>
        </div>
      )}

      {editOpen && (
        <QuizFormModal
          mode="edit"
          quizId={quiz.quiz_id}
          initial={editInitial}
          onClose={() => setEditOpen(false)}
        />
      )}

      {warn && (
        <LeavePublishedWarning
          warn={warn}
          pending={isPending}
          onCancel={() => setWarn(null)}
          onConfirm={() => applyStatus(warn.target)}
        />
      )}

      {deletePhase === 'blocked' && (
        <ActivityBlockedDialog
          title="Can't delete this quiz"
          body={
            <>
              <strong>{quiz.title}</strong> is still linked to{' '}
              {blocking.length}{' '}
              {blocking.length === 1 ? 'activity' : 'activities'} in your
              curriculum. Unlink it from{' '}
              {blocking.length === 1 ? 'that' : 'those'} first, then delete.
            </>
          }
          activities={blocking}
          onClose={() => setDeletePhase('idle')}
        />
      )}

      {deletePhase === 'confirm' && (
        <DeleteConfirm
          itemId={quiz.title}
          deleteText={deleteText}
          pending={isPending}
          note={attemptNote}
          onTextChange={setDeleteText}
          onCancel={() => setDeletePhase('idle')}
          onConfirm={confirmDelete}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
