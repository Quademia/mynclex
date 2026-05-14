// mynclex/lib/programmes/programme-status-controls.tsx
//
// Slice 9.3e — Publish / Archive controls on the programme
// Overview page. One-way lifecycle: DRAFT → PUBLISHED → ARCHIVED.
// ARCHIVED is terminal in v1.
//
// State-dependent buttons:
//   DRAFT     → Publish (primary) + Archive (ghost / danger-tinted)
//   PUBLISHED → Archive (primary danger)
//   ARCHIVED  → no actions (status pill only)
//
// Publish fires silently — single-click action, no confirm. Archive
// goes through <ProgrammeArchiveConfirm> (type-DELETE gate) because
// it's terminal and may affect active cohorts.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ProgrammeArchiveConfirm } from '@/lib/overlays/programmes/programme-archive-confirm';
import {
  archiveProgrammeAction,
  publishProgrammeAction,
} from './actions';
import { formatStatusLabel, statusPillClass } from './format';
import type { ProgrammeStatusContext } from './queries';

interface ProgrammeStatusControlsProps {
  programme: ProgrammeStatusContext;
}

export function ProgrammeStatusControls({
  programme,
}: ProgrammeStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiveText, setArchiveText] = useState('');

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const result = await publishProgrammeAction(programme.programme_id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleArchiveConfirmed() {
    setError(null);
    startTransition(async () => {
      const result = await archiveProgrammeAction(programme.programme_id);
      if (!result.ok) {
        setError(result.error);
        setShowArchiveConfirm(false);
        setArchiveText('');
        return;
      }
      setShowArchiveConfirm(false);
      setArchiveText('');
      router.refresh();
    });
  }

  function openArchiveConfirm() {
    setArchiveText('');
    setShowArchiveConfirm(true);
  }

  function closeArchiveConfirm() {
    if (isPending) return;
    setShowArchiveConfirm(false);
    setArchiveText('');
  }

  const isDraft = programme.status === 'DRAFT';
  const isPublished = programme.status === 'PUBLISHED';
  const isArchived = programme.status === 'ARCHIVED';

  return (
    <>
      <section className="programme-status-controls">
        <div className="programme-status-row">
          <span className="programme-status-label">Status</span>
          <span
            className={`programme-status-pill ${statusPillClass(programme.status)}`}
          >
            {formatStatusLabel(programme.status)}
          </span>
        </div>

        {!isArchived && (
          <div className="programme-status-actions">
            {isDraft && (
              <button
                type="button"
                className="prog-btn prog-btn-primary"
                onClick={handlePublish}
                disabled={isPending}
              >
                {isPending ? 'Publishing…' : 'Publish programme'}
              </button>
            )}
            <button
              type="button"
              className={
                isPublished
                  ? 'prog-btn prog-btn-danger'
                  : 'prog-btn prog-btn-ghost'
              }
              onClick={openArchiveConfirm}
              disabled={isPending}
            >
              Archive
            </button>
          </div>
        )}

        <p className="programme-status-hint">
          {isDraft &&
            'Draft programmes aren’t visible to students. Publish when the curriculum is ready.'}
          {isPublished &&
            'Published programmes are visible to enrolled students based on each item’s Live/Draft flag.'}
          {isArchived &&
            'Archived programmes can’t be reopened. Existing cohorts continue to their end dates.'}
        </p>
      </section>

      {showArchiveConfirm && (
        <ProgrammeArchiveConfirm
          programmeTitle={programme.title}
          isCurrentlyPublished={isPublished}
          deleteText={archiveText}
          pending={isPending}
          onTextChange={setArchiveText}
          onCancel={closeArchiveConfirm}
          onConfirm={handleArchiveConfirmed}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
