// mynclex/app/(app)/admin/trends/[trend_id]/page.tsx
//
// Admin Trend dataset editor (Slice 1.12a). Server component that:
//   1. Gates on BANK_CURATE / SUPER_ADMIN.
//   2. Fetches the dataset row.
//   3. Mounts <TrendEditor surface='admin' initial={...} />.
//
// Tutor twin lives at (app)/tutor/trends/[trend_id]/page.tsx.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TrendEditor } from '@/lib/bank/trend/editor';
import type { FullBankRow } from '@/lib/bank/list-view';
import type {
  TrendDatasetRow,
  TrendEditorInitial,
} from '@/lib/bank/trend/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ trend_id: string }>;
}

export default async function AdminTrendEditorPage({ params }: PageProps) {
  const { trend_id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);

  const canCurate =
    roles.includes('SUPER_ADMIN') || perms.includes('BANK_CURATE');

  if (!canCurate) redirect('/admin');

  const [datasetRes, itemsRes] = await Promise.all([
    supabase
      .from('nclex_trend_datasets')
      .select('*')
      .eq('trend_id', trend_id)
      .maybeSingle(),
    supabase
      .from('nclex_bank_items')
      .select('*')
      .eq('trend_id', trend_id)
      .order('created_at', { ascending: true }),
  ]);

  if (datasetRes.error) {
    return (
      <main className="bank-page">
        <p className="bank-error">Error loading trend dataset: {datasetRes.error.message}</p>
      </main>
    );
  }

  if (itemsRes.error) {
    return (
      <main className="bank-page">
        <p className="bank-error">Error loading attached questions: {itemsRes.error.message}</p>
      </main>
    );
  }

  if (!datasetRes.data) notFound();

  const initial: TrendEditorInitial = {
    datasetRow:    datasetRes.data as TrendDatasetRow,
    attachedItems: (itemsRes.data ?? []) as FullBankRow[],
  };

  return <TrendEditor surface="admin" initial={initial} />;
}
