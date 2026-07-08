// mynclex/lib/products/product-form-modal.tsx
//
// One form modal for BOTH creating a product and editing one (the
// PackFormModal pattern). Create is two-step: pick the type, then fill
// the form — the type is fixed for the product's whole life, so it gets
// its own deliberate step.
//
// IDENTITY vs EDITABLE is the organising idea:
//   • identity — slug, type, duration — set at creation, then rendered
//     LOCKED with the padlock. Changing what a product grants under
//     rows that already bought it is the thing this page must not allow.
//   • everything else — name, prices, "was" prices, credits, order —
//     editable forever, because a catalogue edit only ever affects
//     FUTURE buyers (grants freeze at activation; readiness-packs.md §7).
//
// Validation is advise > block. The Save button is disabled only for
// the structurally broken; the amber lines below save happily.

'use client';

import { useState, useTransition } from 'react';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createProductAction, updateProductAction } from './actions';
import {
  MAX_DISCOUNT_PCT,
  MIN_DISCOUNT_PCT,
  fullPriceForDiscount,
  minorToInput,
  parseMoneyToMinor,
  percentOff,
} from './money';
import type { PackType, ProductRow } from './types';

const TYPE_LABEL: Record<PackType, string> = {
  BANK_DURATION: 'Bank duration pass',
  READINESS:     'Readiness pack',
};

const SLUG_PATTERN = /^[A-Z][A-Z0-9_]{2,39}$/;

