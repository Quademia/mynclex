// mynclex/app/(app)/tutor/bank/trends/[trend_id]/page.tsx
//
// Slice 13b — tutor twin of the trend wrapper page. RLS enforces
// tutor-only access at the DB layer; loadTrend returns null and
// triggers notFound() if the row isn't readable.

import { notFound } from 'next/navigation';
import { requireBankCurator } from '@/lib/access';
import { loadTrend } from '@/lib/bank/wrappers/trend/load-trend';
import { TrendWrapperPage } from '@/lib/bank/wrappers/trend/wrapper-page';
import { loadAuthorship } from '@/lib/audit/authorship';

export const dynamic = 'force-dynamic';

interface PageParams {
  params:        Promise<{ trend_id: string }>;
  searchParams?: Promise<{ focus?: string }>;
}

export default async function TutorTrendPage({ params, searchParams }: PageParams) {
  const { trend_id } = await params;
  const sp = await searchParams;
  const focusItemId = sp?.focus ?? null;
  const { supabase } = await requireBankCurator('tutor');

  const data = await loadTrend(supabase, 'tutor', trend_id);
  if (!data) notFound();

  const authorship = await loadAuthorship(supabase, 'tutor', 'tutor_trend_dataset', [trend_id]);

  return (
    <TrendWrapperPage
      data={data}
      focusItemId={focusItemId}
      authorship={authorship[trend_id]}
    />
  );
}
