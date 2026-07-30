// mynclex/app/(app)/student/bank/cases/page.tsx
//
// The student Case Study bank — sit an unfolding NGN case straight from
// the bank, one or two at a time, in the existing runner.
//
// Per-page bank gate: the bank layout's front door admits readiness-only
// students (so they can reach the Packs page), so every consumption
// surface re-asserts bank access. nclex_create_case_attempt carries the
// same check as the hard backstop.

import { requireActiveBankSubscription } from '@/lib/access';
import { getCaseBankRows } from '@/lib/practice/cases/queries';
import { CaseBankClient } from './case-bank-client';

export const dynamic = 'force-dynamic';

export default async function BankCasesPage() {
  await requireActiveBankSubscription();
  const rows = await getCaseBankRows();
  return <CaseBankClient rows={rows} />;
}
