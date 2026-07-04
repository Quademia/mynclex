// mynclex/lib/practice/runner/attempt-image-actions.ts
//
// Bank rich-content Slice 7c — STUDENT-side signed-URL resolution for
// bank images inside a chart tab's narrative body. Option A (settled
// 2026-07-03): the gate is anchored on the ATTEMPT, mirroring the
// library's note-anchored student gate (read-media-actions.ts):
//
//   1. Ownership gate — RLS-read the attempt. nclex_attempts' student
//      policy returns the row only if the caller owns it. The attempt's
//      existence is also the proof of entitlement at creation time
//      (bank preflight / programme enrolment, per source).
//   2. Lapse gate — a bank (CUSTOM_BUILT) attempt additionally
//      re-checks the live bank subscription, mirroring the runner
//      page's full-lock-on-lapse (Slice 5.6) — review of old attempts
//      locks too. Non-redirecting inline check (bankAccessForUser),
//      since this returns a result to a fetch, not a page.
//      PROGRAMME_ASSIGNED attempts are enrolment-gated at creation and
//      their runner page adds no live re-check — same posture here.
//   3. Anti-oracle gate — the requested asset id must actually be
//      referenced by THIS attempt's frozen content: the tab snapshots
//      (case + trend, Slice 7) or an item's frozen stem (Slice 8).
//      Stops a valid attempt being used as a key to mint URLs for
//      arbitrary bank assets.
//   4. Only then mint the 1-hour signed URL (service-role,
//      RLS-bypassing).
//
// Frozen-snapshot resolution falls out for free: the walk runs over
// tabs_snapshot_json / stem_snapshot, so an image keeps resolving in
// review years after the live question/case/trend changed or vanished.

'use server';

import { createClient } from '@/lib/supabase/server';
import { getAssetUrl } from '@/lib/media/queries';
import type { AssetUrlResult } from '@/lib/media/types';
import { bankAccessForUser } from '@/lib/payments/entitlements';
import { collectBankImageAssetIds } from '@/lib/authoring/bank-image-doc';
import { parseRichDoc } from '@/lib/authoring/rich-doc';

export async function getAttemptImageUrlAction(
  attemptId: string,
  assetId: string,
): Promise<AssetUrlResult> {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, error: 'You must be signed in.' };
  }

  // 1. Ownership — RLS returns the attempt only to its owner.
  const { data: attempt, error: attemptErr } = await supabase
    .from('nclex_attempts')
    .select('attempt_id, source')
    .eq('attempt_id', attemptId)
    .maybeSingle();

  if (attemptErr || !attempt) {
    return { ok: false, error: 'Not found.' };
  }

  // 2. Bank-entitlement re-check for bank attempts (lapse = full lock,
  //    runner page parity). SUPER_ADMIN bypasses, same as the page's
  //    requireActiveBankSubscription.
  if (attempt.source === 'CUSTOM_BUILT') {
    const { data: roleRows } = await supabase
      .from('nclex_user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'SUPER_ADMIN');

    const isSuperAdmin = (roleRows ?? []).length > 0;
    if (!isSuperAdmin) {
      const access = await bankAccessForUser(supabase, userData.user.id);
      if (!access.active) {
        return { ok: false, error: 'Your bank access has ended.' };
      }
    }
  }

  // 3. Anti-oracle — the asset must live in THIS attempt's frozen
  //    content: chart tabs + wrapper scenario (Slices 7 + 8d) or an
  //    item's stem (Slice 8).
  const [cases, trends, items] = await Promise.all([
    supabase
      .from('nclex_attempt_case_snapshots')
      .select('tabs_snapshot_json, scenario_summary_snapshot')
      .eq('attempt_id', attemptId),
    supabase
      .from('nclex_attempt_trend_snapshots')
      .select('tabs_snapshot_json, scenario_snapshot')
      .eq('attempt_id', attemptId),
    supabase
      .from('nclex_attempt_items')
      .select('stem_snapshot')
      .eq('attempt_id', attemptId),
  ]);

  if (cases.error || trends.error || items.error) {
    return { ok: false, error: 'Could not look up image.' };
  }

  // The stem / scenario snapshots are TEXT columns (rich values store
  // stringified Tiptap JSON) — parse before walking; legacy plain text
  // parses to paragraphs and simply yields no ids.
  const ids = new Set<string>();
  for (const row of cases.data ?? []) {
    collectBankImageAssetIds(row.tabs_snapshot_json, ids);
    collectBankImageAssetIds(parseRichDoc(row.scenario_summary_snapshot), ids);
  }
  for (const row of trends.data ?? []) {
    collectBankImageAssetIds(row.tabs_snapshot_json, ids);
    collectBankImageAssetIds(parseRichDoc(row.scenario_snapshot), ids);
  }
  for (const row of items.data ?? []) {
    collectBankImageAssetIds(parseRichDoc(row.stem_snapshot), ids);
  }

  if (!ids.has(assetId)) {
    return { ok: false, error: 'Not found.' };
  }

  // 4. Mint.
  return getAssetUrl(assetId);
}
