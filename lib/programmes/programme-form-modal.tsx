// mynclex/lib/programmes/programme-form-modal.tsx
//
// Programme form modal (slice 9.1b create + 9.1c edit). Single-scroll,
// three sections: Identity / Schedule / Pricing. Auto-fills end_date
// from start + length × 7 unless the tutor has manually edited it
// (then "custom"). Reuses existing <DiscardConfirm> + <ErrorToast>.
//
// Discriminated union on `mode` lets one component handle both
// flows: the form layout is identical, only the title, submit
// label, dirty baseline, and submit handler differ.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createProgrammeAction, editProgrammeAction } from './actions';
import type { ProgrammeFormValues } from './types';

type ProgrammeFormModalProps =
  | { mode: 'create'; onClose: () => void }
  | {
      mode: 'edit';
      programmeId: string;
      initial: ProgrammeFormValues;
      onClose: () => void;
    };

function isValidPrice(s: string): boolean {
  if (s.trim() === '') return false;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
}

function priceToMinor(s: string): number {
  return Math.round(Number(s) * 100);
}

function minorToInput(minor: number): string {
  // Display whole numbers as-is, keep the decimal only when needed.
  // Tutor sees "350" not "350.00", but "29.99" stays "29.99".
  const value = minor / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function ProgrammeFormModal(props: ProgrammeFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.initial : null;

  // Form state — pre-populated from initial values in edit mode.
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [lengthWeeks, setLengthWeeks] = useState(
    initial ? String(initial.length_weeks) : ''
  );
  const [startDate, setStartDate] = useState(initial?.start_date ?? '');
  const [endDate, setEndDate] = useState(initial?.end_date ?? '');
  // In edit mode: endDateTouched=true if existing end_date doesn't
  // match the auto-derived value. The tutor saved a custom end_date.
  const [endDateTouched, setEndDateTouched] = useState(() => {
    if (!initial) return false;
    const auto = addDaysISO(initial.start_date, initial.length_weeks * 7 - 1);
    return initial.end_date !== auto;
  });
  const [cohortSize, setCohortSize] = useState(
    initial?.cohort_size != null ? String(initial.cohort_size) : ''
  );
  const [priceGhs, setPriceGhs] = useState(
    initial ? minorToInput(initial.price_minor_ghs) : '0'
  );
  const [priceUsd, setPriceUsd] = useState(
    initial ? minorToInput(initial.price_minor_usd) : '0'
  );
  const [showPricePublicly, setShowPricePublicly] = useState(
    initial?.show_price_publicly ?? true
  );

  // Auto-fill end_date when start or length changes — but only when
  // the tutor hasn't manually edited end_date yet.
  useEffect(() => {
    if (endDateTouched) return;
    if (!startDate || !lengthWeeks) return;
    const lw = parseInt(lengthWeeks, 10);
    if (!Number.isInteger(lw) || lw < 1) return;
    setEndDate(addDaysISO(startDate, lw * 7 - 1));
  }, [startDate, lengthWeeks, endDateTouched]);

  // Dirty tracking — gates the discard-confirm dialog. In create mode
  // dirty = any deviation from blank defaults; in edit mode dirty =
  // any deviation from the initial values loaded from the row.
  const isDirty = (() => {
    if (isEdit && initial) {
      return (
        title !== initial.title ||
        tagline !== (initial.tagline ?? '') ||
        description !== (initial.description ?? '') ||
        lengthWeeks !== String(initial.length_weeks) ||
        startDate !== initial.start_date ||
        endDate !== initial.end_date ||
        cohortSize !== (initial.cohort_size != null ? String(initial.cohort_size) : '') ||
        priceToMinor(priceGhs) !== initial.price_minor_ghs ||
        priceToMinor(priceUsd) !== initial.price_minor_usd ||
        showPricePublicly !== initial.show_price_publicly
      );
    }
    return (
      title !== '' ||
      tagline !== '' ||
      description !== '' ||
      lengthWeeks !== '' ||
      startDate !== '' ||
      endDateTouched ||
      cohortSize !== '' ||
      priceGhs !== '0' ||
      priceUsd !== '0' ||
      !showPricePublicly
    );
  })();

  // Validation
  const trimmedTitle = title.trim();
  const lengthWeeksNum = parseInt(lengthWeeks, 10);
  const cohortSizeNum =
    cohortSize.trim() === '' ? null : parseInt(cohortSize, 10);
  const isCohortSizeValid =
    cohortSizeNum === null ||
    (Number.isInteger(cohortSizeNum) && cohortSizeNum > 0);
  const datesValid =
    Boolean(startDate) && Boolean(endDate) && endDate >= startDate;
  const isFormValid =
    trimmedTitle.length > 0 &&
    Number.isInteger(lengthWeeksNum) &&
    lengthWeeksNum >= 1 &&
    lengthWeeksNum <= 52 &&
    datesValid &&
    isValidPrice(priceGhs) &&
    isValidPrice(priceUsd) &&
    isCohortSizeValid;

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else props.onClose();
  }

  // ESC closes (with discard guard)
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
      const input = {
        title: trimmedTitle,
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        length_weeks: lengthWeeksNum,
        start_date: startDate,
        end_date: endDate,
        cohort_size: cohortSizeNum,
        price_minor_ghs: priceToMinor(priceGhs),
        price_minor_usd: priceToMinor(priceUsd),
        show_price_publicly: showPricePublicly,
      };
      const result = isEdit
        ? await editProgrammeAction(props.programmeId, input)
        : await createProgrammeAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onClose();
      router.refresh();
    });
  }

  const modalTitle = isEdit ? 'Edit programme' : 'New programme';
  const submitLabel = isEdit
    ? isPending
      ? 'Saving…'
      : 'Save changes'
    : isPending
      ? 'Creating…'
      : 'Create programme';

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
                <span className="prog-field-label">Tagline</span>
                <input
                  type="text"
                  className="prog-input"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  disabled={isPending}
                />
                <span className="prog-field-help">
                  One-liner for the public card.
                </span>
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Description</span>
                <textarea
                  className="prog-textarea"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isPending}
                />
                <span className="prog-field-help">
                  Long copy for the public detail page. Mention &ldquo;free&rdquo; here if price is 0.
                </span>
              </label>
            </section>

            {/* SCHEDULE */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Schedule</h3>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">
                    Length in weeks <span className="prog-required">*</span>
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={52}
                    className="prog-input"
                    value={lengthWeeks}
                    onChange={(e) => setLengthWeeks(e.target.value)}
                    disabled={isPending}
                  />
                </label>

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
              </div>

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

                <label className="prog-field">
                  <span className="prog-field-label">
                    End date <span className="prog-required">*</span>
                  </span>
                  <input
                    type="date"
                    className="prog-input"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setEndDateTouched(true);
                    }}
                    disabled={isPending}
                  />
                  <span className="prog-field-help">
                    {endDateTouched
                      ? 'Custom — extends bank access beyond the curriculum.'
                      : 'Auto-fills from start + length × 7. Edit to extend bank access.'}
                  </span>
                </label>
              </div>
            </section>

            {/* PRICING */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Pricing</h3>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">
                    Price (GHS) <span className="prog-required">*</span>
                  </span>
                  <div className="prog-price-input">
                    <span className="prog-price-prefix">₵</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className="prog-input prog-input-price"
                      value={priceGhs}
                      onChange={(e) => setPriceGhs(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </label>

                <label className="prog-field">
                  <span className="prog-field-label">
                    Price (USD) <span className="prog-required">*</span>
                  </span>
                  <div className="prog-price-input">
                    <span className="prog-price-prefix">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className="prog-input prog-input-price"
                      value={priceUsd}
                      onChange={(e) => setPriceUsd(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </label>
              </div>
              <span className="prog-field-help">0 = free.</span>

              <label className="prog-toggle">
                <input
                  type="checkbox"
                  checked={showPricePublicly}
                  onChange={(e) => setShowPricePublicly(e.target.checked)}
                  disabled={isPending}
                />
                <span>Show price on the public listing</span>
              </label>
              <span className="prog-field-help prog-toggle-help">
                Off → &ldquo;Contact&rdquo; button shown instead.
              </span>
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
