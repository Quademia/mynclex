// mynclex/app/(app)/student/bank/dashboard/page.tsx
//
// The bank home — where /student/bank sends a student with bank access.
// Thin by design (the lib/home/<audience>/ pattern): gate, one data
// call, one view. Everything else lives in lib/home/student/bank/.
//
// Per-page bank gate: the layout admits readiness-only students, so
// each bank-consumption page re-asserts bank access (→ /no-access?need=bank).

import { requireActiveBankSubscription } from '@/lib/access';
import { getBankDashboardData } from '@/lib/home/student/bank/queries';
import { BankDashboard } from '@/lib/home/student/bank/bank-dashboard';

export const dynamic = 'force-dynamic';

export default async function BankDashboardPage() {
  await requireActiveBankSubscription();
  const data = await getBankDashboardData();
  return <BankDashboard data={data} />;
}
