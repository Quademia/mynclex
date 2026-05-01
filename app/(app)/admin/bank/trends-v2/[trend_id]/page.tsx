// mynclex/app/(app)/admin/bank/trends-v2/[trend_id]/page.tsx
//
// Slice 13a — stub detail page. Lets the createTrendAction redirect
// have a valid landing page until the real wrapper page lands in
// 13b. Loads the trend row to confirm the ID resolves and surface
// the title; renders a placeholder card pointing back to the list.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { kindDefaultLabel } from '@/lib/authoring/wrappers/trend/kind-templates';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ trend_id: string }>;
}

interface TrendStubRow {
  trend_id:           string;
  title:              string;
  kind:               string;
  is_published:       boolean;
  is_free_sample:     boolean;
  is_builder_visible: boolean;
}

export default async function AdminTrendV2StubPage({ params }: PageParams) {
  const { trend_id } = await params;
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const { data, error } = await supabase
    .from('nclex_trend_datasets')
    .select('trend_id, title, kind, is_published, is_free_sample, is_builder_visible')
    .eq('trend_id', trend_id)
    .maybeSingle();

  if (error) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">Trend dataset</h1>
          <p className="auth-sandbox-error">Could not load: {error.message}</p>
        </div>
      </main>
    );
  }

  if (!data) notFound();
  const row = data as unknown as TrendStubRow;

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <div>
            <h1 className="auth-list-page-title">{row.title}</h1>
            <p className="auth-list-page-subtitle">
              <code>{row.trend_id}</code> · Kind: <strong>{kindDefaultLabel(row.kind)}</strong>
              {' '}· {row.is_published ? 'Published' : 'Draft'}
            </p>
          </div>
          <div className="auth-list-toolbar">
            <Link href="/admin/bank/trends-v2" className="auth-cs-btn subtle">← Back to list</Link>
          </div>
        </header>

        <div className="auth-list-empty">
          <h3>Wrapper page coming in 13b</h3>
          <p>
            The two-pane wrapper editor (data table + slot pill strip + combined
            preview) lands in slice 13b. Until then this page is a placeholder
            confirming the dataset row was created correctly.
          </p>
          <p style={{ marginTop: 12, fontSize: '0.85em', opacity: 0.7 }}>
            Visibility flags: published = {String(row.is_published)},
            free sample = {String(row.is_free_sample)},
            builder visible = {String(row.is_builder_visible)}
          </p>
        </div>
      </div>
    </main>
  );
}
