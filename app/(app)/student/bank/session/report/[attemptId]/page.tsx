// mynclex/app/(app)/student/bank/session/report/[attemptId]/page.tsx
//
// The Session Report — the permanent report for a Builder-built practice
// sitting. Slice 1: the spine (gates, loader, top block). The four readings
// and the per-question table land in slices 2 and 3.
//
// Sits beside the two reports that already exist —
// /student/bank/packs/report/[id] and /student/bank/cat/result/[id] — so all
// three kinds of sitting have a permanent home and History can be a pure
// index that routes to whichever one applies.
//
// A slim boundary: auth → gate → load → hand a plain model to the view.
// Each gate reason has a better destination than an error page, so every one
// redirects rather than 404s where it sensibly can.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireActiveBankSubscription } from '@/lib/access';
import { getSessionReport } from '@/lib/practice/report/queries';
import { SessionReportView } from './report-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function SessionReportPage({ params }: PageProps) {
  // Per-page bank gate. The bank layout admits readiness-only students, and
  // this page shows bank content, so it re-asserts access — the same pattern
  // the dashboard, the builder and History use.
  await requireActiveBankSubscription();

  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await getSessionReport(attemptId, user.id);

  if (!result.ok) {
    switch (result.reason) {
      case 'in_progress':
        // Nothing to debrief yet — put them back in the sitting.
        redirect(`/session/${attemptId}`);
      case 'wrong_kind':
        // A pack or a CAT: send it to its OWN report rather than describing
        // it in the wrong vocabulary (a percentage must never front a CAT).
        redirect(result.redirectTo ?? '/student/bank/history');
      case 'discarded':
        redirect('/student/bank/history');
      default:
        notFound();
    }
  }

  return <SessionReportView report={result.report} />;
}
