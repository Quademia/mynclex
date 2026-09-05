// mynclex/lib/products/actions.ts
//
// Server Actions for the admin Products & Pricing surface. All
// PAYMENTS_MANAGE-gated (the TS gate mirrors the RLS policy added in
// 20260723120000 — layered enforcement).
//
// Two rules the whole file exists to protect:
//
//  1. IDENTITY IS IMMUTABLE. slug / pack_type / duration_days are set
//     at creation and never updated. A product's meaning must not
//     change under rows that already reference it (payments FK
//     RESTRICT). Changing an offer = retire the old, create the new.
//     The update action simply never reads those fields off the form.
//
//  2. THERE IS NO DELETE. ARCHIVED is the only removal; payments point
//     at products forever. Retire/reactivate flip `status`.
//
// Validation follows the standing advise > block rule: only the
// structurally broken is rejected (empty name, bad/duplicate slug,
// a bank pass with no duration, a "was" price that isn't higher). A
// paid product priced at 0, or a SKU granting more credits than there
// are packs to claim, are AMBER ADVISORIES in the form — they save.

'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission, PERM_PAYMENTS_MANAGE } from '@/lib/access';
import { parseMoneyToMinor } from './money';
import type { PackType, ProductActionResult, ProductKind, ProductStatus } from './types';

const SLUG_PATTERN = /^[A-Z][A-Z0-9_]{2,39}$/;

function revalidateProducts() {
  revalidatePath('/admin/products');
  revalidatePath('/bank-access');   // public tiers read this catalogue
}

// ── Shared form parsing ──────────────────────────────────────────────

interface ParsedEditable {
  name:              string;
  readiness_credits: number;
  cat_allowance:     number | null;
  priceGhs:          number;
  priceUsd:          number;
  fullPriceGhs:      number | null;
  fullPriceUsd:      number | null;
  sort_order:        number;
  badge:             string | null;
}

/** The fields BOTH create and edit may write. Identity is not here. */
function parseEditable(
  formData: FormData,
  packType: PackType,
): ParsedEditable | { error: string } {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'The product needs a display name.' };

  const priceGhs = parseMoneyToMinor(String(formData.get('price_ghs') ?? ''), { allowBlank: true });
  if (!priceGhs.ok) return { error: `GHS price: ${priceGhs.error}` };
  const priceUsd = parseMoneyToMinor(String(formData.get('price_usd') ?? ''), { allowBlank: true });
  if (!priceUsd.ok) return { error: `USD price: ${priceUsd.error}` };

  // Blank "was" price = not on offer (null), not zero.
  const fullGhsRaw = String(formData.get('full_price_ghs') ?? '').trim();
  const fullUsdRaw = String(formData.get('full_price_usd') ?? '').trim();

  let fullPriceGhs: number | null = null;
  if (fullGhsRaw !== '') {
    const parsed = parseMoneyToMinor(fullGhsRaw);
    if (!parsed.ok) return { error: `GHS full price: ${parsed.error}` };
    if (parsed.minor <= priceGhs.minor) {
      return { error: 'The GHS full price must be higher than the price you charge.' };
    }
    fullPriceGhs = parsed.minor;
  }
  let fullPriceUsd: number | null = null;
  if (fullUsdRaw !== '') {
    const parsed = parseMoneyToMinor(fullUsdRaw);
    if (!parsed.ok) return { error: `USD full price: ${parsed.error}` };
    if (parsed.minor <= priceUsd.minor) {
      return { error: 'The USD full price must be higher than the price you charge.' };
    }
    fullPriceUsd = parsed.minor;
  }

  const credits = Number(formData.get('readiness_credits'));
  if (!Number.isInteger(credits) || credits < 0) {
    return { error: 'Readiness credits must be a whole number of 0 or more.' };
  }
  // Mirrors the DB CHECK (nclex_products_readiness_credits_positive):
  // a readiness SKU granting nothing is a broken product.
  if (packType === 'READINESS' && credits < 1) {
    return { error: 'A readiness pack SKU must grant at least 1 credit.' };
  }

  const sortOrder = Number(formData.get('sort_order'));
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return { error: 'Sort order must be a whole number of 0 or more.' };
  }

  // CAT allowance (§15.5). Blank = unlimited (NULL); a number = a per-pass
  // cap (0 = none). Bank-family only: a READINESS SKU always stores NULL,
  // since its buyer holds no bank entitlement to carry the allowance — the
  // form doesn't render the field for readiness, but force it server-side
  // so a hand-posted value can't slip a meaningless cap onto a pack.
  let catAllowance: number | null = null;
  if (packType === 'BANK_DURATION') {
    const raw = String(formData.get('cat_allowance') ?? '').trim();
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        return { error: 'CAT allowance must be a whole number of 0 or more, or blank for unlimited.' };
      }
      catAllowance = n;
    }
  }

  // Card badge (2026-09-05). Blank is NULL, not an empty string — the same
  // convention the "was" prices above already use, so the catalogue has one
  // way of saying "not set" rather than two. Both product families; the
  // public grids render a ribbon and a highlight when it is present.
  //
  // ⚠ Mirrors the DB CHECK (1–24 characters, trimmed). The cap is not
  // tidiness: the ribbon is one non-wrapping line straddling the top of a
  // card that gets narrow on a phone, and there is no truncation to catch
  // an over-long one. The form's input caps it too.
  const badgeRaw = String(formData.get('badge') ?? '').trim();
  if (badgeRaw.length > 24) {
    return { error: 'A badge can be at most 24 characters — it has to fit one line on a phone.' };
  }
  const badge = badgeRaw === '' ? null : badgeRaw;

  return {
    name,
    readiness_credits: credits,
    cat_allowance: catAllowance,
    priceGhs: priceGhs.minor,
    priceUsd: priceUsd.minor,
    fullPriceGhs,
    fullPriceUsd,
    sort_order: sortOrder,
    badge,
  };
}

