// mynclex/app/(app)/student/bank/history/page.tsx
//
// History page (slice 4.6a — MVP). Lists every attempt the student
// has, newest first. The bank/layout.tsx STUDENT-role check is the
// auth boundary; this page trusts it.

import { getHistoryAttempts } from '@/lib/practice/history/queries';
import { HistoryTable } from '@/lib/practice/history/history-table';
import { requireActiveBankSubscription } from '@/lib/access';

export const dynamic = 'force-dynamic';

export default async function BankHistoryPage() {
  // Per-page bank gate (see dashboard) — the layout admits readiness-only
  // students; history requires bank access.
  await requireActiveBankSubscription();
  const attempts = await getHistoryAttempts();
  return (
    <>
      <header className="hist-head">
        <h1 className="hist-h1">History</h1>
        <p className="hist-sub">
          Every past session — review your answers or pick up where you left off.
        </p>
      </header>
      <HistoryTable attempts={attempts} />
    </>
  );
}
