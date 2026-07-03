// mynclex/lib/authoring/bank-image-actions.ts
//
// Curator-side signed-URL resolution for bank image blocks (rich-content
// Slice 7). The library's getLibraryImageUrlAction gates on asset
// OWNERSHIP alone — fine for the tutor library, where a note has exactly
// one author. The admin bank is TEAM-curated: curator B must be able to
// see an image curator A uploaded into the same case, and neither owns
// the other's asset row. So the gate here is two-path:
//
//   1. Ownership path — RLS read of the asset row (owner or SUPER_ADMIN).
//      Covers tutors (they only edit their own wrappers) and the
//      uploading admin.
//   2. Bank-curator path — the caller holds the BANK_CURATE admin
//      permission. Covers admin teammates resolving each other's
//      uploads. Verified against the caller's own roles/permissions
//      rows (RLS: self-readable), then the asset is looked up via the
//      service role (the caller doesn't own the row, so RLS would
//      return nothing).
//
// Either path also requires purpose === 'BANK_IMAGE' — this action must
// not become an oracle for other purposes' assets. Only after a gate
// passes do we mint the 1-hour signed URL (getAssetUrl, service-role,
// RLS-bypassing).
//
// The STUDENT path is deliberately separate (Slice 7c,
// getAttemptImageUrlAction): attempt-anchored — the asset must be
// referenced by the caller's own attempt's frozen tab snapshots.

'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAssetUrl } from '@/lib/media/queries';
import type { AssetUrlResult } from '@/lib/media/types';

export async function getBankImageUrlAction(
  assetId: string,
): Promise<AssetUrlResult> {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: 'You must be signed in.' };
  }
  const userId = userData.user.id;

  // Path 1 — ownership. RLS-gated read: returns the row only if the
  // caller owns it (or is SUPER_ADMIN).
  const { data: owned, error: ownedErr } = await supabase
    .from('nclex_media_assets')
    .select('asset_id, purpose')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (ownedErr) {
    return { ok: false, error: 'Could not look up image.' };
  }
  if (owned) {
    if (owned.purpose !== 'BANK_IMAGE') {
      return { ok: false, error: 'Image not found.' };
    }
    return getAssetUrl(assetId);
  }

  // Path 2 — bank curator. The caller's own permission rows are
  // self-readable under RLS.
  const { data: perms, error: permsErr } = await supabase
    .from('nclex_admin_permissions')
    .select('permission')
    .eq('user_id', userId)
    .eq('permission', 'BANK_CURATE');

  if (permsErr || !perms || perms.length === 0) {
    return { ok: false, error: 'Image not found.' };
  }

  // Curator confirmed — the asset row isn't theirs, so look it up via
  // the service role, still insisting on the BANK_IMAGE purpose.
  const service = createServiceRoleClient();
  const { data: asset, error: assetErr } = await service
    .from('nclex_media_assets')
    .select('asset_id, purpose')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (assetErr) {
    return { ok: false, error: 'Could not look up image.' };
  }
  if (!asset || asset.purpose !== 'BANK_IMAGE') {
    return { ok: false, error: 'Image not found.' };
  }

  return getAssetUrl(assetId);
}
