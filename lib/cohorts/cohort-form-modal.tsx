// mynclex/lib/cohorts/cohort-form-modal.tsx
//
// Cohort form modal — create + edit. One section, four field rows:
//   • Name override (optional — blank → UI auto-generates from dates)
//   • Start date + End date (end is *derived* from start +
//     programme.length_units × 7, snapshotted on save; not editable
//     — tutors who need a different timeline edit the programme.
//     Editable end-date is a deferred product question.)
//   • Cohort size (optional — blank = no cap)
//   • Allow late join (toggle, default OFF)
//
// Discriminated union on `mode` lets one component handle both
// flows: form layout is identical, only the title, submit label,
// dirty baseline, and submit handler differ. Same pattern as
// ProgrammeFormModal.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { Switch } from '@/lib/programmes/form-controls';
import { ProgIcon } from '@/lib/programmes/prog-icon';
import { createCohortAction, editCohortAction } from './actions';
import { formatDateRange } from './format';
import type { CohortFormValues } from './types';

type CohortFormModalProps =
  | {
      mode: 'create';
      programmeId: string;
      programmeLengthUnits: number;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      cohortId: string;
      programmeLengthUnits: number;
      initial: CohortFormValues;
      onClose: () => void;
    };

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function CohortFormModal(props: CohortFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.initial : null;
  const programmeLengthUnits = props.programmeLengthUnits;

  // Form state — pre-populated from initial in edit mode.
  const [name, setName] = useState(initial?.name ?? '');
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [cohortSize, setCohortSize] = useState(
    initial?.cohort_size != null ? String(initial.cohort_size) : ''
  );
  const [allowLateJoin, setAllowLateJoin] = useState(
    initial?.allow_late_join ?? false
  );

  // End date is fully derived from start + programme.length × 7,
  // snapshotted at save. Not user-editable.
  const endDate = startDate
    ? addDaysISO(startDate, programmeLengthUnits * 7 - 1)
    : '';
  const endDateDisplay = endDate
    ? formatDateRange(startDate, endDate).split(' – ')[1]
    : '—';

  const isDirty = (() => {
    if (isEdit && initial) {
      return (
        name !== (initial.name ?? '') ||
        startDate !== initial.start_date ||
        cohortSize !== (initial.cohort_size != null ? String(initial.cohort_size) : '') ||
        allowLateJoin !== initial.allow_late_join
      );
    }
    return (
      name !== '' ||
      startDate !== '' ||
      cohortSize !== '' ||
      allowLateJoin
    );
  })();

  // Validation
  const cohortSizeNum =
    cohortSize.trim() === '' ? null : parseInt(cohortSize, 10);
  const isCohortSizeValid =
    cohortSizeNum === null ||
    (Number.isInteger(cohortSizeNum) && cohortSizeNum > 0);
  const isFormValid = Boolean(startDate) && isCohortSizeValid;
  const startEmpty = startDate.trim() === '';

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
      setTriedSubmit(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const input = {
        name: name.trim() || null,
        start_date: startDate,
        end_date: endDate,
        cohort_size: cohortSizeNum,
        allow_late_join: allowLateJoin,
      };
      const result =
        props.mode === 'create'
          ? await createCohortAction(props.programmeId, input)
          : await editCohortAction(props.cohortId, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onClose();
      router.refresh();
    });
  }

  const eyebrow = isEdit ? 'Edit cohort' : 'New cohort';
  const headerTitle = isEdit ? initial?.name || 'Edit cohort' : 'Add a cohort';
  const submitText = isPending
    ? isEdit
      ? 'Saving…'
      : 'Creating…'
    : isEdit
      ? 'Save changes'
      : 'Create cohort';

  // Portal to <body>: this modal is rendered inside a programme card (the
  // "+ Add first cohort" affordance), so without this its fixed overlay is
  // trapped in the card's stacking context — sibling cards paint over it and
  // steal clicks. document is always present (mounts only on a client click).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={eyebrow}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal">
          <header className="prog-modal-header">
            <div>
              <p className="prog-modal-eyebrow">{eyebrow}</p>
              <h2 className="prog-modal-title">{headerTitle}</h2>
            </div>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={attemptClose}
              disabled={isPending}
            >
              <ProgIcon name="x" size={18} />
            </button>
          </header>

          <div className="prog-modal-body">
            {triedSubmit && startEmpty && (
              <div className="prog-error-banner" role="alert">
                <ProgIcon name="alert" size={15} />
                <span>
                  Pick a start date before you can {isEdit ? 'save' : 'create'}{' '}
                  this cohort.
                </span>
              </div>
            )}

            <section className="prog-form-section">
              <label className="prog-field">
                <span className="prog-field-label">Cohort name</span>
                <input
                  type="text"
                  className="prog-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  autoFocus
                  placeholder="e.g. September Intensive · Cohort A"
                />
                <span className="prog-field-help">
                  Optional — leave blank to auto-generate from dates
                  (&ldquo;5 Jan – 27 Mar 2027&rdquo;).
                </span>
              </label>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">
                    Start date <span className="prog-required">*</span>
                  </span>
                  <input
                    type="date"
                    className={
                      'prog-input' + (triedSubmit && startEmpty ? ' is-invalid' : '')
                    }
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={isPending}
                  />
                </label>

                <div className="prog-field">
                  <span className="prog-field-label">End date</span>
                  <div className="prog-readout">
                    <ProgIcon name="check" size={14} />
                    {startDate ? (
                      <span>
                        <b>{endDateDisplay}</b>
                      </span>
                    ) : (
                      <span>auto: {programmeLengthUnits} weeks after start</span>
                    )}
                  </div>
                  <span className="prog-field-help">
                    Derived from the programme&rsquo;s {programmeLengthUnits}-week
                    length.
                  </span>
                </div>
              </div>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">Cohort size</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="prog-input"
                    placeholder="No cap"
                    value={cohortSize}
                    onChange={(e) => setCohortSize(e.target.value)}
                    disabled={isPending}
                  />
                  <span className="prog-field-help">Blank = no cap.</span>
                </label>

                <div className="prog-field">
                  <span className="prog-field-label">Allow late joiners</span>
                  <div className="prog-switch-inline">
                    <Switch
                      on={allowLateJoin}
                      onChange={setAllowLateJoin}
                      disabled={isPending}
                      ariaLabel="Allow late joiners"
                    />
                    <span className="prog-switch-label">
                      {allowLateJoin ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <span className="prog-field-help">
                    Let students enrol after the start date.
                  </span>
                </div>
              </div>
            </section>
          </div>

          <footer className="prog-modal-footer">
            <span className="prog-modal-footer-note">
              <ProgIcon name="info" size={13} /> End date follows the programme
              length.
            </span>
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
              disabled={isPending || (isEdit && !isDirty)}
            >
              {isPending && <span className="prog-spinner" />}
              {submitText}
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
    </>,
    document.body,
  );
}
