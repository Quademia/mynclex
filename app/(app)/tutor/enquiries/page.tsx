// mynclex/app/(app)/tutor/enquiries/page.tsx
//
// The global tutor Enquiries inbox — every lead across ALL the tutor's
// programmes in one place (peer of the global /tutor/payments ledger).
// Reuses the per-programme inbox panel.
//
// The PROGRAMME scope is URL-driven (?programme=<id>): the header picker
// navigates, and the server re-reads the param to refocus BOTH the summary
// cards and the list to that programme (or all). This makes the scope
// deep-linkable — in-context entry points open it pre-scoped — and keeps the
// cards honest (they follow the programme scope, never the list's chips/
// search). "All programmes" shows the cross-programme view + a programme
// column on each row.
//
// No migration / service-role: RLS scopes the read to owned programmes; the
// parent (app)/tutor/layout.tsx holds the TUTOR role gate. The per-programme
// tab was folded into this inbox (2026-06-25) — its old route is now a
// redirect shim to /tutor/enquiries?programme=<id>.

import { getEnquiriesForTutor } from '@/lib/enquiries/queries';
import { computeTutorStats } from '@/lib/enquiries/aggregations';
import { getMyProgrammes } from '@/lib/programmes/queries';
import { EnquiriesPanel } from '@/lib/enquiries/enquiries-panel';
import { ProgrammeScopePicker } from '@/lib/enquiries/programme-scope-picker';

export const dynamic = 'force-dynamic';

export default async function TutorEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ programme?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawProgramme =
    typeof sp.programme === 'string'
      ? sp.programme
      : Array.isArray(sp.programme)
        ? sp.programme[0]
        : undefined;

  const [allEnquiries, myProgrammes] = await Promise.all([
    getEnquiriesForTutor(),
    getMyProgrammes(),
  ]);

  // Picker list — all the tutor's live programmes (+ any that still hold a
  // lead even if archived), so scoping never hides one.
  const progMap = new Map<string, string>();
  for (const p of myProgrammes) {
    if (p.status !== 'ARCHIVED') progMap.set(p.programme_id, p.title);
  }
  for (const e of allEnquiries) {
    if (!progMap.has(e.programme_id)) progMap.set(e.programme_id, e.programme_title);
  }
  const programmes = [...progMap.entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  // Validate the URL scope against the tutor's own programmes (an unknown id
  // falls back to "all"). null = all programmes.
  const selectedId = rawProgramme && progMap.has(rawProgramme) ? rawProgramme : null;
  const selectedTitle = selectedId ? progMap.get(selectedId)! : null;

  // Scope the data AND the summary cards to the chosen programme (or all).
  const enquiries = selectedId
    ? allEnquiries.filter((e) => e.programme_id === selectedId)
    : allEnquiries;
  const stats = computeTutorStats(enquiries);

  const leadCount = enquiries.length;

  return (
    <div className="ti-page">
      <header className="pp-page-head ti-page-head">
        <h1 className="pp-page-title">Enquiries</h1>
        {programmes.length > 1 && (
          <ProgrammeScopePicker current={selectedId ?? 'ALL'} programmes={programmes} />
        )}
      </header>

      {/* Scope strip — makes "what am I viewing" unmissable: current scope +
          lead count on the left, the channel tip on the right (stacks on
          mobile). */}
      <div className="ti-scope-strip">
        <span className="ti-scope-strip-main">
          <svg
            className="ti-scope-strip-ic"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m2 7 10 6 10-6" />
          </svg>
          <span className="ti-scope-strip-view">
            {selectedTitle ? (
              <>
                Showing: <strong>{selectedTitle}</strong>
              </>
            ) : (
              <>
                Showing <strong>all programmes</strong>
              </>
            )}
          </span>
          <span className="ti-scope-strip-count">
            · {leadCount} {leadCount === 1 ? 'lead' : 'leads'}
          </span>
        </span>
        <span className="ti-scope-strip-tip">
          WhatsApp replies under 4 hours convert ~3× more often.
        </span>
      </div>

      <EnquiriesPanel
        enquiries={enquiries}
        stats={stats}
        showProgramme={selectedId === null}
        emptyMessage={selectedTitle ? `No enquiries for ${selectedTitle} yet.` : undefined}
      />
    </div>
  );
}
