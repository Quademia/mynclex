// mynclex/lib/products/queries.ts
//
// Read side of the admin Products & Pricing surface. Callers are
// PAYMENTS_MANAGE-gated pages; RLS backs the same gate — the
// nclex_products_payments_manage_all policy (20260723120000) is what
// lets an admin see ARCHIVED rows at all (the public policy exposes
// ACTIVE only).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogueData, ProductRow } from './types';

// One literal, not a concatenation: supabase-js infers the row shape
// from the literal type of this string, and `a + b` widens it to
// `string` (which then infers as GenericStringError[]).
export const PRODUCT_COLUMNS =
  'product_id, name, kind, pack_type, duration_days, readiness_credits, cat_allowance, price_minor_ghs, price_minor_usd, full_price_minor_ghs, full_price_minor_usd, status, sort_order';

/**
 * The whole catalogue (ACTIVE + ARCHIVED), plus the live readiness-pack
 * count that drives the "more credits than there are packs to claim"
 * advisory. Ordered by sort_order; grouping happens at render.
 */
export async function loadCatalogue(
  supabase: SupabaseClient,
): Promise<CatalogueData> {
  const [{ data: products, error }, { count, error: countErr }] = await Promise.all([
    supabase.from('nclex_products').select(PRODUCT_COLUMNS).order('sort_order'),
    supabase
      .from('nclex_readiness_packs')
      .select('pack_id', { count: 'exact', head: true }),
  ]);
  if (error) throw new Error(`Could not load products: ${error.message}`);
  if (countErr) throw new Error(`Could not count readiness packs: ${countErr.message}`);

  return {
    products: (products ?? []) as ProductRow[],
    packCount: count ?? 0,
  };
}
