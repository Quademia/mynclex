// mynclex/app/(app)/tutor/trends/[trend_id]/page.tsx
//
// Tutor Trend dataset editor (Slice 1.12a). Tutor-scoped twin of the
// admin editor page. Gates on TUTOR role + filters to tutor_id =
// auth.uid(). RLS also enforces ownership at the DB layer.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TrendEditor } from '@/lib/bank/trend/editor';
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

  const { data, error } = await supabase
    .from('nclex_tutor_trend_datasets')
    .select('*')
    .eq('trend_id', trend_id)
    .eq('tutor_id', user.id)
    .maybeSingle();

  if (error) {
    return (
      <main className="bank-page">
        <p className="bank-error">Error loading trend dataset: {error.message}</p>
      </main>
    );
  }

  if (!data) notFound();

  const initial: TrendEditorInitial = {
    datasetRow: data as TrendDatasetRow,
  };

  return <TrendEditor surface="tutor" initial={initial} />;
}
