// mynclex/app/(app)/student/bank/packs/report/[attemptId]/page.tsx
//
// Readiness step 3 — the permanent per-sitting report (§11.5).
//
// The hub the results popup + the USED pack card point at. This server
// component is a slim boundary: auth → load the report via
// getReadinessReport (which re-checks ownership + source + terminal status
// and does the one read the whole report shares) → hand the plain model to
// the client shell. The gate `reason` maps to notFound()/redirect() here.
//
// The 21-day answer-review window and the forever score are enforced in the
// loader + helpers, so a bookmarked review URL can't outlive its window
// (the /session route enforces the same gate).

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getReadinessReport } from '@/lib/payments/readiness-report';
import ReadinessReportView from './report-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function ReadinessReportPage({ params }: PageProps) {
  const { attemptId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await getReadinessReport(attemptId, user.id);
  if (!result.ok) {
    if (result.reason === 'in_progress') redirect('/student/bank/packs');
    notFound();
  }

  return (
    <div className="rs-wrap rs-wrap-report">
      <ReadinessReportView report={result.report} />
    </div>
  );
}
