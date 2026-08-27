// mynclex/app/(app)/tutor/cohort/[cohort_id]/[[...rest]]/page.tsx
//
// Redirect shim — the old cohort workspace's URLs forward to the
// folded surface (cohort-workspace fold, 2026-06-12): the run's
// in-page detail on the programme Cohorts page. Catches the bare
// cohort root AND every old tab segment, so bookmarks survive.
//
//   /tutor/cohort/<id>                → ?cohort=<id>            (overview)
//   /tutor/cohort/<id>/curriculum     → ?cohort=<id>&tab=curriculum
//   /tutor/cohort/<id>/sessions       → ?cohort=<id>&tab=sessions
//   /tutor/cohort/<id>/settings       → ?cohort=<id>&tab=settings
//   /tutor/cohort/<id>/overview       → ?cohort=<id>            (default)
//   /tutor/cohort/<id>/analytics      → ?cohort=<id>  (folded into Overview)
//   /tutor/cohort/<id>/announcements  → ?cohort=<id>  (tab dropped)
//
// ⚠ The lookup below is NOT scoped to the tutor's own cohorts, though
// this used to say RLS made it so. nclex_cohorts carries a student
// policy and a FOR-ALL admin policy, so a cohort you are merely
// enrolled on resolves here and discloses its programme id.
//
// It is left as a plain readability check on purpose: this file only
// forwards, and the destination is properly gated — the Cohorts page
// runs getOwnedProgrammeForShell and 404s for a programme that isn't
// yours. So a foreign cohort gets one redirect and then a 404, not a
// screen. Unknown ids and malformed UUIDs 404 here.
//
// ⓘ If this shim ever grows into something that RENDERS, it needs a
// real owner check first. Noted 2026-08-27.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Old tab segments that exist as tabs on the folded surface; anything
// else (overview, analytics [now folded into Overview], announcements, junk)
// falls back to the default tab.
const CARRIED_TABS = new Set(['curriculum', 'sessions', 'settings']);

export default async function TutorCohortRedirectPage({
  params,
}: {
  params: Promise<{ cohort_id: string; rest?: string[] }>;
}) {
  const { cohort_id, rest } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_cohorts')
    .select('programme_id')
    .eq('cohort_id', cohort_id)
    .maybeSingle();
  if (!data) notFound();

  const segment = rest?.[0] ?? '';
  const tab = CARRIED_TABS.has(segment) ? `&tab=${segment}` : '';
  redirect(
    `/tutor/programme/${(data as { programme_id: string }).programme_id}/cohorts?cohort=${cohort_id}${tab}`
  );
}
