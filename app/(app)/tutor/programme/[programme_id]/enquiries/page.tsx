// mynclex/app/(app)/tutor/programme/[programme_id]/enquiries/page.tsx
//
// Tutor enquiry queue (Slice 8b). Lists the programme's lead-capture
// rows from Slice 8a; lets the tutor mark Forwarded / Closed and edit
// admin notes. The list is RLS-scoped to the tutor's own programmes;
// a programme they don't own returns no rows (the layout itself 404s
// first via getProgrammeForShell).
//
// Always present in the sidebar regardless of programme config — even
// programmes that don't currently surface a Contact form might
// historically have one, or might be configured to surface one later.

import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getEnquiriesForProgramme } from '@/lib/enquiries/queries';
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

  return (
    <div className="pp-page">
      <header className="pp-page-head">
        <h1 className="pp-page-title">Enquiries</h1>
        <p className="pp-page-sub">
          Leads from students who used the Contact form on your
          programme&apos;s public page. Reach out through their preferred
          channel, then mark the lead as Forwarded so you know what
          you&apos;ve already handled.
        </p>
      </header>

      <EnquiriesPanel
        programmeId={programme_id}
        enquiries={enquiries}
      />
    </div>
  );
}
