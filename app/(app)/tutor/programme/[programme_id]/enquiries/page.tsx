// mynclex/app/(app)/tutor/programme/[programme_id]/enquiries/page.tsx
//
// Redirect shim — the per-programme Enquiries tab was folded into the global
// /tutor/enquiries inbox (2026-06-25). Old links + the admin board's "open in
// tutor view ↗" forward here and get sent to the global inbox PRE-SCOPED to
// this programme (?programme=<id>). The global page validates the id and
// falls back to "all programmes" if it's unknown, so no lookup is needed here.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProgrammeEnquiriesRedirect({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  redirect(`/tutor/enquiries?programme=${programme_id}`);
}