export function ProductFormModal({
  product,
  packCount,
  hasTrial,
  onClose,
  onSaved,
}: {
  /** Present = edit mode; absent = create mode. */
  product?:  ProductRow;
  /** Live readiness-pack count — drives the unspendable-credits advisory. */
  packCount: number;
  /** A trial already exists → the create form can't make another. */
  hasTrial:  boolean;
  onClose:   () => void;
  onSaved:   () => void;
}) {
  const isEdit = Boolean(product);

  // Create: null until the type step is answered. Edit: the row's type.
  const [packType, setPackType] = useState<PackType | null>(product?.pack_type ?? null);
  const [isTrial, setIsTrial]   = useState(product?.kind === 'TRIAL');

  const [slug, setSlug]         = useState(product?.product_id ?? '');
  const [name, setName]         = useState(product?.name ?? '');
  const [days, setDays]         = useState<number | ''>(product?.duration_days ?? '');
  const [credits, setCredits]   = useState<number | ''>(product?.readiness_credits ?? 0);
  const [priceGhs, setPriceGhs] = useState(minorToInput(product?.price_minor_ghs ?? 0));
  const [priceUsd, setPriceUsd] = useState(minorToInput(product?.price_minor_usd ?? 0));
  const [fullGhs, setFullGhs]   = useState(minorToInput(product?.full_price_minor_ghs ?? null));
  const [fullUsd, setFullUsd]   = useState(minorToInput(product?.full_price_minor_usd ?? null));
  const [sortOrder, setSort]    = useState<number | ''>(product?.sort_order ?? 0);

  // Offer helper: a generator, never stored. Fills both full-price boxes
  // from one discount so the two currencies show the SAME % (they only
  // agree when the full:price multiplier is shared — our GHS column is
  // regionally priced, not FX-converted).
  const [discount, setDiscount] = useState<number | ''>('');

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Type step (create only) ────────────────────────────────────────
  if (!packType) {
    return (
      <ModalFrame title="New product" onClose={onClose}>
        <p className="pr-modal-lede">
          What kind of product is this? The type is fixed once the product
          exists, so choose deliberately.
        </p>
        <div className="pr-type-picker">
          <button type="button" onClick={() => { setPackType('BANK_DURATION'); setIsTrial(false); }}>
            <span className="pr-type-name">Bank duration pass</span>
            <span className="pr-type-desc">Timed access to the full question bank (e.g. 90 days).</span>
          </button>
          <button type="button" onClick={() => { setPackType('READINESS'); setIsTrial(false); setCredits(1); }}>
            <span className="pr-type-name">Readiness pack</span>
            <span className="pr-type-desc">One-shot curated mock exams, sold as an assessment.</span>
          </button>
          <button
            type="button"
            disabled={hasTrial}
            onClick={() => { setPackType('BANK_DURATION'); setIsTrial(true); setPriceGhs('0'); setPriceUsd('0'); }}
          >
            <span className="pr-type-name">Free trial</span>
            <span className="pr-type-desc">
              {hasTrial
                ? 'A trial already exists — there can only be one.'
                : 'A no-cost, time-limited taste of the bank. (A bank pass that costs nothing.)'}
            </span>
          </button>
        </div>
        <div className="pr-form-actions">
          <button type="button" className="rp-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </ModalFrame>
    );
  }

  const isBank      = packType === 'BANK_DURATION';
  const isReadiness = packType === 'READINESS';
  const isPaid      = !isTrial;

  // ── Structural blocks (Save disabled) ──────────────────────────────
  const slugOk       = isEdit || SLUG_PATTERN.test(slug.trim().toUpperCase());
  const nameOk       = name.trim().length > 0;
  const daysOk       = !isBank || (typeof days === 'number' && days >= 1);
  const creditsOk    = typeof credits === 'number' && credits >= 0 && (!isReadiness || credits >= 1);
  const sortOk       = typeof sortOrder === 'number' && sortOrder >= 0;

  const priceGhsParse = parseMoneyToMinor(priceGhs, { allowBlank: true });
  const priceUsdParse = parseMoneyToMinor(priceUsd, { allowBlank: true });
  const fullGhsParse  = fullGhs.trim() === '' ? null : parseMoneyToMinor(fullGhs);
  const fullUsdParse  = fullUsd.trim() === '' ? null : parseMoneyToMinor(fullUsd);

  const fullGhsBad =
    fullGhsParse !== null &&
    (!fullGhsParse.ok || (priceGhsParse.ok && fullGhsParse.minor <= priceGhsParse.minor));
  const fullUsdBad =
    fullUsdParse !== null &&
    (!fullUsdParse.ok || (priceUsdParse.ok && fullUsdParse.minor <= priceUsdParse.minor));

  const blocked =
    !slugOk || !nameOk || !daysOk || !creditsOk || !sortOk ||
    !priceGhsParse.ok || !priceUsdParse.ok || fullGhsBad || fullUsdBad;

  // ── Amber advisories (save anyway) ─────────────────────────────────
  const zeroPrice =
    isPaid &&
    priceGhsParse.ok && priceUsdParse.ok &&
    (priceGhsParse.minor === 0 || priceUsdParse.minor === 0);
  const creditsExceedPacks =
    typeof credits === 'number' && credits > packCount;

  // Live readout: what discount do the CURRENT numbers actually show?
  // Survives hand-edits and later price changes — the helper generates,
  // this tells the truth afterwards.
  const liveGhsOff =
    priceGhsParse.ok && fullGhsParse?.ok ? percentOff(priceGhsParse.minor, fullGhsParse.minor) : null;
  const liveUsdOff =
    priceUsdParse.ok && fullUsdParse?.ok ? percentOff(priceUsdParse.minor, fullUsdParse.minor) : null;
  const offersDiverge =
    liveGhsOff !== null && liveUsdOff !== null && liveGhsOff !== liveUsdOff;

  const applyDiscount = (pct: number) => {
    if (!priceGhsParse.ok || !priceUsdParse.ok) return;
    const g = fullPriceForDiscount(priceGhsParse.minor, pct);
    const u = fullPriceForDiscount(priceUsdParse.minor, pct);
    // A zero-priced currency (the trial) yields null — leave it blank.
    setFullGhs(g === null ? '' : minorToInput(g));
    setFullUsd(u === null ? '' : minorToInput(u));
  };

  const clearOffer = () => {
    setFullGhs('');
    setFullUsd('');
    setDiscount('');
  };

  const helperUsable =
    priceGhsParse.ok && priceUsdParse.ok &&
    (priceGhsParse.minor > 0 || priceUsdParse.minor > 0);
  const discountValid =
    typeof discount === 'number' &&
    discount >= MIN_DISCOUNT_PCT && discount <= MAX_DISCOUNT_PCT;
  const hasOffer = fullGhs.trim() !== '' || fullUsd.trim() !== '';

  const submit = () => {
    const fd = new FormData();
    fd.set('product_id', isEdit ? product!.product_id : slug.trim().toUpperCase());
    fd.set('name', name.trim());
    fd.set('readiness_credits', String(credits));
    fd.set('price_ghs', priceGhs);
    fd.set('price_usd', priceUsd);
    fd.set('full_price_ghs', fullGhs);
    fd.set('full_price_usd', fullUsd);
    fd.set('sort_order', String(sortOrder));
    if (!isEdit) {
      fd.set('pack_type', packType);
      fd.set('kind', isTrial ? 'TRIAL' : 'PAID');
      if (isBank) fd.set('duration_days', String(days));
    }

    startTransition(async () => {
      const res = isEdit ? await updateProductAction(fd) : await createProductAction(fd);
      if (!res.ok) {
        setError(res.error ?? 'Save failed.');
        return;
      }
      onSaved();
    });
  };

  return (
    <ModalFrame
      title={isEdit ? 'Edit product' : `New ${isTrial ? 'free trial' : TYPE_LABEL[packType].toLowerCase()}`}
      onClose={pending ? () => {} : onClose}
    >
      {/* Identity — locked in edit mode. */}
      <div className="pr-identity">
        <div className="pr-identity-head">
          <span className="pr-identity-label">Identity</span>
          {isEdit && <span className="pr-lock">🔒 Locked</span>}
        </div>

        <div className="pr-identity-grid">
          <div>
            <label className="pr-mini-label">Type</label>
            <div className="pr-identity-value">
              {TYPE_LABEL[packType]}{isTrial && ' · free trial'}
            </div>
          </div>

          <div>
            <label className="pr-mini-label">Product ID</label>
            {isEdit ? (
              <div className="pr-identity-value pr-mono">{product!.product_id}</div>
            ) : (
              <input
                className="pr-mono"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toUpperCase())}
                placeholder="BANK_120D"
                disabled={pending}
                autoFocus
              />
            )}
          </div>

          {isBank && (
            <div>
              <label className="pr-mini-label">Duration (days)</label>
              {isEdit ? (
                <div className="pr-identity-value">{product!.duration_days} days</div>
              ) : (
                <input
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  disabled={pending}
                />
              )}
            </div>
          )}
        </div>

        {isEdit ? (
          <p className="pr-identity-note">
            Identity is fixed once sold — retire this product and create a new
            one to change what it grants.
          </p>
        ) : (
          !slugOk && slug.trim() !== '' && (
            <p className="pr-advice block">
              Product ID must be 3–40 characters: capitals, digits and
              underscores, starting with a letter.
            </p>
          )
        )}
      </div>

      {/* Editable */}
      <div className="pr-form-grid">
        <label className="pr-field">
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 120 days bank access"
            disabled={pending}
            autoFocus={isEdit}
          />
        </label>

        {/* Offer helper — frontend only, nothing stored. One discount
            fills BOTH full prices, which is the only way the two
            currencies can display the same % off. */}
        <div className="pr-offer-helper">
          <div className="pr-offer-head">
            <span className="pr-identity-label">Offer helper</span>
            <span className="pr-offer-note">Not saved — it just fills the full prices below.</span>
          </div>
          <div className="pr-offer-controls">
            <label className="pr-field pr-offer-pct">
              % off
              <input
                type="number"
                min={MIN_DISCOUNT_PCT}
                max={MAX_DISCOUNT_PCT}
                value={discount}
                onChange={(e) => setDiscount(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                placeholder="30"
                disabled={pending || !helperUsable}
              />
            </label>
            <button
              type="button"
              className="rp-btn-ghost"
              disabled={pending || !helperUsable || !discountValid}
              onClick={() => applyDiscount(discount as number)}
            >
              Fill full prices
            </button>
            <button
              type="button"
              className="rp-btn-ghost"
              disabled={pending || !hasOffer}
              onClick={clearOffer}
            >
              Clear offer
            </button>
          </div>
          <p className="pr-offer-explain">
            Both currencies get the same multiplier, so both show the same
            % off. Setting them by hand rarely does — our cedi prices are
            regionally set, not converted.
          </p>
        </div>

        <div className="pr-price-row">
          <label className="pr-field">
            Price (GHS ₵)
            <input
              value={priceGhs}
              onChange={(e) => setPriceGhs(e.target.value)}
              inputMode="decimal"
              placeholder="120"
              disabled={pending}
            />
            <span className="pr-hint">What the customer is charged.</span>
          </label>
          <label className="pr-field">
            Full price (₵, optional)
            <input
              value={fullGhs}
              onChange={(e) => setFullGhs(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              disabled={pending}
            />
            <span className="pr-hint">
              {liveGhsOff !== null
                ? <><strong className="pr-live-off">−{liveGhsOff}%</strong> off. Struck through on sales cards.</>
                : 'Was-price, struck through. Blank = no offer.'}
            </span>
          </label>
        </div>
        {fullGhsBad && (
          <p className="pr-advice block">
            The GHS full price must be higher than the price you charge.
          </p>
        )}
        {!priceGhsParse.ok && <p className="pr-advice block">GHS price: {priceGhsParse.error}</p>}

        <div className="pr-price-row">
          <label className="pr-field">
            Price (USD $)
            <input
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              inputMode="decimal"
              placeholder="30"
              disabled={pending}
            />
            <span className="pr-hint">What the customer is charged.</span>
          </label>
          <label className="pr-field">
            Full price ($, optional)
            <input
              value={fullUsd}
              onChange={(e) => setFullUsd(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              disabled={pending}
            />
            <span className="pr-hint">
              {liveUsdOff !== null
                ? <><strong className="pr-live-off">−{liveUsdOff}%</strong> off. Struck through on sales cards.</>
                : 'Was-price, struck through. Blank = no offer.'}
            </span>
          </label>
        </div>
        {fullUsdBad && (
          <p className="pr-advice block">
            The USD full price must be higher than the price you charge.
          </p>
        )}
        {!priceUsdParse.ok && <p className="pr-advice block">USD price: {priceUsdParse.error}</p>}

        {offersDiverge && (
          <p className="pr-advice">
            This offer is {liveGhsOff}% off in cedis but {liveUsdOff}% off in
            dollars. Deliberate regional pricing is fine — otherwise use the
            offer helper to match them.
          </p>
        )}

        {zeroPrice && (
          <p className="pr-advice">
            A paid product priced at 0 is free to buy. Save it if that&apos;s
            deliberate.
          </p>
        )}

        <div className="pr-price-row">
          <label className="pr-field">
            {isReadiness ? 'Readiness credits granted' : 'Bundled readiness credits'}
            <input
              type="number"
              min={isReadiness ? 1 : 0}
              value={credits}
              onChange={(e) => setCredits(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              disabled={pending}
            />
            <span className="pr-hint">
              {isReadiness
                ? 'How many packs this SKU lets the student claim.'
                : 'Free readiness packs included with this pass. 0 = none.'}
            </span>
          </label>
          <label className="pr-field">
            Sort order
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSort(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              disabled={pending}
            />
            <span className="pr-hint">Lower shows first.</span>
          </label>
        </div>

        {isReadiness && credits === 0 && (
          <p className="pr-advice block">
            A readiness pack SKU must grant at least 1 credit.
          </p>
        )}
        {creditsExceedPacks && (
          <p className="pr-advice">
            This grants {credits} credits but only {packCount} readiness pack
            {packCount === 1 ? '' : 's'} exist{packCount === 1 ? 's' : ''} —
            a student can&apos;t claim the same pack twice, so the extra
            credit{credits === (packCount + 1) ? '' : 's'} can never be spent.
          </p>
        )}
      </div>

      <div className="pr-form-actions">
        <button
          type="button"
          className="rp-btn-primary"
          disabled={pending || blocked}
          onClick={submit}
        >
          {pending
            ? isEdit ? 'Saving…' : 'Creating…'
            : isEdit ? 'Save changes' : 'Create product'}
        </button>
        <button type="button" className="rp-btn-ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  onClose,
  children,
}: {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rp-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rp-modal pr-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="rp-modal-head">
          <h3>{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}
