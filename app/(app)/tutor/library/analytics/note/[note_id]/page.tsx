// mynclex/app/(app)/tutor/library/analytics/note/[note_id]/page.tsx
//
// Per-note reading-check drill-in (slice 11.11c). Questions tab
// (block-grouped) + Roster / Readers tabs (reader × block heatmap + the
// reader list). Each tab fetches only the data it needs. notFound() when
// the note isn't the tutor's (RLS read returns null).

import { notFound } from 'next/navigation';
import {
  getEmbedAnalyticsNote,
  getEmbedNoteReaders,
  getEmbedReaderReport,
} from '@/lib/library/analytics/queries';
import { EmbedAnalyticsShell } from '@/lib/library/analytics/shell';
import { EmbedNoteView } from '@/lib/library/analytics/note-view';
import { EmbedReaderReportView } from '@/lib/library/analytics/reader-report';
import type { EmbedNoteTab } from '@/lib/library/analytics/types';

export const dynamic = 'force-dynamic';

function parseTab(raw: string | string[] | undefined): EmbedNoteTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'roster' || v === 'readers' ? v : 'questions';
}

function firstOrNull(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export default async function TutorNoteAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ note_id: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    q?: string | string[];
    reader?: string | string[];
    from?: string | string[];
    scope?: string | string[];
  }>;
}) {
  const { note_id } = await params;
  const { tab: tabRaw, q, reader, from, scope } = await searchParams;
  const tab = parseTab(tabRaw);
  const scopeParam = firstOrNull(scope);

  // Per-reader report (replaces the tabbed view), reached from a roster /
  // readers row.
  const readerId = firstOrNull(reader);
  if (readerId) {
    const fromTab = parseTab(from) === 'questions' ? 'roster' : parseTab(from);
    const rep = await getEmbedReaderReport(note_id, readerId, fromTab);
    if (!rep) notFound();
    return (
      <EmbedAnalyticsShell>
        <EmbedReaderReportView data={rep} />
      </EmbedAnalyticsShell>
    );
  }

  if (tab === 'roster' || tab === 'readers') {
    const data = await getEmbedNoteReaders(note_id, scopeParam);
    if (!data) notFound();
    return (
      <EmbedAnalyticsShell>
        <EmbedNoteView header={data} tab={tab} readers={data} />
      </EmbedAnalyticsShell>
    );
  }

  const data = await getEmbedAnalyticsNote(note_id, scopeParam);
  if (!data) notFound();
  return (
    <EmbedAnalyticsShell>
      <EmbedNoteView
        header={data}
        tab={tab}
        blocks={data.blocks}
        openItemId={firstOrNull(q)}
      />
    </EmbedAnalyticsShell>
  );
}
