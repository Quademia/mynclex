// mynclex/lib/programme-quizzes/programme-quizzes-view.tsx
//
// Client orchestrator for the programme Quizzes page (Tutor Quiz
// Slice 5). Owns:
//   • The two CTAs at the top of the list / empty state.
//   • Picker open/close.
//   • Remove flow — confirm dialog, blocked rejection, success
//     toast.
//   • "New quiz" creation + redirect into the editor.
//
// Stateful pieces (overlays + toast) live here; the row + source
// hint components stay presentational so the page renders fast.

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import {
  attachQuizzesAction,
  createQuizAndAttachAction,
  removeQuizFromProgrammeAction,
} from './actions';
import type {
  BlockingActivity,
  PickerQuizRow,
  ProgrammeQuizRow,
} from './types';
import { QuizRow } from './quiz-row';
import { AddExistingPicker } from '@/lib/overlays/programme-quizzes/add-existing-picker';
import { RemoveQuizConfirm } from '@/lib/overlays/programme-quizzes/remove-quiz-confirm';
import { RemoveQuizBlocked } from '@/lib/overlays/programme-quizzes/remove-quiz-blocked';

interface ProgrammeQuizzesViewProps {
  programmeId: string;
  programmeTitle: string;
  quizzes: ProgrammeQuizRow[];
  pickerCandidates: PickerQuizRow[];
}

type RemoveModalState =
  | { kind: 'none' }
  | { kind: 'confirm'; quiz: ProgrammeQuizRow }
  | {
      kind: 'blocked';
      quiz: ProgrammeQuizRow;
      activities: BlockingActivity[];
    };

export function ProgrammeQuizzesView({
  programmeId,
  programmeTitle,
  quizzes,
  pickerCandidates,
}: ProgrammeQuizzesViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeModal, setRemoveModal] = useState<RemoveModalState>({
    kind: 'none',
  });

  // Single toast slot — the slice has only one happy path at a
  // time (attach succeeded / remove succeeded / new quiz failed).
  const [toast, setToast] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  function handleOpenPicker() {
    setPickerOpen(true);
  }

  function handleClosePicker() {
    setPickerOpen(false);
  }

  function handleAddExisting(quizIds: string[]) {
    startTransition(async () => {
      const res = await attachQuizzesAction(programmeId, quizIds);
      if (!res.ok) {
        setErrorBanner(res.error);
        return;
      }
      setPickerOpen(false);
      setToast({
        tone: 'success',
        message:
          res.attached === 1
            ? 'Added 1 quiz to this programme.'
            : `Added ${res.attached} quizzes to this programme.`,
      });
      router.refresh();
    });
  }

  function handleNewQuiz() {
    startTransition(async () => {
      const res = await createQuizAndAttachAction(programmeId);
      if (!res.ok) {
        setToast({ tone: 'error', message: res.error });
        return;
      }
      router.push(`/tutor/quiz/${res.quiz_id}`);
    });
  }

  function handleRequestRemove(quiz: ProgrammeQuizRow) {
    setRemoveModal({ kind: 'confirm', quiz });
  }

  function handleCancelRemove() {
    setRemoveModal({ kind: 'none' });
  }

  function handleConfirmRemove(quiz: ProgrammeQuizRow) {
    startTransition(async () => {
      const res = await removeQuizFromProgrammeAction(
        programmeId,
        quiz.quiz_id,
      );
      if (!res.ok) {
        if (res.blocking_activities && res.blocking_activities.length > 0) {
          setRemoveModal({
            kind: 'blocked',
            quiz,
            activities: res.blocking_activities,
          });
          return;
        }
        setRemoveModal({ kind: 'none' });
        setToast({ tone: 'error', message: res.error });
        return;
      }
      setRemoveModal({ kind: 'none' });
      setToast({
        tone: 'success',
        message: `Removed "${quiz.title}" from this programme.`,
      });
      router.refresh();
    });
  }

  const hasQuizzes = quizzes.length > 0;

  return (
    <div className="pq-page">
      <header className="pq-head">
        <div className="pq-head-titles">
          <h1 className="pq-title">Quizzes</h1>
          <p className="pq-sub">
            Mock &amp; Practice quizzes attached to this programme.
            Linked curriculum activities show up here automatically;
            you can also attach a quiz directly so it&apos;s
            available to students as standalone practice.
          </p>
        </div>
        {hasQuizzes && (
          <div className="pq-head-actions">
            <button
              type="button"
              className="pq-btn pq-btn-outline"
              onClick={handleOpenPicker}
              disabled={pending}
            >
              + Add existing
            </button>
            <button
              type="button"
              className="pq-btn pq-btn-primary"
              onClick={handleNewQuiz}
              disabled={pending}
            >
              + New quiz
            </button>
          </div>
        )}
      </header>

      {!hasQuizzes ? (
        <div className="pq-empty">
          <h2 className="pq-empty-title">
            No quizzes attached to this programme yet.
          </h2>
          <p className="pq-empty-sub">
            Attach a published quiz from your library, or build a new
            one for this programme. Activity-linked quizzes will also
            appear here automatically.
          </p>
          <div className="pq-empty-ctas">
            <button
              type="button"
              className="pq-btn pq-btn-outline"
              onClick={handleOpenPicker}
              disabled={pending}
            >
              + Add existing
            </button>
            <button
              type="button"
              className="pq-btn pq-btn-primary"
              onClick={handleNewQuiz}
              disabled={pending}
            >
              + New quiz
            </button>
          </div>
        </div>
      ) : (
        <div className="pq-list">
          {quizzes.map((q) => (
            <QuizRow
              key={q.quiz_id}
              quiz={q}
              onRemove={handleRequestRemove}
              removing={
                pending &&
                removeModal.kind === 'confirm' &&
                removeModal.quiz.quiz_id === q.quiz_id
              }
            />
          ))}
        </div>
      )}

      {pickerOpen && (
        <AddExistingPicker
          candidates={pickerCandidates}
          pending={pending}
          errorMessage={errorBanner}
          onErrorClear={() => setErrorBanner(null)}
          onClose={() => {
            handleClosePicker();
            setErrorBanner(null);
          }}
          onAdd={handleAddExisting}
        />
      )}

      {removeModal.kind === 'confirm' && (
        <RemoveQuizConfirm
          quiz={removeModal.quiz}
          programmeTitle={programmeTitle}
          pending={pending}
          onCancel={handleCancelRemove}
          onConfirm={() => handleConfirmRemove(removeModal.quiz)}
        />
      )}

      {removeModal.kind === 'blocked' && (
        <RemoveQuizBlocked
          quiz={removeModal.quiz}
          programmeId={programmeId}
          activities={removeModal.activities}
          onClose={handleCancelRemove}
        />
      )}

      {toast && (
        <ProgrammeQuizzesToast
          tone={toast.tone}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

// Single-slot success/error toast — top-right, 5s auto-dismiss,
// click-× escape. Inlined here because the slice is the only
// place needing a success tone today; lift to lib/toast/ when a
// second caller appears.

function ProgrammeQuizzesToast({
  tone,
  message,
  onDismiss,
}: {
  tone: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div
      className={`pq-toast pq-toast-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="pq-toast-icon" aria-hidden="true">
        {tone === 'success' ? '✓' : '!'}
      </span>
      <span className="pq-toast-message">{message}</span>
      <button
        type="button"
        className="pq-toast-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
