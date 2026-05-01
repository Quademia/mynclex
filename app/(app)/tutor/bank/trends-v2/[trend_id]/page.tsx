// mynclex/app/(app)/tutor/bank/trends-v2/[trend_id]/page.tsx
//
// Slice 13b — tutor twin of the trend wrapper page. RLS enforces
// tutor-only access at the DB layer; loadTrend returns null and
// triggers notFound() if the row isn't readable.

import { notFound } from 'next/navigation';
import { requireBankCurator } from '@/lib/access';
import { loadTrend } from '@/lib/authoring/wrappers/trend/load-trend';
import { TrendWrapperPage } from '@/lib/authoring/wrappers/trend/wrapper-page';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ trend_id: string }>;
}

export default async function TutorTrendV2Page({ params }: PageParams) {
  const { trend_id } = await params;
  const { supabase } = await requireBankCurator('tutor');

  const data = await loadTrend(supabase, 'tutor', trend_id);
  if (!data) notFound();

  return <TrendWrapperPage data={data} />;
}
