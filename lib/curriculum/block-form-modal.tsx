// mynclex/lib/curriculum/block-form-modal.tsx
//
// Edit-block modal. Three fields: Title (required) / Description
// (optional) / Live-Draft toggle. The create flow is inline on
// the unit body (a tiny title input that fires createBlockAction
// directly) — by the time the tutor needs to edit description or
// flip Live/Draft, they're past the "just give it a name" stage,
// so the heavier modal is the right fit.
//
// Mirrors <UnitFormModal>'s shape — same prog-modal chrome,
// discard guard on dirty cancel, ErrorToast for action failures.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { editBlockAction } from './actions';
import type { BlockFormValues } from './types';

interface BlockFormModalProps {
  blockId: string;
  initial: BlockFormValues;
  onClose: () => void;
}

export function BlockFormModal({
  blockId,
  initial,
  onClose,
}: BlockFormModalProps) {
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
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError('Block title is required.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await editBlockAction(blockId, {
        title: trimmed,
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

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Edit block"
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Edit block</h2>
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
                  placeholder="e.g. Pre-tutorial reading"
                />
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Description</span>
                <textarea
                  className="prog-input"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isPending}
                  placeholder="Optional one-liner shown on the block card."
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
                  Off → Draft. A draft block can sit inside a Live unit.
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
              disabled={isPending || !isDirty || title.trim() === ''}
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
