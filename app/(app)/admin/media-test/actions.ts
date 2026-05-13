// mynclex/app/(app)/admin/media-test/actions.ts
//
// Smoke-test-only server action. Wraps getAssetUrl so the test
// page (a client component) can ask for a signed URL after the
// upload completes. Removed alongside the rest of the test page
// when 9.3d-c supersedes the foundation smoke test.
//
// Real consumers (PDF activity, future avatars) write their own
// access-checked wrappers like getPdfActivityUrl(activityId) that
// verify access at the consumer level before calling getAssetUrl.

'use server';

import { getAssetUrl } from '@/lib/media/queries';
import { requireSuperAdmin } from '@/lib/access';
import type { AssetUrlResult } from '@/lib/media/types';

export async function getTestAssetUrlAction(
  assetId: string,
): Promise<AssetUrlResult> {
  await requireSuperAdmin();
  return getAssetUrl(assetId);
}
