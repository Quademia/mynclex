// mynclex/lib/tutor-quiz/quiz-form-modal.tsx
//
// Quiz metadata form modal — create + edit. Collects title,
// description, kind, mode, and the optional settings (duration,
// pass score, max attempts). In edit mode it also carries the
// status field (Draft / Published / Archived); create always lands
// as DRAFT and navigates straight into the editor.
//
// Reuses the .prog-modal-* / .prog-field-* form-modal vocabulary
// from styles/programmes.css — that's the established tutor
// form-modal visual pattern (same reuse rationale as the bank
// filters' shared .bank-filter-* classes).

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { QuizDeleteSection } from './quiz-delete-section';
import { createQuizAction, updateQuizAction } from './actions';
import {
  QUIZ_MODES_BY_KIND,
  formatQuizMode,
  isTimedMode,
  quizModeHelp,
} from './format';
import type {
  QuizFormValues,
  QuizKind,
  QuizMode,
  QuizStatus,
} from './types';

type QuizFormModalProps =
  | { mode: 'create'; onClose: () => void }
  | {
      mode: 'edit';
      quizId: string;
      initial: QuizFormValues;
      /** How many questions the quiz currently holds — gates the
       *  "Published" status option (a quiz needs ≥1 question to publish). */
      itemCount: number;
      onClose: () => void;
    };

// Sensible mode default per kind — used on create and whenever the
// kind switches to one that no longer allows the current mode.
const DEFAULT_MODE_FOR_KIND: Record<QuizKind, QuizMode> = {
  PRACTICE: 'UNTIMED_LEARNING',
  MOCK: 'TIMED_FREE_NAV',
};

function isPositiveIntString(s: string): boolean {
  if (s.trim() === '') return false;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1;
}

