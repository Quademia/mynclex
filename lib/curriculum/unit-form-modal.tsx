// mynclex/lib/curriculum/unit-form-modal.tsx
//
// Edit-unit modal. Three fields: Title / Description / Live-Draft
// toggle. unit_index is fixed (set at programme creation / length
// expansion); never editable here.
//
// Matches the <ProgrammeFormModal> / <CohortFormModal> pattern —
// centred modal with prog-modal-* chrome, discard guard on
// cancel-with-unsaved, ErrorToast for action failures.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { editUnitAction } from './actions';
import { unitLabel } from './format';
import type { UnitFormValues } from './types';
import type { UnitLabel } from '@/lib/programmes/types';

interface UnitFormModalProps {
  unitId: string;
  unitIndex: number;
  programmeUnitLabel: UnitLabel;
  initial: UnitFormValues;
  onClose: () => void;
}

export function UnitFormModal({
  unitId,
  unitIndex,
  programmeUnitLabel,
  initial,
  onClose,
}: UnitFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [isPublished, setIsPublished] = useState(initial.is_published);

  const isDirty =
    title !== initial.title ||
    description !== initial.description ||
    isPublished !== initial.is_published;

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else onClose();
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
    setError(null);
    startTransition(async () => {
      const result = await editUnitAction(unitId, {
        title,
        description,
        is_published: isPublished,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const modalTitle = `Edit ${unitLabel(unitIndex, programmeUnitLabel)}`;

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
            <section className="prog-form-section">
              <label className="prog-field">
                <span className="prog-field-label">Title</span>
                <input
                  type="text"
                  className="prog-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isPending}
                  autoFocus
                  placeholder="e.g. Cardiac Pharmacology"
                />
                <span className="prog-field-help">
                  Optional. Leave blank to show as &ldquo;{unitLabel(unitIndex, programmeUnitLabel)}&rdquo;.
                </span>
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Description</span>
                <textarea
                  className="prog-input"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isPending}
                  placeholder="Optional subtitle shown on the unit card."
                />
              </label>

              <div className="prog-field">
                <span className="prog-field-label">Status</span>
                <label className="prog-toggle prog-toggle-inline">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    disabled={isPending}
                  />
                  <span>Live — student-visible in cohorts</span>
                </label>
                <span className="prog-field-help">
                  Off → Draft. Draft units don&apos;t surface in any
                  cohort&apos;s checklist (cohort layer ships in 9.3f).
                </span>
              </div>
            </section>
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
              disabled={isPending || !isDirty}
            >
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </footer>
        </div>
      </div>

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => setShowDiscard(false)}
          onDiscard={() => {
            setShowDiscard(false);
            onClose();
          }}
          pending={isPending}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
