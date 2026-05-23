// mynclex/lib/programmes/programme-form-modal.tsx
//
// Programme form modal — create + edit. Slice 9.2a reshape:
//
// * Schedule section dropped (Start / End / Cohort size moved to
//   the cohort modal in 9.2b — no cohort modal exists yet, so
//   creating a new programme produces a programme without a cohort
//   until 9.2b ships).
// * New Shape section with Delivery mode + Unit label + Length.
//   - Delivery mode (TUTOR_LED / SELF_PACED) is create-only;
//     the field is disabled in edit mode.
//   - Unit label smart-default flips with delivery mode at
//     create-time (TUTOR_LED → WEEK, SELF_PACED → MODULE) unless
//     the tutor has manually picked one.
//   - Length label flips with unit_label ("Length in weeks" vs
//     "Number of modules"). Limit stays 1–52 from the DB CHECK.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ProgrammeLengthDecreaseConfirm } from '@/lib/overlays/programmes/programme-length-decrease-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createProgrammeAction, editProgrammeAction } from './actions';
import type {
  Currency,
  DeliveryMode,
  PaymentCollectionMode,
  ProgrammeFormValues,
  UnitLabel,
} from './types';

// Mirrors the DecreaseImpact shape returned by editProgrammeAction's
// `requiresConfirm` result. Kept inline so the modal doesn't need to
// re-export the type from actions.ts.
type DecreaseImpact = {
  units: number;
  blocks: number;
  activities: number;
  affectedUnitIndices: number[];
};

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

function defaultUnitLabelFor(mode: DeliveryMode): UnitLabel {
  return mode === 'TUTOR_LED' ? 'WEEK' : 'MODULE';
}

// Self-paced students self-serve through on-platform checkout (no
// cohort, no tutor mediation); tutor-led defaults to the tutor
// collecting off-platform. Smart default only — not hard-enforced in
// v1 (on-platform checkout lands in Slice 5).
function defaultCollectionFor(mode: DeliveryMode): PaymentCollectionMode {
  return mode === 'SELF_PACED' ? 'ON_PLATFORM' : 'OFF_PLATFORM';
}

