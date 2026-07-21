// mynclex/lib/products/catalogue-view.tsx
//
// Client host for the admin Products & Pricing page: the grouped
// catalogue plus the create/edit modal and the retire dialog (all three
// share "which product am I acting on" state).
//
// TWO groups, not three (settled 2026-07-08): the trial is a
// BANK_DURATION pass that costs nothing, so it sits with the bank
// tiers wearing a "Free" pill — pack_type says what a product grants,
// kind says whether you pay. See migration 20260724120000.
//
// Desktop renders rows, ≤768px renders cards (same data, CSS-swapped).
// Archived products stay in place, dimmed — payments reference them
// forever, so they are never hidden and never deletable.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import { ProductRetireConfirm } from '@/lib/overlays/products/retire-confirm';
import { ProductFormModal } from './product-form-modal';
import { setProductStatusAction } from './actions';
import { formatMinor, percentOff, type Currency } from './money';
import { perPackMinor } from './savings';
import type { ProductRow } from './types';

export function CatalogueView({
  products,
  packCount,
}: {
  products:  ProductRow[];
  packCount: number;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing]   = useState<ProductRow | null>(null);
  const [retiring, setRetiring] = useState<ProductRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasTrial = products.some((p) => p.kind === 'TRIAL');

  const bank      = products.filter((p) => p.pack_type === 'BANK_DURATION');
  const readiness = products.filter((p) => p.pack_type === 'READINESS');

  const flipStatus = (product: ProductRow, next: 'ACTIVE' | 'ARCHIVED') => {
    startTransition(async () => {
      const res = await setProductStatusAction(product.product_id, next);
      if (!res.ok) {
        setError(res.error ?? 'Could not update the product.');
        return;
      }
      setRetiring(null);
      router.refresh();
    });
  };

  const done = () => {
    setCreating(false);
    setEditing(null);
    router.refresh();
  };

  return (
    <>
      <div className="pr-head">
        <div>
          <div className="bl-eyebrow">
            <span className="bl-surface-chip admin"><span className="dot" />Payments</span>
            Catalogue
          </div>
          <h1 className="bl-page-title">Products &amp; Pricing</h1>
          <p className="pr-lede">
            The one catalogue behind every checkout — bank passes, readiness
            packs and the free trial.
          </p>
        </div>
        <button type="button" className="rp-btn-primary" onClick={() => setCreating(true)}>
          + New product
        </button>
      </div>

      <div className="pr-callout">
        <strong>Changes apply to future purchases only.</strong> Every past
        buyer&apos;s access and pack credits were frozen at the moment they
        paid — editing a price or credit here never touches a grant that
        already exists.
      </div>

      <Group
        title="Bank access"
        subtitle="Duration passes to the full question bank — including the free trial"
        products={bank}
        pending={pending}
        onEdit={setEditing}
        onRetire={setRetiring}
        onReactivate={(p) => flipStatus(p, 'ACTIVE')}
      />
      <Group
        title="Readiness packs"
        subtitle="One-shot curated mock exams"
        products={readiness}
        pending={pending}
        onEdit={setEditing}
        onRetire={setRetiring}
        onReactivate={(p) => flipStatus(p, 'ACTIVE')}
      />

      {(creating || editing) && (
        <ProductFormModal
          product={editing ?? undefined}
          packCount={packCount}
          hasTrial={hasTrial}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={done}
        />
      )}

      {retiring && (
        <ProductRetireConfirm
          productName={retiring.name}
          pending={pending}
          onCancel={() => setRetiring(null)}
          onConfirm={() => flipStatus(retiring, 'ARCHIVED')}
        />
      )}

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}

function Group({
  title,
  subtitle,
  products,
  pending,
  onEdit,
  onRetire,
  onReactivate,
}: {
  title:        string;
  subtitle:     string;
  products:     ProductRow[];
  pending:      boolean;
  onEdit:       (p: ProductRow) => void;
  onRetire:     (p: ProductRow) => void;
  onReactivate: (p: ProductRow) => void;
}) {
  if (products.length === 0) return null;

  return (
    <section className="pr-group">
      <div className="pr-group-head">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>

      <div className="pr-table">
        <div className="pr-row pr-row-head">
          <div>Product</div>
          <div>Grants</div>
          <div>GHS</div>
          <div>USD</div>
          <div>Credits</div>
          <div>Status</div>
          <div />
        </div>

        {products.map((p) => (
          <ProductRowView
            key={p.product_id}
            product={p}
            pending={pending}
            onEdit={onEdit}
            onRetire={onRetire}
            onReactivate={onReactivate}
          />
        ))}
      </div>
    </section>
  );
}

function ProductRowView({
  product: p,
  pending,
  onEdit,
  onRetire,
  onReactivate,
}: {
  product:      ProductRow;
  pending:      boolean;
  onEdit:       (p: ProductRow) => void;
  onRetire:     (p: ProductRow) => void;
  onReactivate: (p: ProductRow) => void;
}) {
  const archived = p.status === 'ARCHIVED';
  const isTrial  = p.kind === 'TRIAL';
  const isPaid   = !isTrial;

  const grants =
    p.pack_type === 'READINESS'
      ? `${p.readiness_credits} mock exam${p.readiness_credits === 1 ? '' : 's'} · 100 Q each`
      : `Full question bank · ${p.duration_days} days · ${catAllowanceLabel(p.cat_allowance)}`;

  // The Credits column shows CREDITS, in both groups. The per-pack unit
  // price lives under each currency's price, where it is correct in that
  // currency; any discount is expressed once, by the full price.
  const credits =
    p.pack_type === 'READINESS'
      ? `${p.readiness_credits} credit${p.readiness_credits === 1 ? '' : 's'}`
      : p.readiness_credits > 0
        ? `${p.readiness_credits} pack credit${p.readiness_credits === 1 ? '' : 's'}`
        : 'No packs included';

  return (
    <div className={`pr-row${archived ? ' archived' : ''}`}>
      <div className="pr-cell-product">
        <span className="pr-name">
          {p.name}
          {isTrial && <span className="pr-pill free">Free</span>}
        </span>
        <span className="pr-mono pr-slug">{p.product_id}</span>
      </div>

      <div className="pr-cell-muted">{grants}</div>

      <PriceCell
        minor={p.price_minor_ghs}
        fullMinor={p.full_price_minor_ghs}
        perPack={perPackMinor(p, 'GHS')}
        currency="GHS"
        warn={isPaid && p.price_minor_ghs === 0}
      />
      <PriceCell
        minor={p.price_minor_usd}
        fullMinor={p.full_price_minor_usd}
        perPack={perPackMinor(p, 'USD')}
        currency="USD"
        warn={isPaid && p.price_minor_usd === 0}
      />

      <div className="pr-cell-muted">{credits}</div>

      <div>
        <span className={`pr-pill ${archived ? 'archived' : 'active'}`}>
          {archived ? 'Archived' : 'Active'}
        </span>
      </div>

      <div className="pr-row-actions">
        <button type="button" className="rp-btn-ghost" disabled={pending} onClick={() => onEdit(p)}>
          Edit
        </button>
        {archived ? (
          <button type="button" className="rp-btn-ghost" disabled={pending} onClick={() => onReactivate(p)}>
            Reactivate
          </button>
        ) : (
          <button type="button" className="pr-btn-retire" disabled={pending} onClick={() => onRetire(p)}>
            Retire
          </button>
        )}
      </div>
    </div>
  );
}

/** The CAT-allowance descriptor shown in a bank pass's "Grants" cell
 *  (§15.5): NULL = unlimited, 0 = none, N = N. */
function catAllowanceLabel(allowance: number | null): string {
  if (allowance === null) return 'Unlimited CATs';
  if (allowance === 0)    return 'No CATs';
  return `${allowance} CAT${allowance === 1 ? '' : 's'}`;
}

/**
 * The charged price, then (when on offer) the struck-through full price
 * with its derived % off, then (readiness only) the per-pack unit price.
 * Every figure here is in THIS cell's currency — the old per-pack label
 * was cedis-only and sat under a "Credits" header.
 */
function PriceCell({
  minor,
  fullMinor,
  perPack,
  currency,
  warn,
}: {
  minor:     number;
  fullMinor: number | null;
  perPack:   number | null;
  currency:  Currency;
  warn:      boolean;
}) {
  const off = percentOff(minor, fullMinor);
  return (
    <div className={`pr-cell-price${warn ? ' warn' : ''}`}>
      <span className="pr-price">{minor === 0 ? 'Free' : formatMinor(minor, currency)}</span>
      {off !== null && fullMinor !== null && (
        <span className="pr-was">
          <s>{formatMinor(fullMinor, currency)}</s> −{off}%
        </span>
      )}
      {perPack !== null && (
        <span className="pr-per-pack">{formatMinor(perPack, currency)}/pack</span>
      )}
    </div>
  );
}
