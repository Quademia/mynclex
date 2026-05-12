// mynclex/lib/curriculum/activity-modal.tsx
//
// Activity editor modal shell. Holds:
//   • The header (type label + Save / Cancel buttons + close).
//   • The shared fields (Title + Note to student) — these sit
//     above the divider for every type per
//     curriculum-authoring-ux.md screen 6.
//   • A slot below the divider that dispatches on activity type
//     to the right body component (TextEditor in 9.3b; the other
//     five land in 9.3d).
//
// The shell is reusable across contexts. Today it's invoked from
// <UnitBuilder> (programme curriculum); in 9.3f the cohort-only-
// activity flow will invoke it from the cohort curriculum tab.
// Neither caller passes the server action directly — the modal
// runs the action itself based on `mode` so both call sites get
// the same Save behaviour.
//
// Cancel with unsaved edits surfaces <DiscardConfirm> — same
// guard pattern as <ProgrammeFormModal> / <CohortFormModal>.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { TextEditor } from './text-editor';
import { createActivityAction, editActivityAction } from './actions';
import type {
  ActivityType,
  ProgrammeActivity,
  TextActivityBodyValues,
  TextActivityFormValues,
} from './types';

type ActivityModalProps =
  | {
      mode: 'create';
      unitId: string;
      type: ActivityType;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      activity: ProgrammeActivity;
      onClose: () => void;
    };

// Display name + tile copy by activity type. Used in the modal
// header and the picker. Matches curriculum-authoring-ux.md §6.
const TYPE_LABELS: Record<ActivityType, string> = {
  TEXT: 'Text content',
  PDF: 'PDF upload',
  EXTERNAL_LINK: 'External link',
  LIVE_SESSION: 'Live session',
  MOCK: 'Mock assessment',
  PRACTICE_QUIZ: 'Practice quiz',
};

function readTextBodyFromActivity(activity: ProgrammeActivity): TextActivityBodyValues {
  const payload = activity.payload as { body?: string; estimated_minutes?: number };
  return {
    body: payload.body ?? '',
    estimated_minutes:
      typeof payload.estimated_minutes === 'number'
        ? String(payload.estimated_minutes)
        : '',
  };
}

export function ActivityModal(props: ActivityModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const isEdit = props.mode === 'edit';
  const activityType = isEdit ? props.activity.type : props.type;
  const typeLabel = TYPE_LABELS[activityType];

  // Shared fields — Title + Note. Pre-fill from row in edit mode.
  const [title, setTitle] = useState(isEdit ? props.activity.title : '');
  const [note, setNote] = useState(isEdit ? (props.activity.note ?? '') : '');

  // Type-specific body state. Currently TEXT only (others greyed
  // in the picker). When 9.3d ships, branch this on activityType
  // and lazily mount the right body component.
  const [textBody, setTextBody] = useState<TextActivityBodyValues>(
    isEdit
      ? readTextBodyFromActivity(props.activity)
      : { body: '', estimated_minutes: '' }
  );

  // Track dirty state so Cancel surfaces the discard guard.
  const initialTitle = isEdit ? props.activity.title : '';
  const initialNote = isEdit ? (props.activity.note ?? '') : '';
  const initialBody = isEdit
    ? readTextBodyFromActivity(props.activity)
    : { body: '', estimated_minutes: '' };
  const isDirty =
    title !== initialTitle ||
    note !== initialNote ||
    textBody.body !== initialBody.body ||
    textBody.estimated_minutes !== initialBody.estimated_minutes;

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
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError('Title is required.');
      return;
    }
    setError(null);

    const estimatedMinutesNum = textBody.estimated_minutes.trim() === ''
      ? null
      : parseInt(textBody.estimated_minutes, 10);
    if (
      estimatedMinutesNum !== null &&
      (!Number.isInteger(estimatedMinutesNum) || estimatedMinutesNum < 1)
    ) {
      setError('Estimated time must be a positive number, or blank.');
      return;
    }

    const values: TextActivityFormValues = {
      title: trimmed,
      note,
      body: textBody.body,
      estimated_minutes: estimatedMinutesNum,
    };

    startTransition(async () => {
      const result = isEdit
        ? await editActivityAction(props.activity.activity_id, values)
        : await createActivityAction(props.unitId, props.type, values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onClose();
      router.refresh();
    });
  }

  const headerTitle = isEdit ? `Edit · ${typeLabel}` : `New · ${typeLabel}`;
  const submitLabel = isEdit
    ? isPending ? 'Saving…' : 'Save changes'
    : isPending ? 'Creating…' : 'Add activity';

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal activity-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">{headerTitle}</h2>
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

          <div className="prog-modal-body activity-modal-body">
            <section className="prog-form-section">
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
                <span className="prog-field-label">Note to student</span>
                <textarea
                  className="prog-input"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isPending}
                  placeholder="Optional. A line shown above the activity body."
                />
              </label>
            </section>

            <div className="activity-modal-divider" />

            {activityType === 'TEXT' && (
              <TextEditor
                values={textBody}
                onChange={setTextBody}
                disabled={isPending}
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
              disabled={isPending || title.trim() === ''}
            >
              {submitLabel}
            </button>
          </footer>
        </div>
      </div>

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => setShowDiscard(false)}
          onDiscard={() => {
            setShowDiscard(false);
            props.onClose();
          }}
          pending={isPending}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
