// mynclex/app/(app)/tutor/bank/trends/[trend_id]/page.tsx
//
// Tutor Trend dataset editor (Slice 1.12a). Tutor-scoped twin of the
// admin editor page. Gates on TUTOR role + filters to tutor_id =
// auth.uid(). RLS also enforces ownership at the DB layer.

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

export default async function TutorTrendEditorPage({ params }: PageProps) {
  const { trend_id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (rolesData ?? []).map((r) => r.role as string);

  if (!roles.includes('TUTOR')) redirect('/no-access');

  const [datasetRes, itemsRes] = await Promise.all([
    supabase
      .from('nclex_tutor_trend_datasets')
      .select('*')
      .eq('trend_id', trend_id)
      .eq('tutor_id', user.id)
      .maybeSingle(),
    supabase
      .from('nclex_tutor_questions')
      .select('*')
      .eq('trend_id', trend_id)
      .eq('tutor_id', user.id)
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

  return <TrendEditor surface="tutor" initial={initial} />;
}
