// mynclex/app/(app)/tutor/library/analytics/page.tsx
//
// Tutor "Question analytics" — the reading-check analytics over the
// embedded-questions blocks in the tutor's library notes (slice 11.11c).
// A standalone route under the library (its own light sidebar) so the
// growing drill-in (Questions / Roster / Readers — later slices) gets
// real routes instead of param-soup on the library page.
//
// Auth: gated by (app)/tutor/layout.tsx (TUTOR role) + (app)/layout.tsx
// (signed-in). The read RLS-scopes to the tutor's own notes/questions.
// Outer chrome (global tutor sidebar) comes from /tutor/library/layout.tsx.

import { getEmbedAnalyticsOverview } from '@/lib/library/analytics/queries';
import { EmbedAnalyticsShell } from '@/lib/library/analytics/shell';
import { EmbedAnalyticsOverviewView } from '@/lib/library/analytics/overview';

export const dynamic = 'force-dynamic';

function firstOrNull(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export default async function TutorQuestionAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const { scope } = await searchParams;
  const data = await getEmbedAnalyticsOverview(firstOrNull(scope));
  return (
    <EmbedAnalyticsShell>
      <EmbedAnalyticsOverviewView data={data} />
    </EmbedAnalyticsShell>
  );
}
