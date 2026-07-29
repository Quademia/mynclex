// mynclex/app/(app)/student/bank/cat/page.tsx
//
// The CAT home (§10.7.2). Sibling to /student/bank/practice and
// /student/bank/packs, where the other consumption surfaces live.
//
// This is CAT's home rather than a launcher: later slices add the report
// links (Slice 7) and the Readiness Signal card (Slice 9) as regions here
// rather than as new pages.
//
// It is also the ONLY place a CAT can be started (§10.7.1) — the practice
// Builder hands off here and creates nothing itself.

import { requireActiveBankSubscription } from '@/lib/access';
import { getCatHomeView } from '@/lib/practice/cat/home-view';
import { hasDismissedPrompt } from '@/lib/practice/tutorial/completion';
import { PROMPT_KEY_PRE_EXAM_OFFER } from '@/lib/practice/tutorial/keys';
import { CatHomeClient } from './cat-home-client';

export const dynamic = 'force-dynamic';

export default async function BankCatPage() {
  // CAT is bank-family (§15.5.4) — a readiness-only student holds no bank
  // entitlement and cannot sit one. Bounces to the reason-aware wall.
  await requireActiveBankSubscription();

  const view = await getCatHomeView();
  // Runner tutorial Slice 3c: has the student dismissed the pre-exam
  // walkthrough offer? Drives whether the CAT preflight's Start shows it.
  const offerDismissed = await hasDismissedPrompt(PROMPT_KEY_PRE_EXAM_OFFER);
  return <CatHomeClient view={view} offerDismissed={offerDismissed} />;
}
