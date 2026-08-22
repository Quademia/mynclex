// mynclex/app/(app)/admin/applications/page.tsx
//
// The tutor applications queue — tutor-onboarding sub-slice 2b. Replaces
// the 20-line <Placeholder> that stood here since the admin nav scaffold.
// Plan: docs/product-plan/tutor-onboarding.md §8, §9, §11 → Slice 2;
// design from the Claude Design handoff "Admin — Tutors & Tutor
// Applications" (2026-08-21).
//
// ⚠ THE PLACEHOLDER PROMISED THE WRONG THING. It described this page as
// "approve + trigger setup-link email". There is no setup link here: an
// applicant either already had an account or created one with their own
// password on the way in (§5, as re-cut 2026-08-22), so approval sends
// tutor.application_approved and nothing else. Setup links belong to
// slice 3's invite path, which is the only doorway that makes an account
// for somebody who was not there.
//
// ⚠ It is built BEFORE the door that fills it (2a-i), which inverts the
// plan's order deliberately: a queue waiting for applications is
// harmless, while applications arriving with nothing able to decide them
// are dead letters. Until 2a-i lands, the only way a PENDING row exists
// is a seeded one.

import { requireAdminPermission, PERM_TUTORS_MANAGE } from '@/lib/access';
import { loadTutorApplications } from '@/lib/tutors/queries';
import { AdminApplicationsBoard } from './admin-applications-board';

export const dynamic = 'force-dynamic';

export default async function AdminApplicationsPage() {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  const { rows, stats } = await loadTutorApplications();

  return (
    <main className="ao-page">
      <AdminApplicationsBoard rows={rows} stats={stats} />
    </main>
  );
}