export function ProgrammeFormModal(props: ProgrammeFormModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  // Slice 9.1d — length-decrease confirmation. When the server
  // action returns `requiresConfirm` (tutor shrank length_units
  // and the trailing units carry content), pendingDecrease holds
  // the impact summary and the overlay renders below. The tutor
  // types DELETE; on confirm, the modal re-fires the save with
  // confirmDestructive=true.
  const [pendingDecrease, setPendingDecrease] = useState<DecreaseImpact | null>(null);
  const [decreaseConfirmText, setDecreaseConfirmText] = useState('');

  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.initial : null;

  // Form state — pre-populated from initial values in edit mode.
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    initial?.delivery_mode ?? 'TUTOR_LED'
  );
  const [unitLabel, setUnitLabel] = useState<UnitLabel>(
    initial?.unit_label ?? 'WEEK'
  );
  // In create mode: track whether the tutor has manually picked a
  // unit label. If not, the smart default follows delivery_mode.
  // In edit mode: locked to "touched" — never auto-flip an existing
  // programme's label silently.
  const [unitLabelTouched, setUnitLabelTouched] = useState(isEdit);
  const [lengthUnits, setLengthUnits] = useState(
    initial ? String(initial.length_units) : ''
  );
  const [currency, setCurrency] = useState<Currency>(
    initial?.price_currency ?? 'GHS'
  );
  // Initial value is the programme's canonical full price — read from the
  // UPFRONT_FULL plan row (slice 7e replaced the legacy price_minor column).
  const [price, setPrice] = useState(
    initial ? minorToInput(initial.upfront_total_minor) : '0'
  );
  const [showPricePublicly, setShowPricePublicly] = useState(
    initial?.show_price_publicly ?? true
  );
  const [collectionMode, setCollectionMode] = useState<PaymentCollectionMode>(
    initial?.payment_collection_mode ?? 'OFF_PLATFORM'
  );
  // Smart default tracking, same shape as unitLabelTouched: in create
  // mode the collection mode follows delivery_mode until the tutor
  // picks one; in edit mode it's locked to the loaded value.
  const [collectionModeTouched, setCollectionModeTouched] = useState(isEdit);
  // Access window in days; empty string = lifetime (NULL).
  const [accessWindowDays, setAccessWindowDays] = useState(
    initial?.access_window_days != null ? String(initial.access_window_days) : ''
  );

  // Smart default: when delivery_mode changes in create mode AND
  // tutor hasn't manually picked a label yet, flip the label.
  useEffect(() => {
    if (unitLabelTouched) return;
    setUnitLabel(defaultUnitLabelFor(deliveryMode));
  }, [deliveryMode, unitLabelTouched]);

  useEffect(() => {
    if (collectionModeTouched) return;
    setCollectionMode(defaultCollectionFor(deliveryMode));
  }, [deliveryMode, collectionModeTouched]);

  // Dirty tracking — gates the discard-confirm dialog. In create mode
  // dirty = any deviation from blank defaults; in edit mode dirty =
  // any deviation from the initial values loaded from the row.
  const isDirty = (() => {
    if (isEdit && initial) {
      return (
        title !== initial.title ||
        tagline !== (initial.tagline ?? '') ||
        description !== (initial.description ?? '') ||
        deliveryMode !== initial.delivery_mode ||
        unitLabel !== initial.unit_label ||
        lengthUnits !== String(initial.length_units) ||
        currency !== initial.price_currency ||
        priceToMinor(price) !== initial.upfront_total_minor ||
        showPricePublicly !== initial.show_price_publicly ||
        collectionMode !== initial.payment_collection_mode ||
        accessWindowDays !==
          (initial.access_window_days != null
            ? String(initial.access_window_days)
            : '')
      );
    }
    return (
      title !== '' ||
      tagline !== '' ||
      description !== '' ||
      deliveryMode !== 'TUTOR_LED' ||
      unitLabelTouched ||
      lengthUnits !== '' ||
      currency !== 'GHS' ||
      price !== '0' ||
      !showPricePublicly ||
      collectionModeTouched ||
      accessWindowDays !== ''
    );
  })();

  // Validation
  const trimmedTitle = title.trim();
  const lengthUnitsNum = parseInt(lengthUnits, 10);
  const accessWindowValid =
    accessWindowDays.trim() === '' ||
    (Number.isInteger(Number(accessWindowDays)) && Number(accessWindowDays) >= 1);
  const isFormValid =
    trimmedTitle.length > 0 &&
    Number.isInteger(lengthUnitsNum) &&
    lengthUnitsNum >= 1 &&
    lengthUnitsNum <= 52 &&
    isValidPrice(price) &&
    accessWindowValid;

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

  function handleSubmit(confirmDestructive: boolean = false) {
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
        delivery_mode: deliveryMode,
        unit_label: unitLabel,
        length_units: lengthUnitsNum,
        price_currency: currency,
        upfront_total_minor: priceToMinor(price),
        show_price_publicly: showPricePublicly,
        payment_collection_mode: collectionMode,
        access_window_days:
          accessWindowDays.trim() === '' ? null : Number(accessWindowDays),
      };
      const result = isEdit
        ? await editProgrammeAction(props.programmeId, input, confirmDestructive)
        : await createProgrammeAction(input);
      if (result.ok) {
        // Both branches succeeded — close everything and refresh.
        setPendingDecrease(null);
        setDecreaseConfirmText('');
        props.onClose();
        router.refresh();
        return;
      }
      // Length-decrease preflight tripped — surface the confirm
      // overlay with the impact summary instead of a toast.
      if ('requiresConfirm' in result && result.requiresConfirm) {
        setPendingDecrease(result.impact);
        setDecreaseConfirmText('');
        return;
      }
      // Remaining branch: regular validation/server error.
      if ('error' in result) {
        setError(result.error);
      }
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

  // Label strings flip with unit_label.
  const lengthFieldLabel =
    unitLabel === 'WEEK' ? 'Length in weeks' : 'Number of modules';
  const lengthFieldHelp =
    unitLabel === 'WEEK'
      ? 'How many weeks of curriculum.'
      : 'How many modules of curriculum.';

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

            {/* SHAPE */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Shape</h3>

              <label className="prog-field">
                <span className="prog-field-label">
                  Delivery mode <span className="prog-required">*</span>
                </span>
                <select
                  className="prog-input"
                  value={deliveryMode}
                  onChange={(e) =>
                    setDeliveryMode(e.target.value as DeliveryMode)
                  }
                  disabled={isPending || isEdit}
                >
                  <option value="TUTOR_LED">Tutor-led (cohorts)</option>
                  <option value="SELF_PACED">Self-paced (no cohorts)</option>
                </select>
                <span className="prog-field-help">
                  {isEdit
                    ? 'Delivery mode is set at create-time and can’t be changed.'
                    : deliveryMode === 'TUTOR_LED'
                      ? 'Students enrol per cohort with shared start/end dates.'
                      : 'Students enrol directly and progress at their own pace.'}
                </span>
              </label>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">
                    Unit label <span className="prog-required">*</span>
                  </span>
                  <select
                    className="prog-input"
                    value={unitLabel}
                    onChange={(e) => {
                      setUnitLabel(e.target.value as UnitLabel);
                      setUnitLabelTouched(true);
                    }}
                    disabled={isPending}
                  >
                    <option value="WEEK">Weeks</option>
                    <option value="MODULE">Modules</option>
                  </select>
                  <span className="prog-field-help">
                    Renders curriculum units as &ldquo;Week N&rdquo; or
                    &ldquo;Module N&rdquo;.
                  </span>
                </label>

                <label className="prog-field">
                  <span className="prog-field-label">
                    {lengthFieldLabel} <span className="prog-required">*</span>
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={52}
                    className="prog-input"
                    value={lengthUnits}
                    onChange={(e) => setLengthUnits(e.target.value)}
                    disabled={isPending}
                  />
                  <span className="prog-field-help">{lengthFieldHelp}</span>
                </label>
              </div>
            </section>

            {/* PRICING */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Pricing</h3>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">
                    Currency <span className="prog-required">*</span>
                  </span>
                  <select
                    className="prog-input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    disabled={isPending}
                  >
                    <option value="GHS">GHS (₵)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                  <span className="prog-field-help">
                    The single currency you collect in. Students browsing in
                    another currency see an approximate equivalent later.
                  </span>
                </label>

                <label className="prog-field">
                  <span className="prog-field-label">
                    Price <span className="prog-required">*</span>
                  </span>
                  <div className="prog-price-input">
                    <span className="prog-price-prefix">
                      {currency === 'GHS' ? '₵' : '$'}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className="prog-input prog-input-price"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <span className="prog-field-help">0 = free.</span>
                </label>
              </div>

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

            {/* ACCESS & COLLECTION */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Access &amp; collection</h3>

              <div className="prog-field-row">
                <label className="prog-field">
                  <span className="prog-field-label">Online checkout</span>
                  <select
                    className="prog-input"
                    value={collectionMode}
                    onChange={(e) => {
                      setCollectionMode(
                        e.target.value as PaymentCollectionMode
                      );
                      setCollectionModeTouched(true);
                    }}
                    disabled={isPending}
                  >
                    <option value="ON_PLATFORM">
                      On — show a Paystack &ldquo;Pay &amp; enrol&rdquo; button
                    </option>
                    <option value="OFF_PLATFORM">
                      Off — enrol students manually
                    </option>
                  </select>
                  <span className="prog-field-help">
                    Controls only the public page&rsquo;s online checkout
                    button. You can always add students by hand from your
                    roster either way. (Online checkout goes live in a later
                    release.)
                  </span>
                </label>

                <label className="prog-field">
                  <span className="prog-field-label">Access window (days)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="prog-input"
                    placeholder="Lifetime"
                    value={accessWindowDays}
                    onChange={(e) => setAccessWindowDays(e.target.value)}
                    disabled={isPending}
                  />
                  <span className="prog-field-help">
                    How long a student keeps access after enrolling. Blank =
                    lifetime (while your subscription stays active).
                  </span>
                </label>
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
              onClick={() => handleSubmit(false)}
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

      {pendingDecrease && (
        <ProgrammeLengthDecreaseConfirm
          affectedUnitIndices={pendingDecrease.affectedUnitIndices}
          blocks={pendingDecrease.blocks}
          activities={pendingDecrease.activities}
          unitLabel={unitLabel}
          deleteText={decreaseConfirmText}
          pending={isPending}
          onTextChange={setDecreaseConfirmText}
          onCancel={() => {
            if (isPending) return;
            setPendingDecrease(null);
            setDecreaseConfirmText('');
          }}
          onConfirm={() => handleSubmit(true)}
        />
      )}
    </>
  );
}
