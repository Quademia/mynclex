// mynclex/lib/cohorts/cohort-form-modal.tsx
//
// Create-cohort form modal (slice 9.2b). The same component will
// power the +New cohort flow on the Cohorts tab, the "+ Add first
// cohort" affordance on the programme card, and (in 9.2c) the
// edit-cohort flow.
//
// One section, four field rows:
//   • Name override (optional — blank → UI auto-generates from dates)
//   • Start date + End date (end is *derived* from start +
//     programme.length_units × 7, snapshotted on save — see 9.2b
//     planning conversation: tutors who need a different timeline
//     edit the programme, not the cohort. Editable end-date is
//     a deferred product question.)
//   • Cohort size (optional — blank = no cap)
//   • Allow late join (toggle, default OFF)
//
// Mirrors ProgrammeFormModal's discard-confirm + ESC + error-toast
// pattern for visual + behavioural consistency.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createCohortAction } from './actions';
import { formatDateRange } from './format';

type CohortFormModalProps = {
  programmeId: string;
  programmeLengthUnits: number;
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

export function CohortFormModal({
  programmeId,
  programmeLengthUnits,
  onClose,
}: CohortFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [cohortSize, setCohortSize] = useState('');
  const [allowLateJoin, setAllowLateJoin] = useState(false);

  // End date is fully derived from start + programme.length × 7,
  // snapshotted onto the cohort row at create-time. Not editable —
  // tutors who need a different timeline change the programme.
  const endDate = startDate
    ? addDaysISO(startDate, programmeLengthUnits * 7 - 1)
    : '';
  const endDateDisplay = endDate
    ? formatDateRange(startDate, endDate).split(' – ')[1]
    : '—';

  const isDirty =
    name !== '' ||
    startDate !== '' ||
    cohortSize !== '' ||
    allowLateJoin;

  // Validation — only start date and size are user-controlled now.
  const cohortSizeNum =
    cohortSize.trim() === '' ? null : parseInt(cohortSize, 10);
  const isCohortSizeValid =
    cohortSizeNum === null ||
    (Number.isInteger(cohortSizeNum) && cohortSizeNum > 0);
  const isFormValid = Boolean(startDate) && isCohortSizeValid;

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
    if (!isFormValid) {
      setError('Pick a start date.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createCohortAction(programmeId, {
        name: name.trim() || null,
        start_date: startDate,
        end_date: endDate,
        cohort_size: cohortSizeNum,
        allow_late_join: allowLateJoin,
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
        aria-label="New cohort"
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">New cohort</h2>
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
                <span className="prog-field-label">Cohort name</span>
                <input
                  type="text"
                  className="prog-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  autoFocus
                />
                <span className="prog-field-help">
                  Leave blank to auto-generate from dates
                  (&ldquo;5 Jan – 27 Mar 2027&rdquo;). Override with names
                  like &ldquo;Weekend Intensive&rdquo; if useful.
                </span>
              </label>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">
                    Start date <span className="prog-required">*</span>
                  </span>
                  <input
                    type="date"
                    className="prog-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={isPending}
                  />
                </label>

                <div className="prog-field">
                  <span className="prog-field-label">End date</span>
                  <div className="cohort-end-date-readout">{endDateDisplay}</div>
                  <span className="prog-field-help">
                    {programmeLengthUnits} weeks after start. To change
                    this, edit the programme&apos;s length.
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
                  <span className="prog-field-label">Late joiners</span>
                  <label className="prog-toggle prog-toggle-inline">
                    <input
                      type="checkbox"
                      checked={allowLateJoin}
                      onChange={(e) => setAllowLateJoin(e.target.checked)}
                      disabled={isPending}
                    />
                    <span>Allow enrolment after start date</span>
                  </label>
                  <span className="prog-field-help">
                    Off → enrolment closes at start. On → you can add
                    students anytime, no platform cutoff.
                  </span>
                </div>
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
              disabled={!isFormValid || isPending}
            >
              {isPending ? 'Creating…' : 'Create cohort'}
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
            onClose();
          }}
        />
      )}
    </>
  );
}