// ── Create ───────────────────────────────────────────────────────────

export async function createProductAction(
  formData: FormData,
): Promise<ProductActionResult & { productId?: string }> {
  const { supabase } = await requireAdminPermission(PERM_PAYMENTS_MANAGE);

  const slug = String(formData.get('product_id') ?? '').trim().toUpperCase();
  const packType = String(formData.get('pack_type') ?? '') as PackType;
  const kind = String(formData.get('kind') ?? 'PAID') as ProductKind;

  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: 'Product ID must be 3–40 characters: capitals, digits and underscores, starting with a letter (e.g. BANK_120D).',
    };
  }
  if (packType !== 'BANK_DURATION' && packType !== 'READINESS') {
    return { ok: false, error: 'Choose a product type.' };
  }
  if (kind !== 'PAID' && kind !== 'TRIAL') {
    return { ok: false, error: 'Unknown product kind.' };
  }

  // Duration: required for bank passes, meaningless for readiness.
  let durationDays: number | null = null;
  if (packType === 'BANK_DURATION') {
    durationDays = Number(formData.get('duration_days'));
    if (!Number.isInteger(durationDays) || durationDays < 1) {
      return { ok: false, error: 'A bank pass needs a duration of at least 1 day.' };
    }
  }

  const editable = parseEditable(formData, packType);
  if ('error' in editable) return { ok: false, error: editable.error };

  const { error } = await supabase.from('nclex_products').insert({
    product_id:           slug,
    name:                 editable.name,
    kind,
    pack_type:            packType,
    duration_days:        durationDays,
    readiness_credits:    editable.readiness_credits,
    cat_allowance:        editable.cat_allowance,
    price_minor_ghs:      editable.priceGhs,
    price_minor_usd:      editable.priceUsd,
    full_price_minor_ghs: editable.fullPriceGhs,
    full_price_minor_usd: editable.fullPriceUsd,
    status:               'ACTIVE',
    sort_order:           editable.sort_order,
    badge:                editable.badge,
  });

  if (error) {
    // Friendly names for the two DB guards a curator can actually hit.
    if (error.code === '23505') {
      if (error.message.includes('single_trial')) {
        return { ok: false, error: 'A trial product already exists — there can only be one.' };
      }
      return { ok: false, error: `Product ID "${slug}" is already taken.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateProducts();
  return { ok: true, productId: slug };
}

// ── Update (identity untouched by construction) ──────────────────────

export async function updateProductAction(
  formData: FormData,
): Promise<ProductActionResult> {
  const { supabase } = await requireAdminPermission(PERM_PAYMENTS_MANAGE);

  const productId = String(formData.get('product_id') ?? '');
  if (!productId) return { ok: false, error: 'Missing product.' };

  // pack_type comes from the row, NOT the form — the form's copy is
  // display-only and locked. Re-read it so the credits rule can't be
  // bypassed by posting a different type.
  const { data: existing, error: readErr } = await supabase
    .from('nclex_products')
    .select('pack_type')
    .eq('product_id', productId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!existing) return { ok: false, error: 'Product not found.' };

  const editable = parseEditable(formData, existing.pack_type as PackType);
  if ('error' in editable) return { ok: false, error: editable.error };

  const { error } = await supabase
    .from('nclex_products')
    .update({
      name:                 editable.name,
      readiness_credits:    editable.readiness_credits,
      cat_allowance:        editable.cat_allowance,
      price_minor_ghs:      editable.priceGhs,
      price_minor_usd:      editable.priceUsd,
      full_price_minor_ghs: editable.fullPriceGhs,
      full_price_minor_usd: editable.fullPriceUsd,
      sort_order:           editable.sort_order,
      badge:                editable.badge,
      updated_at:           new Date().toISOString(),
    })
    .eq('product_id', productId);

  if (error) return { ok: false, error: error.message };

  revalidateProducts();
  return { ok: true };
}

// ── Retire / reactivate (never delete) ───────────────────────────────

export async function setProductStatusAction(
  productId: string,
  status:    ProductStatus,
): Promise<ProductActionResult> {
  const { supabase } = await requireAdminPermission(PERM_PAYMENTS_MANAGE);

  if (status !== 'ACTIVE' && status !== 'ARCHIVED') {
    return { ok: false, error: 'Unknown status.' };
  }

  const { error } = await supabase
    .from('nclex_products')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('product_id', productId);

  if (error) return { ok: false, error: error.message };

  revalidateProducts();
  return { ok: true };
}
