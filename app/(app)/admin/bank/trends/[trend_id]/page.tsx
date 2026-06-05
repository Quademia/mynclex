// mynclex/app/(app)/admin/bank/trends/[trend_id]/page.tsx
//
// Slice 13b — admin trend wrapper page. Loads dataset row + attached
// questions via load-trend.ts, mounts the read-only wrapper UI.
//
// Read-only for 13b: data displays, pill navigation works, but Save /
// Cancel / Delete buttons are stubs. Real editor mounting + save
// plumbing wires up in 13c–13e.

import { notFound } from 'next/navigation';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { loadTrend } from '@/lib/bank/wrappers/trend/load-trend';
import { TrendWrapperPage } from '@/lib/bank/wrappers/trend/wrapper-page';
import { loadAuthorship } from '@/lib/audit/authorship';

export const dynamic = 'force-dynamic';

interface PageParams {
  params:        Promise<{ trend_id: string }>;
  searchParams?: Promise<{ focus?: string }>;
}

export default async function AdminTrendPage({ params, searchParams }: PageParams) {
  const { trend_id } = await params;
  const sp = await searchParams;
  const focusItemId = sp?.focus ?? null;
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const data = await loadTrend(supabase, 'admin', trend_id);
  if (!data) notFound();

  const authorship = await loadAuthorship(supabase, 'admin', 'trend_dataset', [trend_id]);

  return (
    <TrendWrapperPage
      data={data}
      focusItemId={focusItemId}
      authorship={authorship[trend_id]}
    />
  );
}
