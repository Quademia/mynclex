// mynclex/lib/programmes/programme-overview-actions.tsx
//
// The Overview header's right-side action cluster (CD "Card Grid"
// prototype): the compact payment-gating toggle · a divider · Publish
// (DRAFT only) · Edit · Archive. Replaces the old stacked
// <ProgrammeStatusControls> section on the Overview page — same server
// actions + confirm dialog, restyled inline into the page header.
//
// (ProgrammeStatusControls stays in use by the Programmes-list card menu,
// so it isn't removed — this is a parallel, header-shaped presentation.)

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ProgrammeArchiveConfirm } from '@/lib/overlays/programmes/programme-archive-confirm';
import { ProgrammeFormModal } from './programme-form-modal';
import { PaymentGatingToggle } from './payment-gating-toggle';
import { ProgIcon } from './prog-icon';
import { archiveProgrammeAction, publishProgrammeAction } from './actions';
import type { ProgrammeFormValues, ProgrammeStatus } from './types';

interface ProgrammeOverviewActionsProps {
  programmeId: string;
  title: string;
  status: ProgrammeStatus;
  paymentGatesAccess: boolean;
  // Seeds the Edit modal (ProgrammeFormModal, mode='edit') — no second
  // round-trip when the tutor opens Edit.
  formValues: ProgrammeFormValues;
}

export function ProgrammeOverviewActions({
  programmeId,
  title,
  status,
  paymentGatesAccess,
  formValues,
}: ProgrammeOverviewActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveText, setArchiveText] = useState('');
  const [showEdit, setShowEdit] = useState(false);

  const isDraft = status === 'DRAFT';
  const isPublished = status === 'PUBLISHED';
  const isArchived = status === 'ARCHIVED';

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const result = await publishProgrammeAction(programmeId);
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
      const result = await archiveProgrammeAction(programmeId);
      if (!result.ok) {
        setError(result.error);
        setShowArchive(false);
        setArchiveText('');
        return;
      }
      setShowArchive(false);
      setArchiveText('');
      router.refresh();
    });
  }

  return (
    <div className="pov-actions">
      <PaymentGatingToggle
        programmeId={programmeId}
        enabled={paymentGatesAccess}
        compact
      />

      <span className="pov-actions-divider" aria-hidden="true" />

      {isDraft && (
        <button
          type="button"
          className="prog-btn prog-btn-primary"
          onClick={handlePublish}
          disabled={isPending}
        >
          {isPending ? 'Publishing…' : 'Publish'}
        </button>
      )}

      <button
        type="button"
        className="prog-btn prog-btn-ghost pov-btn-icon"
        onClick={() => setShowEdit(true)}
        disabled={isPending}
      >
        <ProgIcon name="pencil" size={13} />
        Edit
      </button>

      {!isArchived && (
        <button
          type="button"
          className={
            (isPublished ? 'prog-btn prog-btn-danger' : 'prog-btn prog-btn-ghost') +
            ' pov-btn-icon'
          }
          onClick={() => {
            setArchiveText('');
            setShowArchive(true);
          }}
          disabled={isPending}
        >
          <ProgIcon name="archive" size={13} />
          Archive
        </button>
      )}

      {showEdit && (
        <ProgrammeFormModal
          mode="edit"
          programmeId={programmeId}
          initial={formValues}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showArchive && (
        <ProgrammeArchiveConfirm
          programmeTitle={title}
          isCurrentlyPublished={isPublished}
          deleteText={archiveText}
          pending={isPending}
          onTextChange={setArchiveText}
          onCancel={() => {
            if (isPending) return;
            setShowArchive(false);
            setArchiveText('');
          }}
          onConfirm={handleArchiveConfirmed}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
