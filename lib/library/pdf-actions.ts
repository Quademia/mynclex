// mynclex/lib/library/pdf-actions.ts
//
// Server action the PDF-block NodeView calls to turn a stored
// asset_id into a signed URL the browser can open (slice 11.6b).
// Mirrors image-actions.ts exactly, only the accepted purpose
// differs (LIBRARY_PDF).
//
// getAssetUrl (lib/media/queries.ts) mints the signed URL with the
// service-role client, which BYPASSES nclex_media_assets RLS. So we
// gate first: read the asset row through the request-scoped (RLS-
// bound) client. The SELECT policy only returns rows the caller owns
// (or SUPER_ADMIN), so a tutor can only resolve their own library
// PDFs. Only after that gate passes do we mint the URL.
//
// The student read view (slice 11.13) will have its own URL path
// with enrolment-based gating — it never reuses this tutor-owner gate.

'use server';

import { createClient } from '@/lib/supabase/server';
import { getAssetUrl } from '@/lib/media/queries';
import type { AssetUrlResult } from '@/lib/media/types';

export async function getLibraryPdfUrlAction(
  assetId: string,
): Promise<AssetUrlResult> {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: 'You must be signed in.' };
  }

  // RLS-gated read — returns the row only if the caller owns it (or
  // is SUPER_ADMIN). This is the access gate; getAssetUrl below
  // bypasses RLS, so the check has to happen here.
  const { data: asset, error: assetErr } = await supabase
    .from('nclex_media_assets')
    .select('asset_id, purpose')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (assetErr) {
    return { ok: false, error: 'Could not look up PDF.' };
  }
  if (!asset || asset.purpose !== 'LIBRARY_PDF') {
    return { ok: false, error: 'PDF not found.' };
  }

  return getAssetUrl(assetId);
}
