// mynclex/app/(app)/student/bank/page.tsx
//
// /student/bank has no content of its own — it forwards to a sub-route.
// The layout's front-door gate (requireBankOrReadiness) has already run,
// so whoever reaches here holds bank access OR a readiness entitlement:
//   - bank access → the dashboard (the bank home)
//   - readiness only (no bank) → the Packs page (their one open door;
//     the dashboard would just bounce them to /bank-access)

import { redirect } from 'next/navigation';
import { getMyBankAccess } from '@/lib/payments/entitlements';

export const dynamic = 'force-dynamic';

export default async function BankIndexPage() {
  const bank = await getMyBankAccess();
  redirect(bank.active ? '/student/bank/dashboard' : '/student/bank/packs');
}
