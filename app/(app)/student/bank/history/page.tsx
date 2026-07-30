// mynclex/app/(app)/student/bank/history/page.tsx
//
// History — the directory of every sitting the student has done, and the
// only way back into one older than the dashboard's three most recent.
//
// It is deliberately NOT a report. Each kind of sitting has (or will have)
// its own report page; this page's job is to find the sitting and open the
// right one. See lib/practice/history/derive.ts for that routing.
//
// Filters and paging arrive as search params, so this stays a thin
// boundary: parse → fetch → render.

import { getHistoryPage, parseHistoryQuery } from '@/lib/practice/history/queries';
import { HistoryTable } from '@/lib/practice/history/history-table';
import { requireActiveBankSubscription } from '@/lib/access';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BankHistoryPage({ searchParams }: PageProps) {
  // Per-page bank gate (see dashboard) — the layout admits readiness-only
  // students; history requires bank access.
  await requireActiveBankSubscription();

  const query = parseHistoryQuery(await searchParams);
  const page = await getHistoryPage(query);

  return (
    <>
      <header className="hist-head">
        <h1 className="hist-h1">History</h1>
        <p className="hist-sub">
          Every session you&apos;ve sat — open one to review it, or pick up
          where you left off.
        </p>
      </header>
      <HistoryTable page={page} query={query} />
    </>
  );
}
