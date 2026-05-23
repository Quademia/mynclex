// mynclex/app/(app)/tutor/programme/[programme_id]/enquiries/page.tsx
//
// Tutor enquiry queue (Slice 8 — V1 polished inbox). One DB read; the
// stats strip + list + detail all derive from the same `enquiries[]`
// array. Stats are computed server-side from the rows so the bundle
// stays lean; the panel still re-derives on filter changes client-side.
//
// Always present in the sidebar regardless of programme config — even
// programmes that don't currently surface a Contact form might
// historically have one, or might be configured to surface one later.

import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getEnquiriesForProgramme } from '@/lib/enquiries/queries';
import { computeTutorStats } from '@/lib/enquiries/aggregations';
import { EnquiriesPanel } from './enquiries-panel';

export const dynamic = 'force-dynamic';

export default async function ProgrammeEnquiriesPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  // The shell already 404s on missing/not-yours via getProgrammeForShell,
  // but a hand-typed URL into the page itself bypasses that — recheck.
  const programme = await getProgrammeForShell(programme_id);
  if (!programme) return null;

  const enquiries = await getEnquiriesForProgramme(programme_id);
  const stats = computeTutorStats(enquiries);

  return (
    <div className="pp-page">
      <header className="pp-page-head">
        <h1 className="pp-page-title">Enquiries</h1>
        <p className="pp-page-sub">
          Leads from your programme&apos;s public Contact form. WhatsApp is
          the fastest channel for this audience — replies under 4 hours
          convert ~3× more often.
        </p>
      </header>

      <EnquiriesPanel
        programmeId={programme_id}
        enquiries={enquiries}
        stats={stats}
      />
    </div>
  );
}
