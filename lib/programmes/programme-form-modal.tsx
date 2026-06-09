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
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ProgrammeLengthDecreaseConfirm } from '@/lib/overlays/programmes/programme-length-decrease-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { Segmented, Switch } from './form-controls';
import { ProgIcon } from './prog-icon';
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
  | { mode: 'create'; deliveryMode: DeliveryMode; onClose: () => void }
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
  // Drives the inline validation banner + per-field invalid styling once
  // the tutor has tried to submit an incomplete form.
  const [triedSubmit, setTriedSubmit] = useState(false);

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

  // Delivery mode is fixed for the life of the modal: in create mode it's
  // chosen by which button opened the form (passed as a prop); in edit
  // mode it's the programme's immutable stored value. It's no longer an
  // editable field — see the Shape section (shown read-only in edit). The
  // unit-label + collection-mode smart defaults are derived from it once,
  // at init, instead of flipping reactively off a toggle.
  const deliveryMode: DeliveryMode =
    props.mode === 'edit' ? props.initial.delivery_mode : props.deliveryMode;
  const tutored = deliveryMode === 'TUTOR_LED';

  // Form state — pre-populated from initial values in edit mode.
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [unitLabel, setUnitLabel] = useState<UnitLabel>(
    initial?.unit_label ?? defaultUnitLabelFor(deliveryMode)
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
    initial?.payment_collection_mode ?? defaultCollectionFor(deliveryMode)
  );
  // Smart default tracking, same shape as unitLabelTouched: in create
  // mode the collection mode follows delivery_mode until the tutor
  // picks one; in edit mode it's locked to the loaded value.
  const [collectionModeTouched, setCollectionModeTouched] = useState(isEdit);
  // Access window in days; empty string = lifetime (NULL).
  const [accessWindowDays, setAccessWindowDays] = useState(
    initial?.access_window_days != null ? String(initial.access_window_days) : ''
  );

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
      setTriedSubmit(true);
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

  const eyebrow = isEdit
    ? 'Edit programme'
    : tutored
      ? 'New tutored programme'
      : 'New self-paced course';
  const headerTitle = isEdit ? initial?.title || 'Edit programme' : 'Create a programme';
  const submitText = isPending
    ? isEdit
      ? 'Saving…'
      : 'Creating…'
    : isEdit
      ? 'Save changes'
      : 'Create programme';

  // Label strings flip with unit_label.
  const lengthFieldLabel =
    unitLabel === 'WEEK' ? 'Length in weeks' : 'Number of modules';
  const lengthFieldHelp =
    unitLabel === 'WEEK'
      ? 'How many weeks of curriculum.'
      : 'How many modules of curriculum.';

  // Portal to <body>: the modal is rendered inside a programme card, so
  // without this its fixed overlay sits inside the card's stacking context
  // (sibling cards paint over it + intercept clicks). document is always
  // present — the modal only ever mounts on a client click.
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
            {triedSubmit && !isFormValid && (
              <div className="prog-error-banner" role="alert">
                <ProgIcon name="alert" size={15} />
                <span>
                  {trimmedTitle.length === 0
                    ? `Give your programme a title before you can ${isEdit ? 'save' : 'create'} it.`
                    : 'Check the highlighted fields before you continue.'}
                </span>
              </div>
            )}

            {/* IDENTITY */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Identity</h3>

              <label className="prog-field">
                <span className="prog-field-label">
                  Title <span className="prog-required">*</span>
                </span>
                <input
                  type="text"
                  className={
                    'prog-input' +
                    (triedSubmit && trimmedTitle.length === 0 ? ' is-invalid' : '')
                  }
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

              {/* Delivery mode is no longer an editable field — it's chosen
                  by which create button was clicked (create) or locked to
                  the stored value (edit). Shown read-only in edit so the
                  tutor can see what they're working on. */}
              {isEdit && (
                <div className="prog-field">
                  <span className="prog-field-label">Delivery mode</span>
                  <div className="prog-readout">
                    <ProgIcon
                      name={tutored ? 'users' : 'zap'}
                      size={14}
                    />
                    <b>{tutored ? 'Tutor-led' : 'Self-paced'}</b>
                    <span className="prog-readout-note">· set at creation</span>
                  </div>
                </div>
              )}

              <div className="prog-field-row">
                <div className="prog-field">
                  <span className="prog-field-label">
                    Unit label <span className="prog-required">*</span>
                  </span>
                  <Segmented<UnitLabel>
                    value={unitLabel}
                    onChange={(v) => {
                      setUnitLabel(v);
                      setUnitLabelTouched(true);
                    }}
                    disabled={isPending}
                    ariaLabel="Unit label"
                    options={[
                      { value: 'WEEK', label: 'Weeks' },
                      { value: 'MODULE', label: 'Modules' },
                    ]}
                  />
                  <span className="prog-field-help">
                    Renders curriculum units as &ldquo;Week N&rdquo; or
                    &ldquo;Module N&rdquo;.
                  </span>
                </div>

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
                <div className="prog-field">
                  <span className="prog-field-label">
                    Currency <span className="prog-required">*</span>
                  </span>
                  <Segmented<Currency>
                    value={currency}
                    onChange={setCurrency}
                    disabled={isPending}
                    ariaLabel="Currency"
                    options={[
                      { value: 'GHS', label: 'GHS ₵' },
                      { value: 'USD', label: 'USD $' },
                    ]}
                  />
                  <span className="prog-field-help">
                    The single currency you collect in. Students browsing in
                    another currency see an approximate equivalent later.
                  </span>
                </div>

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

              <div className="prog-switch-field">
                <div className="prog-switch-text">
                  <span className="prog-switch-label">Show price on the public listing</span>
                  <span className="prog-switch-help">
                    When off, students see a &ldquo;Contact&rdquo; button instead.
                  </span>
                </div>
                <Switch
                  on={showPricePublicly}
                  onChange={setShowPricePublicly}
                  disabled={isPending}
                  ariaLabel="Show price on the public listing"
                />
              </div>
            </section>

            {/* ACCESS & COLLECTION */}
            <section className="prog-form-section">
              <h3 className="prog-form-section-title">Access &amp; collection</h3>

              <div className="prog-switch-field">
                <div className="prog-switch-text">
                  <span className="prog-switch-label">Online checkout</span>
                  <span className="prog-switch-help">
                    On → a Paystack &ldquo;Pay &amp; enrol&rdquo; button on the
                    public page. Off → you enrol students manually. You can add
                    students by hand either way. (Goes live in a later release.)
                  </span>
                </div>
                <Switch
                  on={collectionMode === 'ON_PLATFORM'}
                  onChange={(on) => {
                    setCollectionMode(on ? 'ON_PLATFORM' : 'OFF_PLATFORM');
                    setCollectionModeTouched(true);
                  }}
                  disabled={isPending}
                  ariaLabel="Online checkout"
                />
              </div>

              <label className="prog-field" style={{ marginTop: '14px' }}>
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
            </section>
          </div>

          <footer className="prog-modal-footer">
            <span className="prog-modal-footer-note">
              <ProgIcon name="info" size={13} /> Changes save when you{' '}
              {isEdit ? 'update' : 'create'}.
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
              onClick={() => handleSubmit(false)}
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
    </>,
    document.body,
  );
}
