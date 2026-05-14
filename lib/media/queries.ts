// mynclex/lib/media/queries.ts
//
// Read-side helpers for the media-asset foundation.
//
// getAssetUrl(assetId) — given an asset, return a URL the browser
// can fetch the file with. Public buckets → direct URL. Private
// buckets → service-role-minted signed URL (1-hour expiry).
//
// Authorization note: this helper bypasses the asset row's RLS by
// using the service-role client. That is deliberate — students
// viewing a PDF activity will never own the asset row, so RLS on
// nclex_media_assets cannot be the access gate for them. Access is
// gated at the consumer layer (the activity row's own RLS), and
// this helper trusts its caller. Per-feature server actions in
// consumer slices (e.g. getPdfActivityUrl in 9.3d-c) read the
// consumer row first — subject to its RLS — and only then call
// this helper with the asset id.

import { createServiceRoleClient } from '@/lib/supabase/server';
import { PURPOSE_CONFIG, type AssetUrlResult, type Purpose } from './types';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, per media-assets.md §4.4

export async function getAssetUrl(assetId: string): Promise<AssetUrlResult> {
  const supabase = createServiceRoleClient();

  const { data: asset, error: assetErr } = await supabase
    .from('nclex_media_assets')
    .select('bucket, storage_path, purpose, status')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (assetErr) {
    return { ok: false, error: 'Could not look up asset.' };
  }
  if (!asset) {
    return { ok: false, error: 'Asset not found.' };
  }
  if (asset.status !== 'READY') {
    return { ok: false, error: `Asset is not available (status: ${asset.status}).` };
  }

  // PURPOSE_CONFIG decides public-vs-private. The bucket on the asset
  // row is just a label — we trust the application config map for
  // the policy decision, so changing isPublic for a purpose later
  // doesn't require touching individual rows.
  const config = PURPOSE_CONFIG[asset.purpose as Purpose];
  const isPublic = config?.isPublic ?? false;

  if (isPublic) {
    const { data } = supabase.storage
      .from(asset.bucket)
      .getPublicUrl(asset.storage_path);
    return { ok: true, url: data.publicUrl, isPublic: true };
  }

  const { data, error: signedErr } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedErr || !data?.signedUrl) {
    return { ok: false, error: 'Could not mint download link.' };
  }

  return { ok: true, url: data.signedUrl, isPublic: false };
}