function isValidPercentString(s: string): boolean {
  if (s.trim() === '') return true; // empty = ungraded, allowed
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

export function QuizFormModal(props: QuizFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.initial : null;
  // A quiz needs ≥1 question to be Published — drives the disabled
  // "Published" option + a guard on submit (server re-checks too).
  const itemCount = isEdit ? props.itemCount : 0;
  const canPublish = itemCount > 0;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [quizKind, setQuizKind] = useState<QuizKind>(
    initial?.quiz_kind ?? 'PRACTICE',
  );
  const [mode, setMode] = useState<QuizMode>(
    initial?.mode ?? DEFAULT_MODE_FOR_KIND.PRACTICE,
  );
  // Duration entered in MINUTES for the tutor; stored as seconds.
  const [durationMinutes, setDurationMinutes] = useState(
    initial?.duration_seconds != null
      ? String(Math.round(initial.duration_seconds / 60))
      : '',
  );
  // Pass score entered as a PERCENT; stored as a 0..1 fraction.
  const [passScorePercent, setPassScorePercent] = useState(
    initial?.pass_score != null
      ? String(Math.round(initial.pass_score * 100))
      : '',
  );
  const [maxAttempts, setMaxAttempts] = useState(
    initial?.max_attempts != null ? String(initial.max_attempts) : '',
  );
  const [status, setStatus] = useState<QuizStatus>(
    initial?.status ?? 'DRAFT',
  );

  const allowedModes = QUIZ_MODES_BY_KIND[quizKind];
  const modeIsTimed = isTimedMode(mode);

  // When the kind changes to one that no longer allows the current
  // mode, snap to that kind's sensible default.
  function handleKindChange(nextKind: QuizKind) {
    setQuizKind(nextKind);
    if (!QUIZ_MODES_BY_KIND[nextKind].includes(mode)) {
      setMode(DEFAULT_MODE_FOR_KIND[nextKind]);
    }
  }

  // Dirty tracking — gates the discard-confirm dialog.
  const isDirty = (() => {
    if (isEdit && initial) {
      const initialMinutes =
        initial.duration_seconds != null
          ? String(Math.round(initial.duration_seconds / 60))
          : '';
      const initialPercent =
        initial.pass_score != null
          ? String(Math.round(initial.pass_score * 100))
          : '';
      const initialAttempts =
        initial.max_attempts != null ? String(initial.max_attempts) : '';
      return (
        title !== initial.title ||
        description !== (initial.description ?? '') ||
        quizKind !== initial.quiz_kind ||
        mode !== initial.mode ||
        durationMinutes !== initialMinutes ||
        passScorePercent !== initialPercent ||
        maxAttempts !== initialAttempts ||
        status !== initial.status
      );
    }
    return (
      title !== '' ||
      description !== '' ||
      quizKind !== 'PRACTICE' ||
      mode !== DEFAULT_MODE_FOR_KIND.PRACTICE ||
      durationMinutes !== '' ||
      passScorePercent !== '' ||
      maxAttempts !== ''
    );
  })();

  const trimmedTitle = title.trim();
  const isFormValid =
    trimmedTitle.length > 0 &&
    allowedModes.includes(mode) &&
    (!modeIsTimed || isPositiveIntString(durationMinutes)) &&
    isValidPercentString(passScorePercent) &&
    (maxAttempts.trim() === '' || isPositiveIntString(maxAttempts)) &&
    // Can't publish an empty quiz (the server enforces this too).
    (status !== 'PUBLISHED' || canPublish);

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else props.onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending]);

  function handleSubmit() {
    if (!isFormValid) {
      setError('Fill in the required fields.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const values: QuizFormValues = {
        title: trimmedTitle,
        description: description.trim() || null,
        quiz_kind: quizKind,
        mode,
        duration_seconds: modeIsTimed
          ? parseInt(durationMinutes, 10) * 60
          : null,
        pass_score:
          passScorePercent.trim() === ''
            ? null
            : Number(passScorePercent) / 100,
        max_attempts:
          maxAttempts.trim() === '' ? null : parseInt(maxAttempts, 10),
        status: isEdit ? status : 'DRAFT',
      };

      if (isEdit) {
        const result = await updateQuizAction(props.quizId, values);
        if (result.ok) {
          props.onClose();
          router.refresh();
        } else {
          setError(result.error);
        }
      } else {
        const result = await createQuizAction(values);
        if (result.ok) {
          props.onClose();
          router.push(`/tutor/quiz/${result.quiz_id}`);
        } else {
          setError(result.error);
        }
      }
    });
  }

  const modalTitle = isEdit ? 'Edit quiz details' : 'New quiz';
  const submitLabel = isEdit
    ? isPending
      ? 'Saving…'
      : 'Save changes'
    : isPending
      ? 'Creating…'
      : 'Create quiz';

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">{modalTitle}</h2>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={attemptClose}
              disabled={isPending}
            >
              ✕
            </button>
          </header>

          <div className="prog-modal-body">
            {/* IDENTITY */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Identity</h3>

              <label className="prog-field">
                <span className="prog-field-label">
                  Title <span className="prog-required">*</span>
                </span>
                <input
                  type="text"
                  className="prog-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isPending}
                  autoFocus
                />
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Description</span>
                <textarea
                  className="prog-textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isPending}
                />
                <span className="prog-field-help">
                  Optional. Shown on the quiz card and, later, to
                  students before they start.
                </span>
              </label>
            </section>

            {/* FORMAT */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Format</h3>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">
                    Kind <span className="prog-required">*</span>
                  </span>
                  <select
                    className="prog-input"
                    value={quizKind}
                    onChange={(e) =>
                      handleKindChange(e.target.value as QuizKind)
                    }
                    disabled={isPending}
                  >
                    <option value="PRACTICE">Practice quiz</option>
                    <option value="MOCK">Mock exam</option>
                  </select>
                  <span className="prog-field-help">
                    {quizKind === 'PRACTICE'
                      ? 'Lower-stakes practice; can reveal answers as the student goes.'
                      : 'Exam-style; answers are never revealed live.'}
                  </span>
                </label>

                <label className="prog-field">
                  <span className="prog-field-label">
                    Mode <span className="prog-required">*</span>
                  </span>
                  <select
                    className="prog-input"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as QuizMode)}
                    disabled={isPending}
                  >
                    {allowedModes.map((m) => (
                      <option key={m} value={m}>
                        {formatQuizMode(m)}
                      </option>
                    ))}
                  </select>
                  <span className="prog-field-help">
                    {quizModeHelp(mode)}
                  </span>
                </label>
              </div>

              {modeIsTimed && (
                <label className="prog-field">
                  <span className="prog-field-label">
                    Duration (minutes){' '}
                    <span className="prog-required">*</span>
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="prog-input"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    disabled={isPending}
                  />
                  <span className="prog-field-help">
                    Total countdown for the whole quiz.
                  </span>
                </label>
              )}
            </section>

            {/* SCORING */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Scoring</h3>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">Pass score (%)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    className="prog-input"
                    value={passScorePercent}
                    onChange={(e) => setPassScorePercent(e.target.value)}
                    disabled={isPending}
                    placeholder="Ungraded"
                  />
                  <span className="prog-field-help">
                    Leave blank for an ungraded quiz (no pass/fail badge).
                  </span>
                </label>

                <label className="prog-field">
                  <span className="prog-field-label">Max attempts</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="prog-input"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                    disabled={isPending}
                    placeholder="Unlimited"
                  />
                  <span className="prog-field-help">
                    How many times a student may take it. Blank =
                    unlimited.
                  </span>
                </label>
              </div>
            </section>

            {/* STATUS — edit mode only; create always lands as DRAFT */}
            {isEdit && (
              <section className="prog-form-section">
                <h3 className="prog-form-section-title">Status</h3>
                <label className="prog-field">
                  <span className="prog-field-label">
                    Lifecycle status
                  </span>
                  <select
                    className="prog-input"
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as QuizStatus)
                    }
                    disabled={isPending}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED" disabled={!canPublish}>
                      Published
                    </option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                  <span className="prog-field-help">
                    {canPublish ? (
                      <>
                        Only Published quizzes can be attached to a
                        programme&apos;s curriculum. Archived quizzes drop
                        out of the active list.
                      </>
                    ) : (
                      <>
                        Add at least one question before you can publish
                        this quiz.
                      </>
                    )}
                  </span>
                </label>
              </section>
            )}

            {/* DANGER ZONE — delete (edit mode only). Reachable from
                both the card pencil and the editor via this one modal. */}
            {isEdit && (
              <QuizDeleteSection
                quizId={props.quizId}
                quizTitle={initial?.title ?? trimmedTitle}
              />
            )}
          </div>

          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={attemptClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-primary"
              onClick={handleSubmit}
              disabled={!isFormValid || isPending || (isEdit && !isDirty)}
            >
              {submitLabel}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => setShowDiscard(false)}
          onDiscard={() => {
            setShowDiscard(false);
            props.onClose();
          }}
        />
      )}
    </>
  );
}
