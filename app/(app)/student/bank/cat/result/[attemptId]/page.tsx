// mynclex/app/(app)/student/bank/cat/result/[attemptId]/page.tsx
//
// Slice 7 — the CAT results page (§13).
//
// A slim server boundary, mirroring the readiness report's shape: gate →
// load → hand a plain model to the client view. One surface serves both
// contexts §13 names — the moment a CAT ends, and re-opening a past CAT
// from the history list on the CAT home.
//
// Sibling route under /cat rather than a child of the home's own layout:
// /cat has no layout.tsx, so nothing double-renders (CLAUDE.md folder
// convention #7 only bites when both levels own chrome).

import { notFound, redirect } from 'next/navigation';
import { requireActiveBankSubscription } from '@/lib/access';
import { createClient } from '@/lib/supabase/server';
import { getCatReport } from '@/lib/practice/cat/report';
import { CatResultView } from './result-view';
import { CatAbandonedView } from './abandoned-view';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function CatResultPage({ params }: PageProps) {
  // Same gate as the CAT home — CAT is bank-family (§15.5.4), so a
  // readiness-only student cannot reach a CAT result either.
  await requireActiveBankSubscription();

  const { attemptId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await getCatReport(attemptId, user.id);

  if (!result.ok) {
    // A live CAT has no result yet — send the student back to finish it
    // rather than showing an empty report.
    if (result.reason === 'in_progress') redirect(`/session/${attemptId}`);
    notFound();
  }

  return result.kind === 'abandoned' ? (
    <CatAbandonedView report={result.report} />
  ) : (
    <CatResultView report={result.report} />
  );
}
